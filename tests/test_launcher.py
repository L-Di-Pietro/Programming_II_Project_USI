"""Unit tests for run.py — the one-command launcher."""

from __future__ import annotations

import sqlite3
import subprocess
import sys
from pathlib import Path
from unittest import mock

import pytest

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import run as launcher  # noqa: E402  isort:skip


# ---------------------------------------------------------------------------
# update_env / read_env — the .env editor (spec §5.5)
# ---------------------------------------------------------------------------

def test_update_env_replaces_existing_key_preserving_other_lines(tmp_path: Path) -> None:
    env = tmp_path / ".env"
    env.write_text(
        "# A comment\n"
        "LOG_LEVEL=INFO\n"
        "GEMINI_API_KEY=old_key\n"
        "\n"
        "LLM_ENABLED=true\n"
    )
    launcher.update_env(env, {"GEMINI_API_KEY": "new_key"})
    text = env.read_text()
    assert "GEMINI_API_KEY=new_key" in text
    assert "old_key" not in text
    assert "# A comment" in text
    assert "LOG_LEVEL=INFO" in text
    assert "LLM_ENABLED=true" in text


def test_update_env_appends_missing_key(tmp_path: Path) -> None:
    env = tmp_path / ".env"
    env.write_text("LOG_LEVEL=INFO\n")
    launcher.update_env(env, {"GEMINI_API_KEY": "k"})
    lines = env.read_text().splitlines()
    assert "LOG_LEVEL=INFO" in lines
    assert "GEMINI_API_KEY=k" in lines


def test_update_env_multiple_keys(tmp_path: Path) -> None:
    env = tmp_path / ".env"
    env.write_text("GEMINI_API_KEY=\nLLM_ENABLED=true\n")
    launcher.update_env(env, {"GEMINI_API_KEY": "abc", "LLM_ENABLED": "false"})
    text = env.read_text()
    assert "GEMINI_API_KEY=abc" in text
    assert "LLM_ENABLED=false" in text


def test_update_env_creates_file_if_missing(tmp_path: Path) -> None:
    env = tmp_path / ".env"
    launcher.update_env(env, {"X": "1"})
    assert env.read_text() == "X=1\n"


def test_read_env_ignores_blank_lines_and_full_line_comments(tmp_path: Path) -> None:
    env = tmp_path / ".env"
    env.write_text("# a comment\n\nKEY1=v1\nKEY2=v2\n")
    assert launcher.read_env(env) == {"KEY1": "v1", "KEY2": "v2"}


def test_read_env_strips_surrounding_quotes(tmp_path: Path) -> None:
    env = tmp_path / ".env"
    env.write_text('KEY="quoted"\n')
    assert launcher.read_env(env)["KEY"] == "quoted"


def test_read_env_strips_inline_comment_unquoted(tmp_path: Path) -> None:
    env = tmp_path / ".env"
    env.write_text("KEY=plainvalue  # trailing comment\n")
    assert launcher.read_env(env)["KEY"] == "plainvalue"


def test_read_env_strips_inline_comment_after_quoted_value(tmp_path: Path) -> None:
    # The user's actual .env shape: KEY="value"  # comment
    env = tmp_path / ".env"
    env.write_text('GEMINI_API_KEY="AIzaSyDxxx"   # populate to activate Google Gemini\n')
    assert launcher.read_env(env)["GEMINI_API_KEY"] == "AIzaSyDxxx"


def test_read_env_keeps_hash_when_no_space_before(tmp_path: Path) -> None:
    # `K=val#frag` (no space) is treated as part of the value, not a comment.
    env = tmp_path / ".env"
    env.write_text("KEY=value#fragment\n")
    assert launcher.read_env(env)["KEY"] == "value#fragment"


def test_read_env_returns_empty_for_missing_file(tmp_path: Path) -> None:
    assert launcher.read_env(tmp_path / "absent") == {}


# ---------------------------------------------------------------------------
# venv_python — cross-platform path (spec §5.2)
# ---------------------------------------------------------------------------

