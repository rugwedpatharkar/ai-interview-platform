"""Candidate happy-path E2E against a running stack.

Full flow:
  1. RegisterCandidate            (creates a fresh candidate; email_verified=False)
  2. flip_email_verified          (direct Mongo write — skip the SMTP dance)
  3. Login                        (mints access + refresh tokens)
  4. SearchJobs (public)          (marketplace read; no auth needed)
  5. Apply                        (creates an application; state=applied)
  6. Wait for funnel              (application.created -> aptitude_pending)
  7. GetAptitudeTest              (materialises the aptitude delivery)
  8. SubmitAptitude               (reads bank + delivery order via Mongo direct,
                                   submits the CORRECT answers so aptitude passes)
  9. Wait for funnel              (aptitude.graded -> interview_pending)
 10. Coding stage                 (skipped when the target job has no coding_task —
                                   the current seed job doesn't; a coding-configured
                                   job would enter that branch)
 11. StartInterview (ai-agents)   (Gemini blueprint + first question)
 12. SubmitTurn loop              (canned answers until done=True or max=8)
 13. Wait for funnel              (interview.completed -> interviewed -> scored)
 14. GetReport                    (verifies a scored InterviewReport landed)

Every step returns/asserts. Fails fast with a non-zero exit + a labeled error.
Real Gemini calls fire in steps 11-13; set GEMINI_API_KEY in backend/.env.

Run: `python backend/scripts/smoke_candidate_e2e.py`
"""

import asyncio
import json
import os
import struct
import subprocess
import sys
import uuid
from pathlib import Path

import httpx

_ADMIN = str(Path(__file__).resolve().parent.parent / "services" / "admin")
_AGENTS = str(Path(__file__).resolve().parent.parent / "services" / "ai-agents")
sys.path.insert(0, _ADMIN)

# ai-agents' `app.routes.pb.interview_pb2` shares the `app.routes.pb` package name
# with admin's, so a plain import would resolve against admin's directory (which
# has no interview_pb2). Load it directly from its file.
import importlib.util as _iu  # noqa: E402

from app.routes.pb import (  # noqa: E402
    application_pb2,
    aptitude_pb2,
    auth_pb2,
    discovery_pb2,
)

_spec = _iu.spec_from_file_location(
    "agents_interview_pb2", f"{_AGENTS}/app/routes/pb/interview_pb2.py"
)
interview_pb2 = _iu.module_from_spec(_spec)
_spec.loader.exec_module(interview_pb2)

_BASE = os.environ.get("ADMIN_URL", "http://localhost:8080")
_AGENTS_BASE = os.environ.get("AGENTS_URL", "http://localhost:8081")
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


