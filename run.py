#!/usr/bin/env python3
"""One-command launcher for QuantBacktest — venv, deps, .env, DB, servers, browser."""

from __future__ import annotations

import argparse
import contextlib
import os
import re
import shutil
import signal
import sqlite3
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
import venv
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
VENV_DIR = ROOT / ".venv"
DEPS_MARKER = VENV_DIR / ".deps_installed_at"
ENV_FILE = ROOT / ".env"
ENV_EXAMPLE = ROOT / ".env.example"
REQUIREMENTS = ROOT / "requirements.txt"
FRONTEND_DIR = ROOT / "frontend"
NODE_MODULES = FRONTEND_DIR / "node_modules"
NODE_MARKER = NODE_MODULES / ".deps_installed_at"
PACKAGE_LOCK = FRONTEND_DIR / "package-lock.json"
SQLITE_DB = ROOT / "quantbacktest.db"
INIT_DB_SCRIPT = ROOT / "scripts" / "init_db.py"
LOAD_DATA_SCRIPT = ROOT / "scripts" / "load_initial_data.py"

BACKEND_URL = "http://127.0.0.1:8000/healthz"
FRONTEND_URL = "http://localhost:5173"
APP_URL = "http://localhost:5173"

PY_MIN = (3, 11)
NODE_MIN = 20

C_RESET = "\033[0m"
C_BACKEND = "\033[36m"
C_FRONTEND = "\033[35m"
C_OK = "\033[32m"
C_WARN = "\033[33m"
C_ERR = "\033[31m"
C_DIM = "\033[2m"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _enable_ansi_on_windows() -> None:
    if sys.platform == "win32":
        os.system("")  # toggles VT processing on Windows 10+


def info(msg: str) -> None:
    print(f"{C_DIM}[run.py]{C_RESET} {msg}", flush=True)


def ok(msg: str) -> None:
    print(f"{C_OK}[run.py]{C_RESET} {msg}", flush=True)


def warn(msg: str) -> None:
    print(f"{C_WARN}[run.py]{C_RESET} {msg}", flush=True)


def fail(msg: str, code: int = 1) -> None:
    print(f"{C_ERR}[run.py]{C_RESET} {msg}", flush=True)
    sys.exit(code)


def venv_python(venv_dir: Path) -> Path:
    if sys.platform == "win32":
        return venv_dir / "Scripts" / "python.exe"
    return venv_dir / "bin" / "python"


def find_executable(name: str) -> str | None:
    found = shutil.which(name)
    if found:
        return found
    if sys.platform == "win32":
        return shutil.which(f"{name}.cmd")
    return None


def read_env(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}
    out: dict[str, str] = {}
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        value = value.strip()
        if value and value[0] in ('"', "'"):
            quote = value[0]
            end = value.find(quote, 1)
            value = value[1:end] if end > 0 else value[1:]
        else:
            for sep in (" #", "\t#"):
                idx = value.find(sep)
                if idx >= 0:
                    value = value[:idx]
                    break
            value = value.rstrip()
        out[key.strip()] = value
    return out


def update_env(path: Path, updates: dict[str, str]) -> None:
    """Replace given KEY=value lines in place; append if absent. Preserves comments."""
    if not path.exists():
        path.write_text("")
    lines = path.read_text().splitlines(keepends=True)
    seen: set[str] = set()
    out: list[str] = []
    pattern = re.compile(r"^\s*([A-Z_][A-Z0-9_]*)\s*=")
    for line in lines:
        m = pattern.match(line)
        if m and m.group(1) in updates:
            key = m.group(1)
            eol = "\n" if line.endswith("\n") else ""
            out.append(f"{key}={updates[key]}{eol}")
            seen.add(key)
        else:
            out.append(line)
    for key, value in updates.items():
        if key not in seen:
            if out and not out[-1].endswith("\n"):
                out.append("\n")
            out.append(f"{key}={value}\n")
    path.write_text("".join(out))


# ---------------------------------------------------------------------------
# Step functions (spec §5)
# ---------------------------------------------------------------------------

