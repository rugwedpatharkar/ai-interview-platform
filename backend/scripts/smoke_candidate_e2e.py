"""Candidate happy-path E2E against a running stack.

Runs, in order:
  1. RegisterCandidate            (creates a fresh candidate; email_verified=False)
  2. flip_email_verified          (direct Mongo write — skip the SMTP dance)
  3. Login                        (mints access + refresh tokens)
  4. SearchJobs (public)          (marketplace read; no auth needed)
  5. Apply                        (creates an application; state=applied)
  6. ListMyApplications           (verify the state)
  7. GetAptitudeTest              (materialises the aptitude delivery)
  8. SubmitAptitude               (uses fake all-zero answers; server grades)

Every step returns/asserts. Fails fast with a non-zero exit + a labeled error.
Not meant for CI — it drives real Mongo/Redis/RabbitMQ + hits Gemini for the
aptitude-bank build path if the target job's bank isn't already cached.

Run: `python backend/scripts/smoke_candidate_e2e.py`
"""

import asyncio
import os
import struct
import subprocess
import sys
import uuid
from pathlib import Path

import httpx

_ADMIN = str(Path(__file__).resolve().parent.parent / "services" / "admin")
sys.path.insert(0, _ADMIN)

from app.routes.pb import (  # noqa: E402
    application_pb2,
    aptitude_pb2,
    auth_pb2,
    discovery_pb2,
)

_BASE = os.environ.get("ADMIN_URL", "http://localhost:8080")
_PW = "CandE2E-Password-1"


def _frame(msg: bytes) -> bytes:
    return b"\x00" + struct.pack(">I", len(msg)) + msg


def _parse(body: bytes):
    data, status, message = None, None, ""
    i = 0
    while i + 5 <= len(body):
        flag = body[i]
        (n,) = struct.unpack(">I", body[i + 1 : i + 5])
        chunk = body[i + 5 : i + 5 + n]
        if flag & 0x80:
            for line in chunk.decode().replace("\r\n", "\n").splitlines():
                if line.startswith("grpc-status:"):
                    status = int(line.split(":", 1)[1])
                elif line.startswith("grpc-message:"):
                    message = line.split(":", 1)[1]
        else:
            data = chunk
        i += 5 + n
    return data, status, message


async def _call(client, svc_path, method, request, token=None):
    headers = {"content-type": "application/grpc-web+proto"}
    if token:
        headers["authorization"] = f"Bearer {token}"
    resp = await client.post(
        f"{_BASE}{svc_path}/{method}",
        content=_frame(request.SerializeToString()),
        headers=headers,
    )
    data, status, message = _parse(resp.content)
    if status != 0:
        raise SystemExit(f"FAIL {svc_path}/{method}: grpc-status={status} {message!r}")
    return data


def _flip_verified(email: str) -> None:
    """Direct Mongo write: mark the candidate's email_verified so login works
    without the SMTP + click-link dance."""
    cmd = [
        "docker",
        "exec",
        "interview-platform-mongo-1",
        "mongosh",
        "--quiet",
        "--eval",
        f'db.getSiblingDB("interview_platform").users.updateOne('
        f'{{email: "{email}"}}, {{$set: {{email_verified: true, status: "active"}}}})',
    ]
    result = subprocess.run(cmd, check=True, capture_output=True, text=True)
    if '"modifiedCount": 1' not in result.stdout:
        # Modern mongosh format prints ok:1, matchedCount:1, modifiedCount:1
        if "matchedCount: 1" not in result.stdout:
            raise SystemExit(
                f"FAIL flip_verified: no match for {email}\n{result.stdout}"
            )


