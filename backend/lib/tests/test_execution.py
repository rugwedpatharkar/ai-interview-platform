import os

import pytest
from lib.execution import ExecLimits, run_code

posix_only = pytest.mark.skipif(os.name != "posix", reason="executor is POSIX-only")


@posix_only
async def test_runs_and_captures_stdout():
    r = await run_code("python", "print(1 + 2)")
    assert r.stdout.strip() == "3"
    assert r.exit_code == 0 and r.timed_out is False


@posix_only
async def test_feeds_stdin():
    r = await run_code("python", "import sys; print(sys.stdin.read().upper())", "hi")
    assert r.stdout.strip() == "HI"


@posix_only
async def test_nonzero_exit_propagates():
    r = await run_code("python", "raise SystemExit(3)")
    assert r.exit_code == 3


@posix_only
async def test_wall_timeout_kills():
    r = await run_code(
        "python", "import time; time.sleep(30)", limits=ExecLimits(wall_seconds=0.5)
    )
    assert r.timed_out is True and r.exit_code != 0


@posix_only
async def test_environment_is_scrubbed_of_secrets(monkeypatch):
    # A secret in the PARENT env must never be visible to the child.
    monkeypatch.setenv("JWT_SECRET", "super-secret")
    r = await run_code(
        "python", "import os; print(os.environ.get('JWT_SECRET', 'NONE'))"
    )
    assert r.stdout.strip() == "NONE"


@posix_only
async def test_output_is_truncated():
    r = await run_code(
        "python", "print('x' * 1000)", limits=ExecLimits(output_bytes=100)
    )
    assert len(r.stdout) <= 100


@posix_only
async def test_unsupported_language_raises():
    with pytest.raises(ValueError):
        await run_code("rust", "fn main(){}")


@posix_only
async def test_flooding_output_is_bounded_not_oom():
    # A child that prints forever returns truncated output and the call completes
    # promptly (bounded read — the parent never buffers the whole flood).
    r = await run_code(
        "python",
        "import sys\nwhile True: sys.stdout.write('x' * 4096)\n",
        limits=ExecLimits(output_bytes=1000, cpu_seconds=1, wall_seconds=3.0),
    )
    assert len(r.stdout) <= 1000
    assert r.exit_code != 0  # killed once it blew the output cap
