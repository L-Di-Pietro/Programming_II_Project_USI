"""LLM provider abstraction.

The Explanation Agent (and, when enabled, the Orchestrator) depend on the
abstract ``LLMProvider`` rather than on any concrete SDK. To swap providers
you change ``LLM_PROVIDER`` in ``.env`` — no other code needs to move.

In v1, ``LLM_ENABLED=false`` and ``LLMFactory.from_settings()`` returns a
``NullProvider`` that emits deterministic canned strings. This keeps tests
hermetic and lets the Explanation Agent's plumbing run end-to-end without
API keys.
"""

from backend.llm.base import ChatMessage, ChatResponse, LLMProvider
from backend.llm.factory import LLMFactory
from backend.llm.gemini_provider import GeminiProvider
from backend.llm.null_provider import NullProvider

__all__ = [
    "ChatMessage",
    "ChatResponse",
    "GeminiProvider",
    "LLMFactory",
    "LLMProvider",
    "NullProvider",
]
