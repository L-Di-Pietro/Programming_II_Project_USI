# One-command launcher — Design

**Date:** 2026-05-27
**Status:** Approved (pending user re-read of this written form)
**Author:** Filippo Selmi (with Claude Code)
**Implements:** "single command to run the whole project" requirement

---

## 1 · Goal

Give a brand-new user — and specifically the course professor — a single command that brings the entire QuantEdge application up from a fresh git clone, with the AI-report (Gemini) feature working, on macOS, Linux, and Windows.

Today's Quick Start in `README.md` requires the user to perform ~7 steps across two terminals (venv, deps, env, init DB, load data, backend, frontend) and to manually edit `.env`. That flow stays exactly as it is for power users; the new tooling is purely additive.

## 2 · Non-goals

- Replacing the existing manual Quick Start. It remains the third documented entry point.
- Production deployment automation. This is a local-dev / academic-grading aid.
- Auto-installing Python or Node for the user (invasive; respect the user's environment).
- Multi-machine orchestration, reverse proxies, TLS, port-forwarding past localhost.
- Any change to backend, frontend, strategy, or analytics code.

## 3 · Constraints

- **No new prerequisites** beyond the ones already required (Python ≥ 3.11, Node ≥ 20).
- **The launcher itself must run before `pip install`**, so it can use only Python stdlib — no third-party packages.
- **The API key (`GEMINI_API_KEY`) must never be committed to the repo.** `.env` is gitignored; the launcher writes to it locally and Docker reads from it via `env_file:`.
- **All existing commands in the README's Quick Start must continue to work unchanged.**
- **Idempotency:** running the launcher twice in a row must do approximately nothing on the second run (~5 s steady-state).

## 4 · Solution overview

Two single-command entry points, both reading the same local `.env`:

```
                              ┌─ python run.py ──┐                    ┌─ Brand-new files
                              │  (state machine) │                    │   • run.py
   professor types  ─────────►│  prereqs → venv  │──► uvicorn + npm   │
   one of:                    │  → .env → key    │    in foreground   ├─ Touched files
   • python run.py            │  → DB → data     │    until Ctrl-C    │   • docker-compose.yml
   • docker compose up        │  → servers       │                    │   • .env.example
                              └──────────────────┘                    │   • README.md (TL;DR block)
                                                                      │   • .gitignore (already covers .env)
                              ┌─ docker compose ─┐                    │
                              │ env_file: .env   │──► containers      ├─ Unchanged
                              │ init+load+serve  │                    │   • scripts/init_db.py
                              └──────────────────┘                    │   • scripts/load_initial_data.py
                                                                      │   • backend/, frontend/, tests/
```

The launcher writes `.env`; Docker reads `.env`. The existing 7-step manual flow stays as a third entry point.

## 5 · Components — `run.py` step functions

`run.py` is a single Python file at the repo root, stdlib-only. Each step is a small named function with an explicit skip condition. The launcher executes them in order; any step that has nothing to do exits in microseconds.

### 5.1 · `check_prereqs()` — *never skipped*

- **What it means:** every launch runs two version probes — `sys.version_info` for Python, `subprocess.run(["node", "--version"])` for Node — even if the app launched fine yesterday.
- **Why no skip:** the probes cost ~50 ms total, and there's no reliable cache-key for "the user's environment hasn't changed since last time." A `brew upgrade node` between runs can silently downgrade a user. Failing here in 50 ms is dramatically better than failing 30 s later inside `start_backend()` with a stack-trace from inside uvicorn.

### 5.2 · `ensure_venv()` — skip if `.venv/` exists

- **What it means:** if `.venv/` is present on disk we assume a venv was created successfully and don't try to recreate it.
- **Why this is a safe signal:** `venv.EnvBuilder` writes the venv directory only at the end of its work — if creation crashed mid-way, the directory wouldn't exist. Directory present ≈ previous run finished cleanly.
- **Why we don't probe deeper:** running `.venv/bin/python --version` to confirm the binary works costs ~150 ms every launch for near-zero added safety; the next step (`install_deps()`) fails loudly if the venv is corrupt.
- **Known limitation:** if the user upgrades Python (3.11 → 3.13) the existing venv still works but is pinned to the old binary. `--reset-venv` is the escape hatch.

### 5.3 · `install_deps()` — skip if `requirements.txt` mtime ≤ `.venv/.deps_installed_at`

- **What it means:** after a successful install we `touch .venv/.deps_installed_at`. Next launch we `stat()` both files; if `requirements.txt` was modified after the marker we re-install, otherwise we skip.
- **Why not always run `pip install`:** it costs ~5-10 s even when everything is satisfied (pip resolves the dep graph). On a project launched many times per day, that adds up.
- **Why mtime, not `pip list` comparison:** listing installed packages requires running pip itself — exactly the cost we're trying to avoid. `stat()` is one syscall.
- **When this skip is wrong:** if a user edits `requirements.txt` with an editor that preserves mtime, or a `git checkout` happens to land the same mtime, the user gets `ModuleNotFoundError` at backend start, which routes them into the "pip install fails" branch.

### 5.4 · `ensure_env_file()` — skip if `.env` exists

- **What it means:** copy `.env.example` → `.env` only on the very first run. After that we never touch `.env`.
- **Why we never overwrite:** `.env` is user-owned config. Stomping on it would delete the user's saved API key, custom `DATABASE_URL`, etc. — the cardinal sin of bootstrappers.
- **Consequence:** if `.env.example` gains new keys in a future commit and the user already has an old `.env`, the new keys won't appear there. We handle that in §7 by failing loudly when a required key is missing, not by silently overwriting.

### 5.5 · `prompt_for_api_key()` — skip if a definitive choice is recorded in `.env`

A "definitive choice" is *either* of:

- `GEMINI_API_KEY=<non-empty>` (user pasted a key), **or**
- `LLM_ENABLED=false` (user pressed Enter to decline).

The launcher writes the second one on a decline so we don't badger the user every launch.

- **Why two signals, not one:** we need to distinguish "no key yet, please ask" from "I already said no, stop asking." A single empty `GEMINI_API_KEY=` can't carry that.
- **Why `LLM_ENABLED=false` and not a launcher-private marker file:** it's the same flag the backend already reads to disable the LLM agent. One flag, two consumers — no duplication.
- **Prompt mechanics:** `getpass.getpass("Paste your Gemini API key (or press Enter to skip the AI report): ")` — input is hidden from the terminal.
- **Re-prompt:** `python run.py --reset-key` clears `GEMINI_API_KEY` and resets `LLM_ENABLED` to the `.env.example` default, so the prompt fires again.

### 5.6 · `init_database()` — *always runs* (script is idempotent)

- **What it means:** `scripts/init_db.py` runs every launch, even on a populated DB.
- **Why no skip:** the script takes ~1 s on an already-populated DB (it runs `CREATE TABLE IF NOT EXISTS` + a few seed `INSERT … ON CONFLICT DO NOTHING`). Always-run guarantees that after a `git pull` adds new strategies / assets, the registry catches up automatically — no "strategy not found" errors.
- **Why we trust idempotency:** the script's docstring already commits to *"Idempotent — safe to re-run"*. We piggy-back on a property the team maintains.

### 5.7 · `load_data_if_empty()` — skip if `bars` table has ≥ 1 row

- **What it means:** open a SQLite connection, `SELECT COUNT(*) FROM bars LIMIT 1`. If ≥ 1 we skip the bulk fetch.
- **Why `bars` specifically:** `init_db.py` seeds `assets` and `strategies` but never inserts into `bars`. The first `bars` row is unambiguous proof that the bulk fetch ran successfully at least once. Using `assets` would short-circuit immediately after `init_db.py`, which is exactly wrong.
- **Why not check completeness (all 36 assets × both timeframes):** cheap signals only. Counting per-asset rows would slow every launch. The nightly APScheduler job fills gaps; `--reload-data` forces a full re-fetch.
- **Why this is the most important skip in the file:** the bulk fetch takes 2-5 min and hits the network. Running it every launch would be unacceptable.

### 5.8 · `install_frontend_deps()` — skip if `frontend/node_modules/` exists AND `frontend/package-lock.json` mtime ≤ marker

- **What it means:** same pattern as 5.3 but for npm. Marker: `frontend/node_modules/.deps_installed_at`. Comparison is against `package-lock.json` (not `package.json`) because the lockfile is what npm actually installs from.
- **Why both checks:** `node_modules/` can exist but be stale after `git pull` updates `package-lock.json`. Directory-presence alone would miss that and Vite would crash on a missing dep. Mtime alone would over-trigger on a fresh clone (no marker yet → always reinstall, which is correct but slower).
- **Cost asymmetry vs Python:** npm install is ~30-60 s even from cache, so this skip is meaningful even with only a few launches per day.

### 5.9 · `start_backend()` — *never skipped*

- Spawns `<venv-python> -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000` as a `subprocess.Popen`, piping stdout/stderr.
- The pipe is essential for the failure path in §7 — without captured output we have no traceback to print when the backend dies.

### 5.10 · `start_frontend()` — *never skipped*

- Spawns `npm run dev` with `cwd=frontend/` as a `subprocess.Popen`, piping stdout/stderr.
- Same rationale as 5.9.

### 5.11 · `wait_for_health()` — *never skipped*

- Polls `http://127.0.0.1:8000/healthz` and `http://localhost:5173` every 500 ms until both return HTTP 200, with a 60 s overall timeout.
- Each iteration also calls `process.poll()` on both children. If either has exited, jump to the §7 "backend died" branch immediately instead of waiting for the timeout.

### 5.12 · `open_browser_and_stream()` — skip browser-open only if `--no-browser`

- Calls `webbrowser.open("http://localhost:5173")` (no-op skip if `--no-browser`).
- Multiplexes child stdout into the launcher's terminal with colored prefixes (`[backend]` cyan, `[frontend]` magenta).
- Installs a `signal.signal(SIGINT, …)` handler for graceful shutdown — see §7.
- **Why a CLI flag instead of auto-detect:** detecting "is this CI?" via env vars is fiddly and wrong on edge cases like tmux sessions. An explicit flag is unambiguous.

## 6 · CLI flags

| Flag | Effect |
|---|---|
| (none) | Full launcher: prereqs → … → servers → browser → stream |
| `--no-data` | Skip step 5.7 entirely (don't even check; assume DB is fine) |
| `--no-browser` | Skip the `webbrowser.open()` in 5.12 |
| `--reload-data` | Force step 5.7 to run even if `bars` is populated |
| `--reset-key` | Clear `GEMINI_API_KEY` and reset `LLM_ENABLED` so 5.5 prompts again |
| `--reset-venv` | Delete `.venv/` before step 5.2 (recovers from Python upgrades / corrupt venvs) |
| `--exit-after-health` | Used by the integration test: after 5.11 succeeds, terminate both children and exit 0 |

## 7 · Error handling

Each failure prints (a) what failed, (b) why we think it failed, (c) the exact command the user can run to escape into the manual README flow.

### 7.1 · Python version < 3.11

- **Action:** print `"Detected Python X.Y; need ≥ 3.11. Install from https://www.python.org/downloads/"` → `sys.exit(1)`.
- **Why exit immediately:** the backend genuinely won't import on Python 3.10 (match statements, modern type-hint syntax, Pydantic v2 features). Continuing produces an opaque `SyntaxError` from deep inside FastAPI — dramatically less helpful than our one-liner.
- **Why not auto-install:** installing Python requires admin/sudo, modifies PATH, and the "right" install path varies (python.org vs pyenv vs asdf vs brew vs Microsoft Store). Picking one for the user is invasive; printing one URL respects their environment.
- **Why python.org and not pyenv:** the official installer works everywhere with no prerequisites. Version managers are great for power users but assume the user is willing to install yet another tool first.

### 7.2 · Node missing or version < 20

- **Action:** same shape — print the detected version (or "not found"), the requirement, and `https://nodejs.org/en/download` → exit 1.
- **Why mirror Python's handling:** symmetric UX is easier to remember; two missing-prereq errors that look totally different would be jarring.
- **Why we don't try `nvm install 20`:** nvm isn't installed by default on most systems, and shelling out to it from a Python subprocess is brittle (nvm is a shell function, not a binary).

### 7.3 · `pip install -r requirements.txt` exits non-zero

- **Action:** print the *last 20 lines* of pip's combined stdout+stderr, then the manual reproduction command (`source .venv/bin/activate && pip install -r requirements.txt`), then exit 1.
- **Why the last 20 lines specifically:** pip's output can be hundreds of lines (one per package considered). The actual error — usually `Could not find a version that satisfies …`, `Failed building wheel for numpy`, or a permission denial — is reliably in the tail. Showing the head would just dump dependency-resolution noise.
- **Why print the manual command:** debugging a failed pip install usually means re-running with `--verbose` or `--no-cache-dir`. Giving the user the exact command they can edit avoids them reverse-engineering what we ran.
- **Why exit rather than continue:** if pip fails, the next step (`init_database()`) will import-error on a missing dependency. Better to stop on the actionable error than pile a `ModuleNotFoundError` on top of it.

### 7.4 · Port 8000 or 5173 already bound

- **Action:** identify the offending process (Unix: `lsof -ti:<port>`; Windows: `netstat -ano | findstr :<port>` then parse the PID column), print *"port :<port> is held by PID <pid> (<process name>) — kill it with `kill -9 <pid>` / `taskkill /F /PID <pid>`"*, then exit 1.
- **Why diagnose the holder, not just "port in use":** 95% of the time the holder is an orphaned uvicorn / vite from a previous run that didn't clean up properly (parent killed, child kept the socket). Naming the PID lets the user kill it in one command instead of hunting through `ps`.
- **Why not bind to a different port:** the frontend's dev proxy in `frontend/vite.config.ts` hardcodes `http://127.0.0.1:8000` for `/api/*`. A random free port would mean the frontend can't talk to the backend — worse than failing to start.
- **Why shell out to `lsof` / `netstat`:** Python's stdlib doesn't expose "who owns this port." Both tools are installed by default on every supported OS. If absent we degrade to "port in use — please free it" without the PID detail.

### 7.5 · Backend subprocess dies during the health-check window

- **Action:** in 5.11's polling loop, also call `backend_process.poll()`. If `poll()` returns a non-None exit code, dump the backend's captured stdout/stderr and exit 1.
- **Why polling matters:** uvicorn's `--reload` mode spawns a parent watcher process plus a child worker. If the worker import-errors, the worker dies but the watcher keeps running and our pid is still alive. Without `poll()` we'd time out after 60 s with "backend never became healthy" — true but useless. With `poll()` we catch the death in <1 s and show the traceback.
- **Why we already pipe the stdout:** capturing instead of inheriting is the cost. The benefit is having the exact traceback to print on a crash, instead of asking the user to "scroll up" (which doesn't work when output is multiplexed across two children).
- **Why exit instead of restart:** an import error or config error won't fix itself by retrying. Fast feedback beats stubborn retry.

### 7.6 · `load_initial_data.py` fails partway

- **Action:** catch the non-zero exit, print a *warning* (not an error) — *"Bulk data load failed after fetching N/36 assets. Backtests on loaded assets still work. Run `python run.py --reload-data` to retry."* — and **continue** to the server-start step.
- **Why warn-and-continue (the only error that doesn't exit):** yfinance is flaky — rate limits, transient DNS errors, regional blocks. A partial fetch is still useful; the user can backtest on the assets that loaded. Forcing them to retry from scratch is bad UX, especially since we'd lose the data we already have.
- **Why not silent:** without the warning the user might wonder why TSLA isn't in their asset dropdown. Surfacing "your data is incomplete" up front beats them filing a bug.
- **Why the suggested command is `--reload-data` and not "just run me again":** a plain re-run would hit 5.7's skip condition (there's *some* data now), so the bulk fetch wouldn't retry. The flag forces it.

### 7.7 · Ctrl-C (SIGINT) from the user

- **Action:** install a `signal.signal(SIGINT, handler)` early. Handler runs `process.terminate()` on both children, then `process.wait(timeout=5)` on each, then `process.kill()` if either is still alive, then `sys.exit(0)`.
- **Why `terminate()` (SIGTERM) before `kill()` (SIGKILL):** SIGTERM is graceful — uvicorn finishes its in-flight requests and closes its DB connections cleanly; Vite shuts down its websocket clients. SIGKILL skips all of that, which can leave the SQLite DB in a recoverable-but-noisy state.
- **Why a 5-second escalation window:** long enough for a healthy process to finish its shutdown handlers, short enough that a hung child (e.g., uvicorn blocked on a slow yfinance HTTP call that ignores signals) doesn't make the user wait forever.
- **Why exit 0 and not 130:** convention says 130 (= 128 + SIGINT) for processes killed *by* a signal, but here the launcher *received* a signal and shut down its children cleanly — that's a successful shutdown, not an interrupted one. Exit 0 is what you'd expect from `docker compose up` after Ctrl-C, and we imitate that UX.

## 8 · Data flow

**First run on a fresh checkout (~3 min total):**

```
prereqs ─► venv ─► pip ─► .env ─► prompt for key ─► init_db ─► load_data ─► npm install
                                                                                  │
                                  ┌───── uvicorn ─────────► /healthz 200 ◄─┐    │
                                  │                                         │    ▼
                                  └───── npm run dev ─────► :5173 200 ◄─────┴── browser opens
                                                                                  │
                                                                          stream logs / Ctrl-C
```

**Steady state (~5 s):** steps 5.2-5.8 short-circuit on their skip conditions, so the launcher jumps from `check_prereqs()` directly to `start_backend()` + `start_frontend()`.

## 9 · Docker-side changes

Three edits to `docker-compose.yml`, no new files:

```diff
 backend:
   build:
     context: .
     dockerfile: Dockerfile
   restart: unless-stopped
+  env_file:
+    - .env                              # picks up GEMINI_API_KEY from local .env
   depends_on:
     db:
       condition: service_healthy
   environment:
     DATABASE_URL: postgresql+psycopg://quantedge:quantedge@db:5432/quantedge
-    LLM_ENABLED: "false"
+    # LLM_ENABLED + LLM_PROVIDER + GEMINI_API_KEY come from env_file above
   command: >
     sh -c "python scripts/init_db.py &&
+           python scripts/load_initial_data.py --timeframes 1d 1h &&
            uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload"
+  healthcheck:
+    test: ["CMD-SHELL", "curl -fsS http://127.0.0.1:8000/healthz || exit 1"]
+    interval: 5s
+    timeout: 3s
+    retries: 20

 frontend:
   ...
-  depends_on:
-    - backend
+  depends_on:
+    backend:
+      condition: service_healthy
```

**Professor's path-B flow:**

```bash
echo "GEMINI_API_KEY=<key>" > .env       # or paste the .env you sent him
docker compose up --build                # starts everything; data loads on first boot
```

**Caveats:**

- `env_file: .env` couples the local and Docker paths. If a developer ever ran the launcher (writing `DATABASE_URL=sqlite:///...`) and then ran `docker compose up`, the local SQLite URL would clash with the Docker `DATABASE_URL` in `environment:`. **Resolution:** Compose's documented precedence is that `environment:` wins over `env_file:`, so the SQLite URL is overridden by the Postgres one — correct behaviour.
- The data load takes 2-5 minutes on first `docker compose up`. The healthcheck retry budget (20 × 5 s = 100 s) is too short to wait for it, so the *first* `up --build` will show the frontend "unhealthy → healthy" transition once the load completes. Subsequent `up`s are instant because the `bars` table is already populated and `load_initial_data.py` is idempotent.

## 10 · README impact

Insert a new section above the current "Quick start" heading; demote the current heading from `##` to `### Manual (Quick start)`:

```markdown
## TL;DR — run the whole app in one command

Pick whichever you prefer. Both paths read your Gemini API key the first time
and remember it; subsequent runs are instant.

```bash
python run.py                # macOS / Linux / Windows — uses local Python + Node
```

```bash
docker compose up --build    # if you don't want to install Python + Node locally
```

Need step-by-step control (e.g. for debugging)? See the [Manual (Quick start)](#manual-quick-start) section below.
```

The existing Quick Start, Troubleshooting, "Run the tests", "Re-running from scratch", and "Alternative: one-command Docker stack" sections stay verbatim.

## 11 · Testing

| Test | What it asserts | Where it runs |
|---|---|---|
| `tests/test_launcher.py` — unit tests for each step function (`tmp_path` fakes, monkeypatched subprocess) | Each step is idempotent; skip conditions trigger on the right signals; error branches produce the right exit code and message | pytest CI on `ubuntu-latest` + `macos-latest` |
| `tests/test_launcher_integration.py` — one integration test that runs `python run.py --no-data --no-browser --exit-after-health` against the real project | `/healthz` returns 200, `:5173` serves HTML, both children terminate cleanly on the test's SIGINT | pytest CI on `ubuntu-latest` + `macos-latest` |
| Docker smoke in CI: `docker compose up -d && wait for healthy && docker compose down -v` | The `env_file:` plumbing works; first-boot data load completes; both services reach `healthy` | dedicated CI job (no matrix needed) |
| Manual Windows smoke documented in `CONTRIBUTING.md` | The launcher works on a real Windows machine before each release | one human pass per release |

Windows is not on CI because `windows-latest` runners handle subprocess signal-propagation differently enough from real Windows (especially around `taskkill`, ANSI colors, and the `npm.cmd` shim) that a passing CI run gives false confidence. One human smoke per release is more valuable than a brittle workflow.

## 12 · Coexistence with the manual flow

None of the existing commands change behaviour:

- `python -m venv .venv` — still works.
- `pip install -r requirements.txt` — still works.
- `cp .env.example .env` — still works (the launcher does this too, but doesn't enforce it).
- `python scripts/init_db.py`, `python scripts/load_initial_data.py …` — still work; the launcher just calls them.
- `uvicorn backend.main:app --reload` — still works.
- `cd frontend && npm install && npm run dev` — still works.
- `docker compose up --build` — still works (and now actually loads data on first boot, which is an improvement, not a break).

The only files modified that *could* affect the manual flow are `docker-compose.yml` (improved, not broken) and `README.md` (section reordering only). `.env.example` may gain a one-line comment explaining the launcher prompt, which is informational.

## 13 · Out of scope (future work)

- A `--prod` mode that builds the frontend (`npm run build`) and serves it via uvicorn instead of `npm run dev`. Useful for the academic submission demo; not needed for grading.
- Auto-update detection (e.g., `git fetch && git status` to nudge the user if main has moved). Adds value but also blast radius.
- Bundling the launcher as a binary (PyInstaller). Adds maintenance for ~zero additional users.
- Multi-language `.env` setup for users who want to switch providers (`LLM_PROVIDER=anthropic` etc.). The plumbing supports it; the prompt could be extended later.

## 14 · Footprint summary

| File | Change | Approx LoC |
|---|---|---|
| `run.py` | new | ~250 |
| `tests/test_launcher.py` | new | ~150 |
| `tests/test_launcher_integration.py` | new | ~50 |
| `docker-compose.yml` | edit | ~10 lines changed |
| `README.md` | new TL;DR section + heading demotion | ~15 lines added |
| `.env.example` | one-line comment | ~1 |
| `.github/workflows/*.yml` | add Docker smoke job (optional) | ~30 |
| **Total new/changed LoC** | | **~500** |

No backend, frontend, strategy, or analytics code is touched.
