# Academic submission — LaTeX bundle

This folder contains the LaTeX source of the academic PDF submitted on iCorsi for **USI Programming in Finance II — Project 2.8 (Spring 2026)**.

## Files

| File | Purpose |
|---|---|
| [`main.tex`](main.tex) | Document root. `\documentclass`, packages, title page, `\input{}`s the six section files, prints the bibliography. |
| [`01_project_plan.tex`](01_project_plan.tex) | Section 1 — problem statement, scope, tech-stack rationale, four-week timeline. |
| [`02_project_diary.tex`](02_project_diary.tex) | Section 2 — week-by-week narrative with commit hashes and merge-PR cross-references. |
| [`03_methodology.tex`](03_methodology.tex) | Section 3 — event-driven backtest semantics, KPI formulas, calendar handling, strategy taxonomy, LLM-provider abstraction. |
| [`04_sample_results.tex`](04_sample_results.tex) | Section 4 — representative run + team-filled results table + economic reflection. Contains `\todo{}` placeholders. |
| [`05_lessons_learned.tex`](05_lessons_learned.tex) | Section 5 — what worked, what didn't, what carries forward. |
| [`06_ai_acknowledgement.tex`](06_ai_acknowledgement.tex) | Section 6 — generative-AI tools used (compressed version of [`../../AI_USAGE.md`](../../AI_USAGE.md)). |
| [`references.bib`](references.bib) | BibTeX entries for every citation. |
| [`Makefile`](Makefile) | `make pdf` / `make watch` / `make clean` / `make distclean`. |

## Building locally

### Prerequisites

You need a working TeX distribution with `latexmk`, `pdflatex`, and `biber`. On macOS:

```bash
# Install MacTeX (one-time, ~5 GB).
brew install --cask mactex
# or for a smaller install:
brew install --cask basictex
sudo tlmgr update --self
sudo tlmgr install latexmk biblatex biber todonotes csquotes microtype booktabs listings hyperref geometry lmodern amsmath
```

On Debian / Ubuntu:

```bash
sudo apt install texlive-full
```

### Build

From this directory:

```bash
make pdf
```

This runs `latexmk -pdf -interaction=nonstopmode -halt-on-error main.tex`, which itself calls `pdflatex` and `biber` as many times as needed to converge cross-references and the bibliography. The output is `main.pdf` in the same folder.

Other targets:

```bash
make watch       # rebuild on every change (latexmk -pvc); great for editing
make clean       # delete aux/log/bcf/blg/toc etc., keep main.pdf
make distclean   # delete everything including main.pdf
```

### Overleaf alternative

If the team prefers to compile on Overleaf rather than locally:

1. Create a new Overleaf project.
2. Upload every file in this folder (`main.tex`, the six `0?_*.tex` files, `references.bib`, and `Makefile` for reference).
3. Set the main document to `main.tex`.
4. Set the compiler to **pdfLaTeX** and the bibliography engine to **biber** (Overleaf detects this automatically from `biblatex`'s options).
5. Click *Recompile*.

## Team-filled placeholders

[`04_sample_results.tex`](04_sample_results.tex) contains `\todo{}` notes where the team should fill in actual KPI values from a backtest they execute. The PDF compiles regardless — the TODOs render inline so reviewers can see exactly what is missing.

## Page-count target

The course brief asks for **5–8 pages of pure text**, excluding figures, the bibliography, and the title page / table of contents. The current draft is calibrated to fit. If the team adds figures (screenshots from the running app would strengthen Section 4), they do not count toward the 8-page limit.

---

_Last verified against code: 2026-05-24._
