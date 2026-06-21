import subprocess
import sys
from pathlib import Path


def test_check_timeouts_exits_zero_with_current_allowlist():
    repo = Path(__file__).resolve().parents[2]
    result = subprocess.run(
        [sys.executable, str(repo / "scripts/check_timeouts.py")],
        capture_output=True,
        text=True,
        cwd=repo,
    )
    assert result.returncode == 0, f"stderr={result.stderr}\nstdout={result.stdout}"


def test_check_timeouts_fails_on_new_uninstrumented_call(tmp_path):
    repo = Path(__file__).resolve().parents[2]
    test_target = tmp_path / "bad.py"
    test_target.write_text("async def x():\n    await redis.get('k')\n")
    result = subprocess.run(
        [
            sys.executable,
            str(repo / "scripts/check_timeouts.py"),
            "--root",
            str(tmp_path),
        ],
        capture_output=True,
        text=True,
        cwd=repo,
    )
    assert result.returncode != 0
    assert "bad.py" in result.stdout + result.stderr