def check_prereqs() -> None:
    if sys.version_info < PY_MIN:
        v = ".".join(map(str, sys.version_info[:3]))
        fail(
            f"Python {v} detected, need >= {PY_MIN[0]}.{PY_MIN[1]}. "
            f"Install from https://www.python.org/downloads/"
        )
    node = find_executable("node")
    if not node:
        fail("Node not found on PATH. Install Node 20 from https://nodejs.org/en/download")
    try:
        out = subprocess.run([node, "--version"], capture_output=True, text=True, check=True)
        major = int(out.stdout.strip().lstrip("v").split(".")[0])
    except (subprocess.CalledProcessError, ValueError) as exc:
        fail(f"Could not parse `node --version` output: {exc}")
    if major < NODE_MIN:
        fail(
            f"Node {major} detected, need >= {NODE_MIN}. "
            f"Install from https://nodejs.org/en/download"
        )
    ok(f"Python {'.'.join(map(str, sys.version_info[:2]))} ok · Node {major} ok")


def ensure_venv(reset: bool = False) -> Path:
    if reset and VENV_DIR.exists():
        info(f"Removing {VENV_DIR} (--reset-venv)")
        shutil.rmtree(VENV_DIR)
    if VENV_DIR.exists():
        return venv_python(VENV_DIR)
    info(f"Creating venv at {VENV_DIR}…")
    venv.EnvBuilder(with_pip=True, clear=False).create(VENV_DIR)
    return venv_python(VENV_DIR)


