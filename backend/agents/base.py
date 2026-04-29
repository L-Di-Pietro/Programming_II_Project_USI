"""BaseAgent — common scaffolding for the six specialized agents.

Each agent has:

* A ``name`` (lowercase, used in logs).
* A ``run`` method that takes a typed input and returns a typed output.
* Structured logging around every invocation.
* Uniform error wrapping (``AgentError``) so the API layer can catch one type.
"""

from __future__ import annotations

import time
from abc import ABC, abstractmethod
from typing import Any, Generic, TypeVar

import structlog


class AgentError(RuntimeError):
    """Wraps any error that bubbled up from inside an agent's ``run`` call."""

    def __init__(self, agent: str, message: str, cause: Exception | None = None):
        super().__init__(f"[{agent}] {message}")
        self.agent = agent
        self.cause = cause


# Generic input / output for type-safe agents.
TIn = TypeVar("TIn")
TOut = TypeVar("TOut")


class BaseAgent(ABC, Generic[TIn, TOut]):
    """Abstract base. Subclasses override ``_run`` (the actual work) and set
    ``name``. The public ``run`` adds logging, timing, and error wrapping."""

    name: str = "abstract"

    def __init__(self) -> None:
        self.log = structlog.get_logger(f"agent.{self.name}")

    # ------------------------------------------------------------------------
    # Public API — do not override.
    # ------------------------------------------------------------------------
    def run(self, payload: TIn) -> TOut:
        start = time.perf_counter()
        self.log.info("agent.run.start", agent=self.name)
        try:
            result = self._run(payload)
        except AgentError:
            raise
        except Exception as e:
            self.log.exception("agent.run.error", agent=self.name)
            raise AgentError(self.name, str(e), cause=e) from e
        elapsed_ms = (time.perf_counter() - start) * 1000
        self.log.info("agent.run.done", agent=self.name, elapsed_ms=round(elapsed_ms, 2))
        return result

    # ------------------------------------------------------------------------
    # Subclass hook.
    # ------------------------------------------------------------------------
    @abstractmethod
    def _run(self, payload: TIn) -> TOut:
        ...

    # ------------------------------------------------------------------------
    # Tool registration helper (used by the Orchestrator's tool-use loop)
    # ------------------------------------------------------------------------
    def tools(self) -> dict[str, Any]:
        """Return a tool-schema dict (name → callable / schema) the
        Orchestrator can register. Subclasses override to expose their own
        tools. Default: a single ``run`` tool."""
        return {self.name: self.run}
