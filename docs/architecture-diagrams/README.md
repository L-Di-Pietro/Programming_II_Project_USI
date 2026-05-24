# Architecture diagrams

This folder contains the **renderable** source for the architecture diagrams referenced (in ASCII form) from [`../../ARCHITECTURE.md`](../../ARCHITECTURE.md). The diagrams are written in [Mermaid](https://mermaid.js.org/) `.mmd` files; GitHub renders them natively when viewing them on the web. For local PDF/SVG export, install the Mermaid CLI:

```bash
npm install -g @mermaid-js/mermaid-cli
mmdc -i system-flow.mmd -o system-flow.svg
```

The diagrams are intentionally additive — they do not replace the ASCII diagrams in `ARCHITECTURE.md`, which remain authoritative for terminal-only readers. The Mermaid versions are a richer parallel view for readers using a Markdown renderer.

| File | Diagram type | Audience | What it shows |
|---|---|---|---|
| [`system-flow.mmd`](system-flow.mmd) | `flowchart LR` | New contributors | The end-to-end request flow from React UI through the FastAPI router into the agents and back. |
| [`agent-call-graph.mmd`](agent-call-graph.mmd) | `graph TD` | Backend engineers | Which agent invokes which, and which agents are LLM-backed vs deterministic. |
| [`db-schema.mmd`](db-schema.mmd) | `erDiagram` | Anyone touching persistence | All eight SQLAlchemy tables with their primary keys, foreign keys, and cascade-delete relationships. |

---

_Last verified against code: 2026-05-24._
