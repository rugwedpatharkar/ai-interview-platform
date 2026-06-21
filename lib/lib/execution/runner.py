"""Hardened in-process code executor — runs untrusted candidate code as a
resource-limited subprocess. Stdlib only; no hosted API, no container.

SECURITY MODEL (read before editing):
- CODE LEVEL (this module): the child runs with CPU/mem/output rlimits, a hard
  wall-clock kill, an environment scrubbed of every secret (only PATH/HOME/LANG),
  an isolated temp cwd, and its own session so the whole tree can be killed. A
  crash, OOM, or infinite loop cannot take down the parent.
- DEPLOY LEVEL (NOT here — see A6-EXECUTION-SECURITY.md): this module does NOT block
  network or arbitrary filesystem reads. Run it where (a) secrets are env-only (the
  scrub then protects them) and never file-mounted, (b) a deny-egress NetworkPolicy +
  a seccomp deny-socket profile are in force, and (c) cgroup mem/PID limits cap the
  process tree (the authoritative caps over the coarse rlimits set here). POSIX only.
"""

import asyncio
import contextlib
import os
import resource
import signal
import sys
import tempfile
import time
from dataclasses import dataclass

from lib.logging import get_logger

log = get_logger(component="execution")


@dataclass(frozen=True)
class ExecLimits:
    cpu_seconds: int = 2  # RLIMIT_CPU (CPU time, not wall)
    mem_bytes: int = 512 * 1024 * 1024  # RLIMIT_AS (Linux) — cgroup is authoritative
    wall_seconds: float = 5.0  # parent-enforced wall clock → SIGKILL the group
    output_bytes: int = 64 * 1024  # captured stdout/stderr cap (+ RLIMIT_FSIZE)


@dataclass(frozen=True)
class ExecResult:
    stdout: str
    stderr: str
    exit_code: int
    time_ms: int
    timed_out: bool


# Whitelisted runtimes only — the interpreter is resolved to an absolute path so the
# child needs no inherited PATH. Add languages HERE, never from the request.
_LANGS: dict[str, list[str]] = {"python": [sys.executable, "-I", "-S"]}
_DEFAULT_LIMITS = ExecLimits()


def _apply_limits(limits: ExecLimits):
    # Runs in the child between fork and exec (POSIX). A raise here aborts the exec.
    def _preexec():
        resource.setrlimit(
            resource.RLIMIT_CPU, (limits.cpu_seconds, limits.cpu_seconds)
        )
        resource.setrlimit(
            resource.RLIMIT_FSIZE, (limits.output_bytes, limits.output_bytes)
        )
        resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
        # RLIMIT_AS is enforced reliably on Linux; macOS reserves a large virtual
        # address space at interpreter startup, so capping it there breaks the child.
        # Prod is Linux; the authoritative memory cap is the deploy cgroup regardless.
        # RLIMIT_NPROC is deliberately NOT set: it is per-UID, so an absolute cap breaks
        # the interpreter on a shared dev/CI UID — fork bombs are bounded by the
        # wall-clock killpg below and the deploy cgroup pids.max.
        if sys.platform == "linux":
            resource.setrlimit(resource.RLIMIT_AS, (limits.mem_bytes, limits.mem_bytes))

    return _preexec


def _write_source(path: str, source: str) -> None:
    with open(path, "w") as f:
        f.write(source)


def _truncate(b: bytes, n: int) -> str:
    return b[:n].decode("utf-8", "replace")


async def _feed_and_read(proc, stdin: str, cap: int):
    """Write stdin, then read stdout/stderr BOUNDED to cap+1 bytes each. Bounding the
    read (vs communicate(), which buffers everything) means a child that floods output
    can never exhaust the parent's memory."""
    if proc.stdin is not None:
        with contextlib.suppress(Exception):
            proc.stdin.write(stdin.encode())
            await proc.stdin.drain()
            proc.stdin.close()
    out = await proc.stdout.read(cap + 1)
    if len(out) > cap:
        # Output exceeded the cap — kill the group now so a flooding child can't keep
        # producing and can't block the stderr read (its pipe then EOFs immediately).
        # macOS sandbox blocks process-group signals with PermissionError (EPERM).
        with contextlib.suppress(ProcessLookupError, PermissionError):
            os.killpg(proc.pid, signal.SIGKILL)
    err = await proc.stderr.read(cap + 1)
    return out, err


async def run_code(
    language: str, source: str, stdin: str = "", *, limits: ExecLimits | None = None
) -> ExecResult:
    if os.name != "posix":
        raise RuntimeError("code execution requires a POSIX host")
    argv = _LANGS.get(language)
    if argv is None:
        raise ValueError(f"unsupported language: {language}")
    limits = limits or _DEFAULT_LIMITS
    with tempfile.TemporaryDirectory(prefix="exec-") as tmp:
        src_path = os.path.join(tmp, "main.py")
        await asyncio.to_thread(_write_source, src_path, source)
        # Scrubbed env: only what an interpreter needs — NO inherited secrets.
        env = {"PATH": "/usr/bin:/bin", "HOME": tmp, "LANG": "C.UTF-8"}
        t0 = time.monotonic()
        proc = await asyncio.create_subprocess_exec(
            *argv,
            src_path,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=tmp,
            env=env,
            preexec_fn=_apply_limits(limits),
            start_new_session=True,  # own process group → killpg on timeout
        )
        timed_out = False
        try:
            out, err = await asyncio.wait_for(
                _feed_and_read(proc, stdin, limits.output_bytes),
                timeout=limits.wall_seconds,
            )
        except TimeoutError:
            timed_out = True
            out, err = b"", b""
        # Always SIGKILL the group + reap: the child may still be alive (it timed out,
        # or it flooded output and is blocked writing to a full pipe after our bounded
        # read). A bounded read means a runaway printer can never OOM the parent.
        # macOS sandbox blocks process-group signals with PermissionError (EPERM).
        with contextlib.suppress(ProcessLookupError, PermissionError):
            os.killpg(proc.pid, signal.SIGKILL)
        with contextlib.suppress(Exception):
            await asyncio.wait_for(proc.wait(), timeout=1.0)
        time_ms = int((time.monotonic() - t0) * 1000)
        code = proc.returncode if proc.returncode is not None else -1
        return ExecResult(
            stdout=_truncate(out or b"", limits.output_bytes),
            stderr=_truncate(err or b"", limits.output_bytes),
            exit_code=code,
            time_ms=time_ms,
            timed_out=timed_out,
        )