def test_venv_python_is_platform_correct(tmp_path: Path) -> None:
    result = launcher.venv_python(tmp_path)
    if sys.platform == "win32":
        assert result.parts[-2:] == ("Scripts", "python.exe")
    else:
        assert result.parts[-2:] == ("bin", "python")


# ---------------------------------------------------------------------------
# check_prereqs — version gates (spec §7.1, §7.2)
# ---------------------------------------------------------------------------

def test_check_prereqs_rejects_old_python(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(launcher.sys, "version_info", (3, 10, 0))
    with pytest.raises(SystemExit) as exc:
        launcher.check_prereqs()
    assert exc.value.code == 1


def test_check_prereqs_rejects_missing_node(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(launcher, "find_executable", lambda _: None)
    with pytest.raises(SystemExit):
        launcher.check_prereqs()


def test_check_prereqs_rejects_old_node(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(launcher, "find_executable", lambda _: "/fake/node")
    fake = subprocess.CompletedProcess(args=[], returncode=0, stdout="v16.20.0\n", stderr="")
    monkeypatch.setattr(launcher.subprocess, "run", lambda *a, **k: fake)
    with pytest.raises(SystemExit):
        launcher.check_prereqs()


def test_check_prereqs_passes_on_good_versions(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(launcher, "find_executable", lambda _: "/fake/node")
    fake = subprocess.CompletedProcess(args=[], returncode=0, stdout="v20.10.0\n", stderr="")
    monkeypatch.setattr(launcher.subprocess, "run", lambda *a, **k: fake)
    launcher.check_prereqs()  # should not raise


# ---------------------------------------------------------------------------
# install_deps — skip-on-fresh-marker (spec §5.3)
# ---------------------------------------------------------------------------

def test_install_deps_skips_when_marker_newer(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    reqs = tmp_path / "requirements.txt"
    marker = tmp_path / ".deps_installed_at"
    reqs.write_text("fastapi==0.115\n")
    marker.touch()
    # Make marker definitively newer than reqs.
    import os
    os.utime(reqs, (1, 1))
    os.utime(marker, (2, 2))

    monkeypatch.setattr(launcher, "REQUIREMENTS", reqs)
    monkeypatch.setattr(launcher, "DEPS_MARKER", marker)
    called = mock.Mock()
    monkeypatch.setattr(launcher.subprocess, "run", called)

    launcher.install_deps(Path("/fake/python"))
    called.assert_not_called()


def test_install_deps_runs_when_reqs_newer(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    reqs = tmp_path / "requirements.txt"
    marker = tmp_path / ".deps_installed_at"
    reqs.write_text("fastapi==0.115\n")
    marker.touch()
    import os
    os.utime(marker, (1, 1))
    os.utime(reqs, (2, 2))

    monkeypatch.setattr(launcher, "REQUIREMENTS", reqs)
    monkeypatch.setattr(launcher, "DEPS_MARKER", marker)
    fake = subprocess.CompletedProcess(args=[], returncode=0, stdout="", stderr="")
    captured = mock.Mock(return_value=fake)
    monkeypatch.setattr(launcher.subprocess, "run", captured)

    launcher.install_deps(Path("/fake/python"))
    captured.assert_called_once()
    assert "pip" in captured.call_args.args[0]


def test_install_deps_exits_on_pip_failure(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    reqs = tmp_path / "requirements.txt"
    reqs.write_text("broken==999\n")
    marker = tmp_path / ".deps_installed_at"
    monkeypatch.setattr(launcher, "REQUIREMENTS", reqs)
    monkeypatch.setattr(launcher, "DEPS_MARKER", marker)
    fake = subprocess.CompletedProcess(args=[], returncode=1, stdout="boom\n", stderr="ERROR\n")
    monkeypatch.setattr(launcher.subprocess, "run", lambda *a, **k: fake)
    with pytest.raises(SystemExit):
        launcher.install_deps(Path("/fake/python"))


# ---------------------------------------------------------------------------
# ensure_env_file (spec §5.4)
# ---------------------------------------------------------------------------

def test_ensure_env_file_copies_example_when_missing(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    example = tmp_path / ".env.example"
    env = tmp_path / ".env"
    example.write_text("KEY=value\n")
    monkeypatch.setattr(launcher, "ENV_EXAMPLE", example)
    monkeypatch.setattr(launcher, "ENV_FILE", env)
    launcher.ensure_env_file()
    assert env.read_text() == "KEY=value\n"


def test_ensure_env_file_preserves_existing(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    example = tmp_path / ".env.example"
    env = tmp_path / ".env"
    example.write_text("KEY=value\n")
    env.write_text("USER_CUSTOM=preserved\n")
    monkeypatch.setattr(launcher, "ENV_EXAMPLE", example)
    monkeypatch.setattr(launcher, "ENV_FILE", env)
    launcher.ensure_env_file()
    assert env.read_text() == "USER_CUSTOM=preserved\n"


# ---------------------------------------------------------------------------
# prompt_for_api_key — skip semantics (spec §5.5)
# ---------------------------------------------------------------------------

def test_prompt_skips_when_key_already_set(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    env = tmp_path / ".env"
    env.write_text("GEMINI_API_KEY=abc\nLLM_ENABLED=true\n")
    monkeypatch.setattr(launcher, "ENV_FILE", env)
    input_called = mock.Mock()
    getpass_called = mock.Mock()
    monkeypatch.setattr("builtins.input", input_called)
    monkeypatch.setattr("getpass.getpass", getpass_called)
    launcher.prompt_for_api_key()
    input_called.assert_not_called()
    getpass_called.assert_not_called()


def test_prompt_skips_when_llm_disabled(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    env = tmp_path / ".env"
    env.write_text("GEMINI_API_KEY=\nLLM_ENABLED=false\n")
    monkeypatch.setattr(launcher, "ENV_FILE", env)
    input_called = mock.Mock()
    monkeypatch.setattr("builtins.input", input_called)
    launcher.prompt_for_api_key()
    input_called.assert_not_called()


def test_prompt_yn_no_disables_llm_without_asking_for_key(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    env = tmp_path / ".env"
    env.write_text("GEMINI_API_KEY=\nLLM_ENABLED=true\n")
    monkeypatch.setattr(launcher, "ENV_FILE", env)
    monkeypatch.setattr("builtins.input", lambda _: "n")
    getpass_called = mock.Mock()
    monkeypatch.setattr("getpass.getpass", getpass_called)
    launcher.prompt_for_api_key()
    parsed = launcher.read_env(env)
    assert parsed["LLM_ENABLED"] == "false"
    assert parsed.get("GEMINI_API_KEY", "") == ""
    getpass_called.assert_not_called()


def test_prompt_yn_yes_then_pastes_key(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    env = tmp_path / ".env"
    env.write_text("GEMINI_API_KEY=\nLLM_ENABLED=true\n")
    monkeypatch.setattr(launcher, "ENV_FILE", env)
    monkeypatch.setattr("builtins.input", lambda _: "y")
    monkeypatch.setattr("getpass.getpass", lambda _: "secret_key_123")
    launcher.prompt_for_api_key()
    parsed = launcher.read_env(env)
    assert parsed["GEMINI_API_KEY"] == "secret_key_123"


def test_prompt_yn_yes_with_empty_paste_disables_llm(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    env = tmp_path / ".env"
    env.write_text("GEMINI_API_KEY=\nLLM_ENABLED=true\n")
    monkeypatch.setattr(launcher, "ENV_FILE", env)
    monkeypatch.setattr("builtins.input", lambda _: "y")
    monkeypatch.setattr("getpass.getpass", lambda _: "")
    launcher.prompt_for_api_key()
    parsed = launcher.read_env(env)
    assert parsed["LLM_ENABLED"] == "false"


def test_prompt_yn_yes_case_insensitive(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    env = tmp_path / ".env"
    env.write_text("GEMINI_API_KEY=\nLLM_ENABLED=true\n")
    monkeypatch.setattr(launcher, "ENV_FILE", env)
    monkeypatch.setattr("builtins.input", lambda _: "YES")
    monkeypatch.setattr("getpass.getpass", lambda _: "k")
    launcher.prompt_for_api_key()
    assert launcher.read_env(env)["GEMINI_API_KEY"] == "k"


def test_prompt_reset_clears_existing_choice(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    env = tmp_path / ".env"
    env.write_text("GEMINI_API_KEY=oldkey\nLLM_ENABLED=true\n")
    monkeypatch.setattr(launcher, "ENV_FILE", env)
    monkeypatch.setattr("builtins.input", lambda _: "y")
    monkeypatch.setattr("getpass.getpass", lambda _: "newkey")
    launcher.prompt_for_api_key(reset=True)
    assert launcher.read_env(env)["GEMINI_API_KEY"] == "newkey"


# ---------------------------------------------------------------------------
# db_has_bars (spec §5.7)
# ---------------------------------------------------------------------------

def test_db_has_bars_false_when_file_missing(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(launcher, "SQLITE_DB", tmp_path / "absent.db")
    assert launcher.db_has_bars() is False


def test_db_has_bars_false_on_empty_table(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    db = tmp_path / "test.db"
    with sqlite3.connect(db) as conn:
        conn.execute("CREATE TABLE ohlcv_bars (id INTEGER PRIMARY KEY)")
    monkeypatch.setattr(launcher, "SQLITE_DB", db)
    assert launcher.db_has_bars() is False


def test_db_has_bars_true_when_populated(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    db = tmp_path / "test.db"
    with sqlite3.connect(db) as conn:
        conn.execute("CREATE TABLE ohlcv_bars (id INTEGER PRIMARY KEY)")
        conn.execute("INSERT INTO ohlcv_bars (id) VALUES (1)")
    monkeypatch.setattr(launcher, "SQLITE_DB", db)
    assert launcher.db_has_bars() is True


def test_db_has_bars_false_on_corrupt_db(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    db = tmp_path / "corrupt.db"
    db.write_bytes(b"not a sqlite database")
    monkeypatch.setattr(launcher, "SQLITE_DB", db)
    assert launcher.db_has_bars() is False


# ---------------------------------------------------------------------------
# load_data_if_empty — skip semantics (spec §5.7)
# ---------------------------------------------------------------------------

def test_load_data_skips_when_no_data_flag(monkeypatch: pytest.MonkeyPatch) -> None:
    called = mock.Mock()
    monkeypatch.setattr(launcher.subprocess, "run", called)
    launcher.load_data_if_empty(Path("/fake/python"), skip=True)
    called.assert_not_called()


def test_load_data_skips_when_bars_present(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(launcher, "db_has_bars", lambda: True)
    called = mock.Mock()
    monkeypatch.setattr(launcher.subprocess, "run", called)
    launcher.load_data_if_empty(Path("/fake/python"))
    called.assert_not_called()


def test_load_data_runs_when_force(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(launcher, "db_has_bars", lambda: True)
    fake = subprocess.CompletedProcess(args=[], returncode=0, stdout="", stderr="")
    captured = mock.Mock(return_value=fake)
    monkeypatch.setattr(launcher.subprocess, "run", captured)
    launcher.load_data_if_empty(Path("/fake/python"), force=True)
    captured.assert_called_once()


def test_load_data_warns_but_continues_on_failure(monkeypatch: pytest.MonkeyPatch, capsys) -> None:
    monkeypatch.setattr(launcher, "db_has_bars", lambda: False)
    fake = subprocess.CompletedProcess(args=[], returncode=1, stdout="", stderr="")
    monkeypatch.setattr(launcher.subprocess, "run", lambda *a, **k: fake)
    launcher.load_data_if_empty(Path("/fake/python"))  # should not raise
    captured = capsys.readouterr()
    assert "--reload-data" in captured.out


# ---------------------------------------------------------------------------
# install_frontend_deps — skip semantics (spec §5.8)
# ---------------------------------------------------------------------------

def test_install_frontend_deps_skips_when_marker_newer(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    node_modules = tmp_path / "node_modules"
    node_modules.mkdir()
    lock = tmp_path / "package-lock.json"
    lock.write_text("{}")
    marker = node_modules / ".deps_installed_at"
    marker.touch()
    import os
    os.utime(lock, (1, 1))
    os.utime(marker, (2, 2))

    monkeypatch.setattr(launcher, "NODE_MODULES", node_modules)
    monkeypatch.setattr(launcher, "NODE_MARKER", marker)
    monkeypatch.setattr(launcher, "PACKAGE_LOCK", lock)
    called = mock.Mock()
    monkeypatch.setattr(launcher.subprocess, "run", called)

    launcher.install_frontend_deps("/fake/npm")
    called.assert_not_called()


# ---------------------------------------------------------------------------
# _http_ok — HTTP health probe (spec §5.11)
# ---------------------------------------------------------------------------

def test_http_ok_true_on_200(monkeypatch: pytest.MonkeyPatch) -> None:
    fake_resp = mock.MagicMock()
    fake_resp.status = 200
    fake_resp.__enter__ = mock.MagicMock(return_value=fake_resp)
    fake_resp.__exit__ = mock.MagicMock(return_value=None)
    monkeypatch.setattr(launcher.urllib.request, "urlopen", lambda *a, **k: fake_resp)
    assert launcher._http_ok("http://example") is True


def test_http_ok_false_on_connection_error(monkeypatch: pytest.MonkeyPatch) -> None:
    def boom(*a, **k):
        raise ConnectionError("nope")
    monkeypatch.setattr(launcher.urllib.request, "urlopen", boom)
    assert launcher._http_ok("http://example") is False


# ---------------------------------------------------------------------------
# parse_args — CLI flags (spec §6)
# ---------------------------------------------------------------------------

def test_parse_args_defaults(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(sys, "argv", ["run.py"])
    args = launcher.parse_args()
    assert args.no_data is False
    assert args.no_browser is False
    assert args.reload_data is False
    assert args.reset_key is False
    assert args.reset_venv is False
    assert args.exit_after_health is False


def test_parse_args_flags(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        sys, "argv",
        ["run.py", "--no-data", "--no-browser", "--reload-data",
         "--reset-key", "--reset-venv", "--exit-after-health"],
    )
    args = launcher.parse_args()
    assert all([
        args.no_data, args.no_browser, args.reload_data,
        args.reset_key, args.reset_venv, args.exit_after_health,
    ])


# ---------------------------------------------------------------------------
# check_ports_free + _port_holder (spec §7.4)
# ---------------------------------------------------------------------------

def test_check_ports_free_passes_when_all_free(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(launcher, "_port_holder", lambda _port: None)
    launcher.check_ports_free([8000, 5173])  # should not raise


def test_check_ports_free_exits_with_spec_message(
    monkeypatch: pytest.MonkeyPatch, capsys
) -> None:
    def fake_holder(port: int):
        return ("12345", "uvicorn") if port == 8000 else None
    monkeypatch.setattr(launcher, "_port_holder", fake_holder)
    with pytest.raises(SystemExit) as exc:
        launcher.check_ports_free([8000, 5173])
    assert exc.value.code == 1
    out = capsys.readouterr().out
    assert "port :8000 is held by PID 12345 (uvicorn)" in out
    if sys.platform == "win32":
        assert "taskkill /F /PID 12345" in out
    else:
        assert "kill -9 12345" in out


def test_check_ports_free_reports_both_ports_when_both_held(
    monkeypatch: pytest.MonkeyPatch, capsys
) -> None:
    def fake_holder(port: int):
        return (str(port * 10), f"proc_{port}")
    monkeypatch.setattr(launcher, "_port_holder", fake_holder)
    with pytest.raises(SystemExit):
        launcher.check_ports_free([8000, 5173])
    out = capsys.readouterr().out
    assert ":8000 is held by PID 80000 (proc_8000)" in out
    assert ":5173 is held by PID 51730 (proc_5173)" in out


def test_process_name_falls_back_when_lookup_fails(monkeypatch: pytest.MonkeyPatch) -> None:
    def boom(*a, **k):
        raise FileNotFoundError("no ps")
    monkeypatch.setattr(launcher.subprocess, "run", boom)
    assert launcher._process_name("99999") == "process name unknown"


def test_port_holder_returns_none_when_lsof_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    def boom(*a, **k):
        raise FileNotFoundError("no lsof")
    monkeypatch.setattr(launcher.subprocess, "run", boom)
    assert launcher._port_holder(8000) is None
