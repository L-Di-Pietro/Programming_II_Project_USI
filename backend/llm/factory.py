"""LLMFactory — picks the concrete provider based on settings.

Centralising the dispatch here lets the rest of the codebase do
``LLMFactory.from_settings()`` without knowing which providers exist.
"""

from __future__ import annotations

import structlog

from backend.config import Settings, settings as default_settings
from backend.llm.base import LLMProvider
from backend.llm.gemini_provider import GeminiProvider
from backend.llm.null_provider import NullProvider

log = structlog.get_logger(__name__)


class LLMFactory:
    """Build the right ``LLMProvider`` for the current configuration."""

    @staticmethod
    def from_settings(s: Settings | None = None) -> LLMProvider:
        s = s or default_settings

        # Master kill-switch: if LLM is disabled, always return NullProvider —
        # ignores LLM_PROVIDER. This is the v1 default.
        if not s.llm_enabled:
            log.debug("llm.disabled_returning_null_provider")
            return NullProvider()

        provider_name = s.llm_provider.lower()
        if provider_name == "null":
            return NullProvider()
        if provider_name == "gemini":
            return GeminiProvider(api_key=s.gemini_api_key, model=s.llm_model)

        raise ValueError(
            f"Unknown LLM_PROVIDER={provider_name!r}. "
            "Valid options: null, gemini. Add a new provider in backend/llm/."
        )
