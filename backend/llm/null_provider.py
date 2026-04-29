"""NullProvider — a deterministic, offline LLM stand-in.

Returns canned text based on the last user message. Used in v1 (where
``LLM_ENABLED=false``) and in tests, so the Explanation Agent's full plumbing
runs end-to-end without an API key.

The canned text is intentionally ugly — a clear "demo mode" signal so the
team doesn't ship NullProvider responses to end users by accident.
"""

from __future__ import annotations

import hashlib
import textwrap

from backend.llm.base import ChatMessage, ChatResponse, LLMProvider


class NullProvider(LLMProvider):
    """Returns deterministic placeholder text — does NOT call any external API."""

    name = "null"

    def generate(
        self,
        messages: list[ChatMessage],
        system: str | None = None,
        max_tokens: int = 1024,
        temperature: float = 0.2,
    ) -> ChatResponse:
        # Find the last user turn — that's typically what we'd "respond" to.
        last_user = next(
            (m.content for m in reversed(messages) if m.role == "user"),
            "(no user message)",
        )
        # Stable signature so the same input always yields the same output.
        digest = hashlib.sha256(last_user.encode("utf-8")).hexdigest()[:8]

        body = textwrap.dedent(
            f"""\
            [DEMO MODE — LLM is disabled]

            This is a placeholder response from NullProvider. To get real
            natural-language explanations of your backtest, set
            LLM_ENABLED=true in .env, configure LLM_PROVIDER=gemini, populate
            GEMINI_API_KEY, and implement GeminiProvider.generate().

            Echo of your prompt (first 200 chars): {last_user[:200]}
            Stable signature: {digest}
            """
        ).strip()

        return ChatResponse(
            text=body,
            model="null-provider",
            prompt_tokens=0,
            completion_tokens=0,
            metadata={"finish_reason": "stop", "demo": "true"},
        )
