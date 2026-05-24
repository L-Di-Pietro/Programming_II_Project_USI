# Generative-AI Usage Acknowledgement

> The *USI Programming in Finance II* rubric (Project 2.8, Spring 2026) requires every team to disclose its use of generative-AI tools. This file is that disclosure. A compressed version of it appears in the academic PDF as [`docs/academic/06_ai_acknowledgement.tex`](docs/academic/06_ai_acknowledgement.tex).

---

## 1. The team's AI policy

We used generative-AI tools as **collaborators**, not as substitutes for understanding. The intent was to compress the time we spent on mechanical work (boilerplate code, repetitive tests, documentation prose, search across unfamiliar APIs) so we could spend more time on the parts of the project that mattered for the rubric — the design rationale, the look-ahead-bias guarantee, the trading-calendar correctness, the strategy catalogue's breadth, and the academic write-up.

The following are durable, non-negotiable rules the team agreed at the start of the project:

1. **Every line of code that lands in `main` is reviewed by a human.** AI output that nobody understands does not get merged.
2. **No AI tool is given access to credentials, API keys, or production data.** The `.env` file is gitignored; only `.env.example` (which carries no secrets) is committed. No team member ever pasted a real `GEMINI_API_KEY` into an AI prompt.
3. **The LLM features inside the product itself are opt-in.** [`backend/config.py`](backend/config.py) defaults to `LLM_ENABLED=false`, the test suite uses the deterministic `NullProvider`, and the live `GeminiProvider` requires three environment variables to activate (`LLM_ENABLED=true`, `LLM_PROVIDER=gemini`, `GEMINI_API_KEY=…`). This is a *design* choice that reflects the team's view of AI in production systems: useful, but never silently load-bearing.
4. **AI-assisted commits carry a `Co-Authored-By:` trailer** naming the tool that contributed. This is enforced by [`AGENTS.md`](AGENTS.md#5-commit-message-convention-for-ai-contributions) and [`CONTRIBUTING.md`](CONTRIBUTING.md#commit-message-convention).
5. **No AI tool ever pushed to `main` autonomously.** The two Claude Code GitHub Actions workflows (`claude.yml`, `claude-code-review.yml`) only respond to explicit human triggers (`@claude` mentions, PR review events). They cannot self-trigger.

We take collective responsibility for the entire repository, including any text or code that was originally drafted by an AI tool and subsequently reviewed and accepted by us.

---

## 2. AI tools used

The table below lists every AI tool a team member used during the project, what they used it for, and how human review was applied. Tools the team did not use are explicitly listed as "not used" so the disclosure is complete.

| Tool | Vendor | Used for | Level of human review | Notes |
|---|---|---|---|---|
| **Claude Code (CLI)** | Anthropic | Primary coding agent. Multi-file refactors, agent scaffolding, documentation drafts, test boilerplate, debugging long stack traces, commit-message drafting, GitHub-Actions wiring. | Full diff review before every commit; CI re-runs on every push. | Evidence in the repo: `.github/workflows/claude.yml` (issue/PR mention handler), `.github/workflows/claude-code-review.yml` (per-PR review), and this documentation pass. |
| **Claude.ai (web)** | Anthropic | Conversational design discussions, exploring architectural trade-offs, summarising long external docs (e.g. `exchange_calendars` API), drafting README prose. | Output pasted into the repo only after a team member rewrote / verified it. | Used by all four contributors at various points. |
| **ChatGPT** | OpenAI | Quick syntax checks, small isolated questions (e.g. "how do I write a pandas-friendly composite primary key in SQLAlchemy 2"), reformatting LaTeX tables. | Output verified against the official docs before acceptance. | Used opportunistically; not a primary tool. |
| **GitHub Copilot** | GitHub / OpenAI | In-editor autocomplete for routine code (loops, list comprehensions, type annotations), test-name suggestions. | Inline acceptance / rejection per suggestion; surrounding diff always read. | A single merge commit (`b9fc033`) was authored by the `copilot-swe-agent[bot]` resolving a tsconfig conflict; this was a one-off, not a sustained authoring pattern. |
| **Cursor** | Anysphere | Editor-integrated assistant for navigating unfamiliar files, refactoring across small TypeScript components, fixing ESLint findings. | Full diff review; lint and type-check before commit. | Used by one team member as their primary editor for the frontend. |
| **Google Gemini (web)** | Google | Spot-checking factual claims about NYSE hours, ICCXT pagination semantics, and other domain trivia. | Cross-checked against primary sources. | Distinct from the in-product Gemini integration — see "Gemini in the product" below. |
| **Google Gemini API** | Google | **In the product itself** — `GeminiProvider` implementation in `backend/llm/gemini_provider.py`. Powers the optional "Explain" and "Report" features when activated. | Opt-in only; off by default; users supply their own API key. | This is not a team-development tool but a product feature; documented here for completeness. |

The team did **not** use Codex, Replit Ghostwriter, Sourcegraph Cody, Tabnine, Codeium, Amazon CodeWhisperer, or any other AI coding assistant during this project. We mention them by name so the absence is unambiguous.

---

## 3. Where AI was *not* used

To make the boundary visible:

- **Strategy mathematics.** The formulas in `backend/strategies/*.py` were transcribed from the academic / practitioner sources cited in [`docs/strategies.md`](docs/strategies.md) and [`CITATIONS.md`](CITATIONS.md). The team independently re-derived each one before implementation.
- **Look-ahead-bias enforcement.** The `bar-t → bar-t+1` fill rule in `backend/backtest/engine.py` was designed and tested by the team. The accompanying oracle-strategy test in `tests/test_engine_no_lookahead.py` was written by humans and is the project's most important invariant.
- **Database schema.** `backend/database/models.py` — composite primary keys, cascade-delete semantics, the long-format `metrics` table — was designed by the team based on the requirements in [`ARCHITECTURE.md`](ARCHITECTURE.md).
- **API contract.** The shape of every `backend/api/schemas.py` Pydantic model was negotiated between the backend and frontend members of the team before any code was written.
- **The four-week project timeline and sprint goals.** Planning artefacts ([`docs/academic/01_project_plan.tex`](docs/academic/01_project_plan.tex), [`docs/academic/02_project_diary.tex`](docs/academic/02_project_diary.tex)) reflect the team's actual decisions, not AI-generated text.

---

## 4. Reproducibility of AI-assisted work

Most AI sessions are not natively reproducible — model outputs vary between runs and prompt phrasings. The team accepts this and mitigates it as follows:

- **Diff-level review.** Every change is gated by a code review of the actual diff, regardless of how the diff was produced. If the reviewer cannot explain the change in their own words, it is not merged.
- **Test coverage.** The look-ahead-bias guard, KPI correctness tests, and strategy-signal fixtures all run on every push to `main`. An AI tool that produces a subtly wrong implementation has to defeat the test suite to land.
- **Prompt summaries.** The most impactful prompts (e.g. "audit the existing docs and write the new ones") are summarised in the relevant PR body and in [`docs/academic/02_project_diary.tex`](docs/academic/02_project_diary.tex), so a future maintainer can re-run an analogous prompt to update the artefact.

---

## 5. Cross-references

- [`AGENTS.md`](AGENTS.md) — the AI-collaborator contract: invariants, commit-message convention, PR etiquette.
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — full setup mechanics for contributors.
- [`docs/agents.md`](docs/agents.md) — the six **runtime** agents (not coding agents) that live inside the product.
- [`backend/llm/base.py`](backend/llm/base.py) — the `LLMProvider` abstraction that gates every in-product LLM call.
- [`docs/academic/06_ai_acknowledgement.tex`](docs/academic/06_ai_acknowledgement.tex) — the compressed version of this file that appears in the iCorsi PDF.

---

_Last verified against code: 2026-05-24._
