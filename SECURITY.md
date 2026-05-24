# Security Policy

QuantBacktest is a **student-built academic project** (USI Lugano — *Programming in Finance II*, Project 2.8, Spring 2026). It is **not a deployed production service**. There is no hosted instance; every user runs the application locally against their own SQLite (or, optionally, Postgres) database. The threat model is correspondingly narrow.

That said, we treat the codebase to production-leaning standards (look-ahead-bias guarantees in the engine, opt-in LLM features by default, parameterised SQL via SQLAlchemy, no credentials in the repo) and we welcome responsible disclosure of any vulnerability you find.

---

## Supported versions

| Version | Status |
|---|---|
| `v1.0.0-rc1` (current, 2026-05-24) | ✅ Supported for the duration of the academic-submission window. |
| earlier (pre-release) | ❌ Not supported. Upgrade to `v1.0.0-rc1`. |

See [`CHANGELOG.md`](CHANGELOG.md) for the release history.

---

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security reports. Instead, email:

> **`usi-prog2-team@example.com`** &nbsp;*<!-- TEAM: replace with the actual shared address before publication. The placeholder is intentional so reviewers can see the convention without exposing a real inbox. -->*

Include:

- A clear description of the vulnerability.
- The affected file path(s) and version (commit SHA or release tag).
- A minimal reproducer (a script, a request payload, or a sequence of UI steps).
- The impact you believe is achievable.
- (Optional) Suggested remediation.

We will acknowledge receipt within **7 days** and aim to triage within **30 days**. Coordinated disclosure window: **90 days** from acknowledgement, or sooner by mutual agreement.

Since the project is academic, we cannot offer monetary bounties. We will credit reporters in the changelog (with permission) and on the repository's contributors page.

---

## Out of scope

The following are *not* considered vulnerabilities in this project:

- **Permissive CORS in `backend/main.py`.** The dev configuration accepts all origins on purpose — single-user, local-only. A production deployment would tighten this.
- **No authentication on the HTTP API.** The app is designed for a single local user. Multi-user auth is out of scope for v1.
- **Reliance on third-party market-data providers.** If Yahoo Finance, Binance, or Stooq is unreachable or rate-limits us, the Data Agent surfaces a `FetcherError`. This is documented in [`docs/data-sources.md`](docs/data-sources.md).
- **LLM hallucinations in the optional Explain / Report features.** The Explanation Agent ships with a deterministic `NullProvider` by default; live providers (Gemini, optionally Anthropic/OpenAI) carry the usual LLM caveats and the UI surfaces a "demo mode" badge when `NullProvider` is active.

---

## Things we *do* care about

- **SQL injection.** All database access goes through SQLAlchemy parameterised queries. If you find a path that builds raw SQL by string concatenation, report it.
- **Path traversal.** No endpoint accepts arbitrary file paths from the user.
- **Credential leakage.** If you find an API key, password, or token committed anywhere in the repo or in the docker-compose stack, report it immediately.
- **LLM prompt injection that exfiltrates user data.** The Explanation Agent is grounded on persisted run data — if you find a prompt that causes it to leak data from another run or from the environment, report it.
- **Look-ahead bias regression.** A code change that bypasses the `bar-t → bar-t+1` fill rule would silently invalidate every backtest result. We treat this as a security-grade correctness bug because it falsifies the product's central guarantee. Report any such regression via the same channel as a vulnerability.

---

_Last verified against code: 2026-05-24._