async def _main() -> None:
    email = f"cand-e2e+{uuid.uuid4().hex[:10]}@example.com"
    print(f"smoke_candidate_e2e: {_BASE}, candidate={email}")

    async with httpx.AsyncClient(timeout=30) as client:
        # 1. Register
        user_bytes = await _call(
            client,
            "/admin.auth.v1.AuthService",
            "RegisterCandidate",
            auth_pb2.RegisterCandidateRequest(email=email, password=_PW),
        )
        user = auth_pb2.UserResponse.FromString(user_bytes)
        print(f"  RegisterCandidate  -> id={user.id} verified={user.email_verified}")

        # 2. Flip email_verified (bypass SMTP)
        _flip_verified(email)
        print("  flip_email_verified -> ok")

        # 3. Login
        token_bytes = await _call(
            client,
            "/admin.auth.v1.AuthService",
            "Login",
            auth_pb2.LoginRequest(email=email, password=_PW),
        )
        tokens = auth_pb2.TokenResponse.FromString(token_bytes)
        if tokens.mfa_required or not tokens.access_token:
            raise SystemExit(f"FAIL Login: mfa_required={tokens.mfa_required}")
        access = tokens.access_token
        print(f"  Login              -> access={len(access)}b")

        # 4. SearchJobs (public — no auth)
        search_bytes = await _call(
            client,
            "/admin.discovery.v1.DiscoveryService",
            "SearchJobs",
            discovery_pb2.SearchJobsRequest(q="", page=1, page_size=10),
            token=access,  # authed candidates also allowed
        )
        search = discovery_pb2.SearchJobsResponse.FromString(search_bytes)
        if not search.jobs:
            raise SystemExit("FAIL SearchJobs: no published jobs to apply to")
        job = search.jobs[0]
        print(
            f"  SearchJobs         -> {len(search.jobs)} jobs, target={job.title!r} id={job.job_id}"
        )

        # 5. Apply
        apply_bytes = await _call(
            client,
            "/admin.application.v1.ApplicationService",
            "Apply",
            application_pb2.ApplyRequest(job_id=job.job_id, consent=True),
            token=access,
        )
        app = application_pb2.ApplicationResponse.FromString(apply_bytes)
        print(f"  Apply              -> app={app.application_id} state={app.state}")
        if app.state not in ("applied", "aptitude_pending"):
            raise SystemExit(f"FAIL Apply: unexpected state {app.state!r}")

        # 6. ListMyApplications
        list_bytes = await _call(
            client,
            "/admin.application.v1.ApplicationService",
            "ListMyApplications",
            application_pb2.ListMyApplicationsRequest(),
            token=access,
        )
        my = application_pb2.ApplicationList.FromString(list_bytes)
        if not any(a.application_id == app.application_id for a in my.applications):
            raise SystemExit("FAIL ListMyApplications: fresh app not in list")
        print(f"  ListMyApplications -> {len(my.applications)} apps, mine present")

        # 7. Wait for the funnel consumer to advance state=applied -> aptitude_pending
        # (Apply publishes application.created; admin's funnel handler transitions.)
        state = app.state
        for attempt in range(20):
            if state == "aptitude_pending":
                break
            await asyncio.sleep(0.5)
            list_bytes = await _call(
                client,
                "/admin.application.v1.ApplicationService",
                "ListMyApplications",
                application_pb2.ListMyApplicationsRequest(),
                token=access,
            )
            my = application_pb2.ApplicationList.FromString(list_bytes)
            state = next(
                (
                    a.state
                    for a in my.applications
                    if a.application_id == app.application_id
                ),
                state,
            )
        if state != "aptitude_pending":
            raise SystemExit(
                f"FAIL funnel: state stayed {state!r} after Apply (funnel consumer stalled?)"
            )
        print(f"  funnel advance     -> state={state} (via application.created event)")

        # 8. GetAptitudeTest
        test_bytes = await _call(
            client,
            "/admin.aptitude.v1.AptitudeService",
            "GetAptitudeTest",
            aptitude_pb2.GetTestRequest(application_id=app.application_id),
            token=access,
        )
        test = aptitude_pb2.AptitudeTest.FromString(test_bytes)
        n = len(test.questions)
        print(f"  GetAptitudeTest    -> {n} questions delivered")

        # 8. SubmitAptitude with all-zero answers
        submit_bytes = await _call(
            client,
            "/admin.aptitude.v1.AptitudeService",
            "SubmitAptitude",
            aptitude_pb2.SubmitRequest(
                application_id=app.application_id, answers=[0] * n
            ),
            token=access,
        )
        result = aptitude_pb2.AptitudeResult.FromString(submit_bytes)
        print(f"  SubmitAptitude     -> score={result.score} passed={result.passed}")

        print(
            "PASS candidate-e2e: register -> verify -> login -> search -> apply -> list -> aptitude"
        )


if __name__ == "__main__":
    asyncio.run(_main())