def install_deps(py: Path) -> None:
    if not REQUIREMENTS.exists():
        fail(f"requirements.txt missing at {REQUIREMENTS} — broken checkout?")
    if DEPS_MARKER.exists() and REQUIREMENTS.stat().st_mtime <= DEPS_MARKER.stat().st_mtime:
        return
    if DEPS_MARKER.exists():
        info("requirements.txt changed since last install — re-syncing Python deps…")
    else:
        info("Installing Python dependencies (first run, can take a couple of minutes)…")
    proc = subprocess.run(
        [str(py), "-m", "pip", "install", "-r", str(REQUIREMENTS)],
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        tail = "\n".join((proc.stdout + proc.stderr).splitlines()[-20:])
        fail(
            "pip install failed. Last 20 lines:\n"
            f"{tail}\n"
            "Try manually: source .venv/bin/activate && pip install -r requirements.txt"
        )
    DEPS_MARKER.touch()
    ok("Python deps ready")


def ensure_env_file() -> None:
    if ENV_FILE.exists():
        return
    if not ENV_EXAMPLE.exists():
        fail(".env.example missing — broken checkout?")
    shutil.copy(ENV_EXAMPLE, ENV_FILE)
    info("Created .env from .env.example")


def prompt_for_api_key(reset: bool = False) -> None:
    env = read_env(ENV_FILE)
    if reset:
        update_env(ENV_FILE, {"GEMINI_API_KEY": "", "LLM_ENABLED": "true"})
        env = read_env(ENV_FILE)
    if env.get("GEMINI_API_KEY"):
        return
    if env.get("LLM_ENABLED", "").lower() == "false":
        return
    print()
    print(f"{C_DIM}The AI-generated report uses Google Gemini.{C_RESET}")
    try:
        answer = input("Do you want to set up a Google Gemini API key now? [y/N]: ").strip().lower()
    except (EOFError, KeyboardInterrupt):
        answer = ""
    if answer not in ("y", "yes"):
        update_env(ENV_FILE, {"LLM_ENABLED": "false"})
        warn(
            "AI report disabled. Backtests, charts, and metrics still work.\n"
            "         Run `python run.py --reset-key` to enable it later."
        )
        return
    try:
        import getpass
        key = getpass.getpass("Paste your Gemini API key (input is hidden): ").strip()
    except (EOFError, KeyboardInterrupt):
        key = ""
    if key:
        update_env(ENV_FILE, {"GEMINI_API_KEY": key})
        ok("API key saved to .env (gitignored). Won't ask again.")
    else:
        update_env(ENV_FILE, {"LLM_ENABLED": "false"})
        warn("No key pasted — AI report disabled. Run `python run.py --reset-key` to retry.")


def init_database(py: Path) -> None:
    info("Initializing database schema and seed data…")
    proc = subprocess.run([str(py), str(INIT_DB_SCRIPT)], capture_output=True, text=True)
    if proc.returncode != 0:
        fail(f"init_db.py failed:\n{proc.stderr or proc.stdout}")


def db_has_bars() -> bool:
    if not SQLITE_DB.exists():
        return False
    try:
        with sqlite3.connect(str(SQLITE_DB)) as conn:
            row = conn.execute("SELECT 1 FROM ohlcv_bars LIMIT 1").fetchone()
        return row is not None
    except (sqlite3.Error, OSError):
        return False


def load_data_if_empty(py: Path, force: bool = False, skip: bool = False) -> None:
    if skip:
        return
    if not force and db_has_bars():
        return
    info("Loading historical bars (yfinance + fallbacks) — first-time fetch takes 2-5 min…")
    proc = subprocess.run(
        [str(py), str(LOAD_DATA_SCRIPT), "--timeframes", "1d", "1h"],
        text=True,
    )
    if proc.returncode != 0:
        warn(
            "Bulk data load did not finish cleanly. Backtests on already-loaded assets still work.\n"
            "         Retry later with: python run.py --reload-data"
        )


def install_frontend_deps(npm: str) -> None:
    if not PACKAGE_LOCK.exists():
        fail(f"package-lock.json missing at {PACKAGE_LOCK} — broken checkout?")
    if NODE_MARKER.exists() and PACKAGE_LOCK.stat().st_mtime <= NODE_MARKER.stat().st_mtime:
        return
    if NODE_MARKER.exists():
        info("package-lock.json changed since last install — re-syncing frontend deps…")
    else:
        info("Installing frontend dependencies (first run, can take a minute)…")
    proc = subprocess.run([npm, "install"], cwd=str(FRONTEND_DIR), text=True)
    if proc.returncode != 0:
        fail("npm install failed — see output above. Try: cd frontend && npm install")
    NODE_MARKER.touch()
    ok("Frontend deps ready")


def _stream(proc: subprocess.Popen, prefix: str, color: str) -> None:
    assert proc.stdout is not None
    for line in proc.stdout:
        sys.stdout.write(f"{color}[{prefix}]{C_RESET} {line}")
        sys.stdout.flush()


def start_backend(py: Path) -> subprocess.Popen:
    info("Starting backend (uvicorn)…")
    env = os.environ.copy()
    env["PYTHONUNBUFFERED"] = "1"  # so uvicorn streams line-buffered into our pipe
    proc = subprocess.Popen(
        [str(py), "-m", "uvicorn", "backend.main:app", "--host", "127.0.0.1", "--port", "8000"],
        cwd=str(ROOT),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )
    threading.Thread(target=_stream, args=(proc, "backend", C_BACKEND), daemon=True).start()
    return proc


def start_frontend(npm: str) -> subprocess.Popen:
    info("Starting frontend (vite)…")
    proc = subprocess.Popen(
        [npm, "run", "dev"],
        cwd=str(FRONTEND_DIR),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )
    threading.Thread(target=_stream, args=(proc, "frontend", C_FRONTEND), daemon=True).start()
    return proc


def _http_ok(url: str) -> bool:
    try:
        with urllib.request.urlopen(url, timeout=1.0) as resp:
            return 200 <= resp.status < 400
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, ConnectionError, OSError):
        return False


def _process_name(pid: str) -> str:
    try:
        if sys.platform == "win32":
            out = subprocess.run(
                ["tasklist", "/FI", f"PID eq {pid}", "/FO", "CSV", "/NH"],
                capture_output=True, text=True, timeout=5,
            ).stdout.strip()
            if out:
                return out.splitlines()[0].split(",")[0].strip('"')
        else:
            out = subprocess.run(
                ["ps", "-p", pid, "-o", "comm="],
                capture_output=True, text=True, timeout=5,
            ).stdout.strip()
            if out:
                return out
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass
    return "process name unknown"


def _port_holder(port: int) -> tuple[str, str] | None:
    """Return (pid, process_name) of the listener on `port`, or None if free."""
    try:
        if sys.platform == "win32":
            out = subprocess.run(
                ["netstat", "-ano"], capture_output=True, text=True, timeout=5
            ).stdout
            for line in out.splitlines():
                if f":{port} " in line and "LISTENING" in line:
                    pid = line.split()[-1]
                    return (pid, _process_name(pid))
        else:
            out = subprocess.run(
                ["lsof", "-ti", f":{port}"], capture_output=True, text=True, timeout=5
            ).stdout.strip()
            if out:
                pid = out.splitlines()[0]
                return (pid, _process_name(pid))
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return None
    return None


