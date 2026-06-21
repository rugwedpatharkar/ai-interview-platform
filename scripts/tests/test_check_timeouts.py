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


def test_repo_method_call_is_not_flagged(tmp_path):
    repo = Path(__file__).resolve().parents[2]
    bad = tmp_path / "compliance_like.py"
    # Mirrors compliance.py:erase — repo methods that start with delete/insert/etc.
    bad.write_text(
        "class C:\n"
        "    async def x(self, app_id):\n"
        "        await self._reports.delete_by_applications([app_id])\n"
        "        await self._slots.delete_by_applications([app_id])\n"
    )
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
    assert result.returncode == 0, result.stdout + result.stderr


def test_publisher_publish_is_not_flagged(tmp_path):
    repo = Path(__file__).resolve().parents[2]
    bad = tmp_path / "notifier_like.py"
    bad.write_text(
        "class P:\n"
        "    async def notify(self, x):\n"
        "        await self._publisher.publish('routing.key', x)\n"
    )
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
    assert result.returncode == 0, result.stdout + result.stderr


def test_raw_collection_method_is_flagged(tmp_path):
    repo = Path(__file__).resolve().parents[2]
    bad = tmp_path / "raw_pymongo.py"
    bad.write_text(
        "class D:\n"
        "    async def x(self, doc):\n"
        "        await self._profiles.update_one({'_id': 1}, {'$set': doc})\n"
    )
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
    assert "raw_pymongo.py" in result.stdout + result.stderr
