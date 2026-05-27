"""End-to-end integration test for run.py.

Skipped by default — opt in with ``RUN_LAUNCHER_INTEGRATION=1`` so the regular
``pytest`` invocation stays fast. Requires ports 8000 and 5173 to be free,
``.venv`` populated, and ``frontend/node_modules`` installed.
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parent.parent

pytestmark = pytest.mark.skipif(
    not os.environ.get("RUN_LAUNCHER_INTEGRATION"),
    reason="set RUN_LAUNCHER_INTEGRATION=1 to run the live launcher integration test",
)


def test_launcher_boots_and_exits_cleanly() -> None:
    proc = subprocess.run(
        [sys.executable, str(PROJECT_ROOT / "run.py"),
         "--no-data", "--no-browser", "--exit-after-health"],
        cwd=str(PROJECT_ROOT),
        capture_output=True,
        text=True,
        timeout=180,
    )
    assert proc.returncode == 0, (
        f"launcher exited with {proc.returncode}\n"
        f"--- stdout ---\n{proc.stdout}\n"
        f"--- stderr ---\n{proc.stderr}\n"
    )
    assert "Reachable: http://127.0.0.1:8000/healthz" in proc.stdout
    assert "Reachable: http://localhost:5173" in proc.stdout
    assert "Both servers healthy" in proc.stdout