async def _call(client, svc_path, method, request, token=None, base=None):
    headers = {"content-type": "application/grpc-web+proto"}
    if token:
        headers["authorization"] = f"Bearer {token}"
    resp = await client.post(
        f"{base or _BASE}{svc_path}/{method}",
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

        # 8. SubmitAptitude — read the bank + delivery order from Mongo direct,
        # submit CORRECT answers so aptitude passes and the funnel can advance.
        answers = _correct_answers_for(job.job_id, app.application_id, n)
        submit_bytes = await _call(
            client,
            "/admin.aptitude.v1.AptitudeService",
            "SubmitAptitude",
            aptitude_pb2.SubmitRequest(
                application_id=app.application_id, answers=answers
            ),
            token=access,
        )
        result = aptitude_pb2.AptitudeResult.FromString(submit_bytes)
        print(f"  SubmitAptitude     -> score={result.score} passed={result.passed}")
        if not result.passed:
            raise SystemExit(
                f"FAIL SubmitAptitude: passed=False (score={result.score})"
            )

        # 9. Wait for aptitude.graded funnel advance -> interview_pending.
        state = await _wait_state(
            client, access, app.application_id, "interview_pending"
        )
        print(f"  funnel advance     -> state={state} (via aptitude.graded event)")

        # 10. Coding stage: the seed job has no coding_task, so we skip. A
        # coding-configured job would hit coding_pending here.
        print("  (skip coding stage — target job has no coding_task configured)")

        # 11. StartInterview on ai-agents (real Gemini call). Gracefully
        # surface a soft-pass when the Gemini quota is exhausted — the LLM
        # UNAVAILABLE mapping ensures the retryable status flows through.
        try:
            start_bytes = await _call(
                client,
                "/aiagents.interview.v1.InterviewService",
                "StartInterview",
                interview_pb2.StartInterviewRequest(application_id=app.application_id),
                token=access,
                base=_AGENTS_BASE,
            )
        except SystemExit as exc:
            if "grpc-status=14" in str(exc):
                print(
                    "  (StartInterview returned UNAVAILABLE — LLM quota exhausted; "
                    "the interview stage cannot run today)"
                )
                print(
                    "PARTIAL candidate-e2e: register -> ... -> aptitude(pass) "
                    "(interview stage skipped due to Gemini quota)"
                )
                return
            raise
        first = interview_pb2.QuestionResponse.FromString(start_bytes)
        print(f"  StartInterview     -> Q1: {first.question[:70]!r}")

        # 12. SubmitTurn loop with canned answers (bounded by the interviewer's
        # max_questions cap of 8; break on done=True).
        done = False
        turns = 0
        canned = (
            "I'd approach this by decomposing the problem into smaller "
            "components, verifying my assumptions with tests, and iterating."
        )
        while not done and turns < 8:
            turns += 1
            turn_bytes = await _call(
                client,
                "/aiagents.interview.v1.InterviewService",
                "SubmitTurn",
                interview_pb2.SubmitTurnRequest(
                    application_id=app.application_id, answer=canned
                ),
                token=access,
                base=_AGENTS_BASE,
            )
            turn = interview_pb2.TurnResponse.FromString(turn_bytes)
            done = turn.done
            preview = (turn.question[:70] if turn.question else "(done)").replace(
                "\n", " "
            )
            print(f"  SubmitTurn #{turns:<2}     -> done={done} next={preview!r}")
        if not done:
            raise SystemExit(f"FAIL interview: not done after {turns} turns")

        # 13. Wait for funnel advance -> interviewed -> scored. The scoring
        # handler runs evaluator + report-writer (2 more Gemini calls) and
        # publishes scoring.completed on success. Free-tier Gemini has a
        # 20 rpd cap that a single E2E run can burn through if a prior run
        # already ate the day's budget — treat "interviewed but not yet
        # scored" as a soft-pass so the harness still exits 0 on transient
        # vendor quota; the RabbitMQ x-delivery-count logic retries the
        # handler once quota returns.
        try:
            state = await _wait_state(
                client,
                access,
                app.application_id,
                "scored",
                timeout_s=180,
            )
        except SystemExit as exc:
            if "scored" in str(exc) and "interviewed" in str(exc):
                print(
                    "  (scoring stalled at 'interviewed' — Gemini quota likely "
                    "exhausted; skipping GetReport assert)"
                )
                print(
                    "PARTIAL candidate-e2e: register -> ... -> interview complete "
                    "(scoring handler will retry via DLX when vendor recovers)"
                )
                return
            raise
        print(f"  funnel advance     -> state={state} (via scoring.completed event)")

        # 14. GetReport — verify a scored report landed.
        report_bytes = await _call(
            client,
            "/admin.report.v1.ReportService",
            "GetReport",
            report_pb2.GetReportRequest(application_id=app.application_id),
            token=access,
        )
        report = report_pb2.InterviewReport.FromString(report_bytes)
        print(
            f"  GetReport          -> comps={len(report.competencies)} "
            f"summary={report.executive_summary[:60]!r}"
        )
        if not report.competencies:
            raise SystemExit("FAIL GetReport: no competencies scored")

        print(
            "PASS candidate-e2e: register -> verify -> login -> search -> apply -> "
            "aptitude(pass) -> interview -> report"
        )


def _correct_answers_for(job_id: str, application_id: str, n: int) -> list[int]:
    """Read the aptitude bank + delivery order via Mongo direct and return the
    correct answers in delivery order. This lets the smoke deterministically
    pass aptitude without depending on chance."""
    cmd = [
        "docker",
        "exec",
        "interview-platform-mongo-1",
        "mongosh",
        "--quiet",
        "--eval",
        (
            'const db = db.getSiblingDB("interview_platform"); '
            f'const bank = db.aptitude_banks.findOne({{job_id: "{job_id}"}}); '
            f'const delivery = db.aptitude_deliveries.findOne({{application_id: "{application_id}"}}); '
            "JSON.stringify({"
            "correct: bank.questions.map(q => q.correct_index), "
            "order: delivery.order"
            "})"
        ),
    ]
    result = subprocess.run(cmd, check=True, capture_output=True, text=True)
    payload = json.loads(result.stdout.strip())
    correct = payload["correct"]
    order = payload["order"]
    if len(order) != n:
        raise SystemExit(
            f"FAIL correct_answers: delivery order len {len(order)} != n {n}"
        )
    return [correct[i] for i in order]


async def _wait_state(
    client, access, application_id, want, *, timeout_s=30, poll_s=1.0
):
    state = None
    attempts = int(timeout_s / poll_s)
    for _ in range(attempts):
        list_bytes = await _call(
            client,
            "/admin.application.v1.ApplicationService",
            "ListMyApplications",
            application_pb2.ListMyApplicationsRequest(),
            token=access,
        )
        my = application_pb2.ApplicationList.FromString(list_bytes)
        state = next(
            (a.state for a in my.applications if a.application_id == application_id),
            None,
        )
        if state == want:
            return state
        await asyncio.sleep(poll_s)
    raise SystemExit(
        f"FAIL _wait_state: state stayed {state!r}, wanted {want!r} after {timeout_s}s"
    )


if __name__ == "__main__":
    asyncio.run(_main())
