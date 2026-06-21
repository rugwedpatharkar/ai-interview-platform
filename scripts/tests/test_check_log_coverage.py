import subprocess
import sys
from pathlib import Path


def test_check_log_coverage_passes_with_current_allowlist():
    repo = Path(__file__).resolve().parents[2]
    result = subprocess.run(
        [sys.executable, str(repo / "scripts/check_log_coverage.py")],
        capture_output=True,
        text=True,
        cwd=repo,
    )
    assert result.returncode == 0, f"stderr={result.stderr}\nstdout={result.stdout}"


def test_check_log_coverage_fails_on_new_unwrapped_function(tmp_path):
    repo = Path(__file__).resolve().parents[2]
    target_dir = tmp_path / "resources"
    target_dir.mkdir()
    (target_dir / "x.py").write_text("async def naked_fn():\n    return 1\n")
    result = subprocess.run(
        [
            sys.executable,
            str(repo / "scripts/check_log_coverage.py"),
            "--resources-root",
            str(tmp_path),
        ],
        capture_output=True,
        text=True,
        cwd=repo,
    )
    assert result.returncode != 0
    assert "naked_fn" in result.stdout + result.stderr


def test_check_log_coverage_passes_wrapped_function(tmp_path):
    """A function starting with `async with log_context(...)` is not flagged."""
    repo = Path(__file__).resolve().parents[2]
    target_dir = tmp_path / "resources"
    target_dir.mkdir()
    (target_dir / "good.py").write_text(
        "async def wrapped_fn():\n    async with log_context('x'):\n        return 1\n"
    )
    result = subprocess.run(
        [
            sys.executable,
            str(repo / "scripts/check_log_coverage.py"),
            "--resources-root",
            str(tmp_path),
        ],
        capture_output=True,
        text=True,
        cwd=repo,
    )
    assert result.returncode == 0, f"stderr={result.stderr}\nstdout={result.stdout}"


def test_check_log_coverage_skips_private_functions(tmp_path):
    """Private functions (name starting with _) must not be flagged."""
    repo = Path(__file__).resolve().parents[2]
    target_dir = tmp_path / "resources"
    target_dir.mkdir()
    (target_dir / "private.py").write_text("async def _helper():\n    return 1\n")
    result = subprocess.run(
        [
            sys.executable,
            str(repo / "scripts/check_log_coverage.py"),
            "--resources-root",
            str(tmp_path),
        ],
        capture_output=True,
        text=True,
        cwd=repo,
    )
    assert result.returncode == 0, f"stderr={result.stderr}\nstdout={result.stdout}"


def test_check_log_coverage_skips_init_files(tmp_path):
    """__init__.py files must be skipped entirely."""
    repo = Path(__file__).resolve().parents[2]
    target_dir = tmp_path / "resources"
    target_dir.mkdir()
    (target_dir / "__init__.py").write_text("async def naked_fn():\n    return 1\n")
    result = subprocess.run(
        [
            sys.executable,
            str(repo / "scripts/check_log_coverage.py"),
            "--resources-root",
            str(tmp_path),
        ],
        capture_output=True,
        text=True,
        cwd=repo,
    )
    assert result.returncode == 0, f"stderr={result.stderr}\nstdout={result.stdout}"


def test_check_log_coverage_seed_prints_violations(tmp_path):
    """--seed flag must print violations and exit 0 (even without an allowlist)."""
    repo = Path(__file__).resolve().parents[2]
    target_dir = tmp_path / "resources"
    target_dir.mkdir()
    (target_dir / "x.py").write_text("async def naked_fn():\n    return 1\n")
    result = subprocess.run(
        [
            sys.executable,
            str(repo / "scripts/check_log_coverage.py"),
            "--resources-root",
            str(tmp_path),
            "--seed",
        ],
        capture_output=True,
        text=True,
        cwd=repo,
    )
    assert result.returncode == 0
    assert "naked_fn" in result.stdout
