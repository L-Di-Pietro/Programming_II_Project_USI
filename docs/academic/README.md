# Academic submission — LaTeX bundle

This folder contains the LaTeX source of the academic PDF submitted on iCorsi for **USI Programming in Finance II — Project 2.8 (Spring 2026)**.

## Files

| File | Purpose |
|---|---|
| [`QuantEdge_Project_Documentation.tex`](QuantEdge_Project_Documentation.tex) | Document root. `\documentclass`, packages, title page, `\input{}`s the six section files, prints the bibliography. |
| [`01_project_plan.tex`](01_project_plan.tex) | Section 1 — problem statement, scope, tech-stack rationale, four-week timeline. |
| [`02_project_diary.tex`](02_project_diary.tex) | Section 2 — week-by-week narrative with commit hashes and merge-PR cross-references. |
| [`03_methodology.tex`](03_methodology.tex) | Section 3 — event-driven backtest semantics, KPI formulas, calendar handling, strategy taxonomy, LLM-provider abstraction. |
| [`04_sample_results.tex`](04_sample_results.tex) | Section 4 — representative run + results table + economic reflection. Table values come from a real run executed on 2026-06-11 (the exact `curl` recipe is in the section). |
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

This runs `latexmk -pdf -interaction=nonstopmode -halt-on-error QuantEdge_Project_Documentation.tex`, which itself calls `pdflatex` and `biber` as many times as needed to converge cross-references and the bibliography. The output is `QuantEdge_Project_Documentation.pdf` in the same folder.

Other targets:

```bash
make watch       # rebuild on every change (latexmk -pvc); great for editing
make clean       # delete aux/log/bcf/blg/toc etc., keep QuantEdge_Project_Documentation.pdf
make distclean   # delete everything including QuantEdge_Project_Documentation.pdf
```

### Overleaf alternative

If the team prefers to compile on Overleaf rather than locally:

1. Create a new Overleaf project.
2. Upload every file in this folder (`QuantEdge_Project_Documentation.tex`, the six `0?_*.tex` files, `references.bib`, and `Makefile` for reference).
3. Set the main document to `QuantEdge_Project_Documentation.tex`.
4. Set the compiler to **pdfLaTeX** and the bibliography engine to **biber** (Overleaf detects this automatically from `biblatex`'s options).
5. Click *Recompile*.

## Results provenance

The KPI table in [`04_sample_results.tex`](04_sample_results.tex) is populated from a backtest executed against the final codebase on 2026-06-11, via the exact `curl` recipe printed in the section (SMA Crossover on SPY, 2020–2024 daily). No placeholder `\todo{}` notes remain.

## Page-count target

The course brief asks for **5–8 pages of pure text**. Measured by compiling a stripped copy of the document (no title page, TOC, tables, or bibliography), the current source comes to **8 pages** — whether or not the two short code listings are counted as text. The full PDF, with title page, TOC, tables, and bibliography, is 11 pages.

---

_Last verified against code: 2026-06-11._