def check_ports_free(ports: list[int]) -> None:
    held: list[tuple[int, str, str]] = []
    for port in ports:
        holder = _port_holder(port)
        if holder:
            held.append((port, holder[0], holder[1]))
    if not held:
        return
    for port, pid, name in held:
        kill_cmd = (
            f"taskkill /F /PID {pid}" if sys.platform == "win32" else f"kill -9 {pid}"
        )
        print(
            f"{C_ERR}[run.py]{C_RESET} port :{port} is held by PID {pid} ({name}) "
            f"— kill it with `{kill_cmd}`",
            flush=True,
        )
    sys.exit(1)


def wait_for_health(processes: list[subprocess.Popen], timeout: float = 120.0) -> None:
    start = time.monotonic()
    ready = {BACKEND_URL: False, FRONTEND_URL: False}
    while time.monotonic() - start < timeout:
        for p in processes:
            if p.poll() is not None:
                fail(
                    f"A subprocess died before becoming healthy (exit={p.returncode}). "
                    "Check the logs above for the traceback."
                )
        for url in list(ready):
            if not ready[url] and _http_ok(url):
                ready[url] = True
                ok(f"Reachable: {url}")
        if all(ready.values()):
            return
        time.sleep(0.5)
    fail(
        f"Servers did not become healthy within {int(timeout)} s. "
        "Check logs above for clues."
    )


def install_shutdown_handler(processes: list[subprocess.Popen]) -> None:
    def handler(signum, frame):
        print(f"\n{C_DIM}[run.py]{C_RESET} Shutting down…", flush=True)
        for p in processes:
            if p.poll() is None:
                p.terminate()
        for p in processes:
            try:
                p.wait(timeout=5)
            except subprocess.TimeoutExpired:
                p.kill()
        sys.exit(0)

    signal.signal(signal.SIGINT, handler)
    if hasattr(signal, "SIGTERM"):
        signal.signal(signal.SIGTERM, handler)


def open_browser_and_wait(processes: list[subprocess.Popen], no_browser: bool) -> None:
    if not no_browser:
        with contextlib.suppress(Exception):
            webbrowser.open(APP_URL)
    ok(f"Open {APP_URL} · Press Ctrl-C to stop.")
    while True:
        for p in processes:
            if p.poll() is not None:
                fail(f"A subprocess exited unexpectedly (code={p.returncode}).")
        time.sleep(1)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="QuantBacktest one-command launcher.")
    p.add_argument("--no-data", action="store_true", help="skip the bulk data load")
    p.add_argument("--no-browser", action="store_true", help="don't auto-open the browser")
    p.add_argument("--reload-data", action="store_true", help="force a re-fetch of bulk data")
    p.add_argument("--reset-key", action="store_true", help="clear saved Gemini key and re-prompt")
    p.add_argument("--reset-venv", action="store_true", help="delete .venv before re-creating")
    p.add_argument(
        "--exit-after-health",
        action="store_true",
        help="exit cleanly once both servers respond to health checks (for tests/CI)",
    )
    return p.parse_args()


def main() -> None:
    _enable_ansi_on_windows()
    args = parse_args()

    check_prereqs()
    py = ensure_venv(reset=args.reset_venv)
    install_deps(py)
    ensure_env_file()
    prompt_for_api_key(reset=args.reset_key)
    init_database(py)
    load_data_if_empty(py, force=args.reload_data, skip=args.no_data)

    npm = find_executable("npm")
    if not npm:
        fail("npm not found on PATH. Did Node install correctly?")
    install_frontend_deps(npm)

    check_ports_free([8000, 5173])

    backend = start_backend(py)
    frontend = start_frontend(npm)
    processes = [backend, frontend]
    install_shutdown_handler(processes)

    wait_for_health(processes)

    if args.exit_after_health:
        ok("Both servers healthy — exiting per --exit-after-health.")
        for p in processes:
            p.terminate()
        for p in processes:
            try:
                p.wait(timeout=5)
            except subprocess.TimeoutExpired:
                p.kill()
        sys.exit(0)

    open_browser_and_wait(processes, no_browser=args.no_browser)


if __name__ == "__main__":
    main()
