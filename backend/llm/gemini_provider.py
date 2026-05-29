"""GeminiProvider — Google Gemini API integration (google-genai SDK).

Activation
----------
1. ``pip install google-genai`` (already in requirements.txt).
2. Set ``LLM_ENABLED=true`` and ``LLM_PROVIDER=gemini`` in ``.env``.
3. Set ``GEMINI_API_KEY`` in ``.env``.
"""

from __future__ import annotations

import time

import structlog

from backend.llm.base import ChatMessage, ChatResponse, LLMProvider


log = structlog.get_logger(__name__)


# Transient overload codes worth retrying. 503 is Google's "model is
# experiencing high demand"; 429 is rate-limit; 500/504 are server-side.
_RETRYABLE_STATUS = {429, 500, 503, 504}
_MAX_ATTEMPTS = 4
_BASE_BACKOFF_S = 1.5  # 1.5, 3, 6 → up to ~10s total wait


class GeminiProvider(LLMProvider):
    """Google Gemini chat-completion provider using the google-genai SDK.

    Roles ``user`` and ``assistant`` map to Gemini's ``user`` and ``model``.
    The system prompt is passed via ``system_instruction`` in the config.
    """

    name = "gemini"

    def __init__(self, api_key: str, model: str = "gemini-3.5-flash") -> None:
        if not api_key:
            raise ValueError("GeminiProvider requires a non-empty api_key")
        self._api_key = api_key
        self._model_name = model
        self._client = None

    def _ensure_client(self):
        if self._client is not None:
            return self._client
        try:
            from google import genai
        except ImportError as e:
            raise RuntimeError(
                "google-genai is not installed. Run `pip install google-genai`."
            ) from e
        self._client = genai.Client(api_key=self._api_key)
        return self._client

    def generate(
        self,
        messages: list[ChatMessage],
        system: str | None = None,
        max_tokens: int = 1024,
        temperature: float = 0.2,
    ) -> ChatResponse:
        from google.genai import errors as genai_errors
        from google.genai import types

        client = self._ensure_client()

        contents = [
            types.Content(
                role="user" if m.role == "user" else "model",
                parts=[types.Part(text=m.content)],
            )
            for m in messages
            if m.role in ("user", "assistant")
        ]

        config = types.GenerateContentConfig(
            max_output_tokens=max_tokens,
            temperature=temperature,
            system_instruction=system,
        )

        # Retry transient overloads (503 high-demand, 429 rate-limit, 5xx).
        # The SDK has internal retries but they don't cover model-overload
        # 503s — and those are the common case for preview/flash models.
        last_exc: Exception | None = None
        for attempt in range(1, _MAX_ATTEMPTS + 1):
            try:
                response = client.models.generate_content(
                    model=self._model_name,
                    contents=contents,
                    config=config,
                )
                break
            except genai_errors.APIError as e:
                status = getattr(e, "code", None) or getattr(e, "status_code", None)
                if status not in _RETRYABLE_STATUS or attempt == _MAX_ATTEMPTS:
                    raise
                wait = _BASE_BACKOFF_S * (2 ** (attempt - 1))
                log.warning(
                    "gemini.transient_error_retrying",
                    attempt=attempt,
                    status=status,
                    wait_s=wait,
                    model=self._model_name,
                )
                time.sleep(wait)
                last_exc = e
        else:  # pragma: no cover — for-else only runs if no break
            assert last_exc is not None
            raise last_exc

        usage = getattr(response, "usage_metadata", None)
        prompt_tokens = int(getattr(usage, "prompt_token_count", 0) or 0)
        completion_tokens = int(getattr(usage, "candidates_token_count", 0) or 0)

        finish_reason = ""
        candidates = getattr(response, "candidates", None) or []
        if candidates:
            fr = getattr(candidates[0], "finish_reason", None)
            finish_reason = getattr(fr, "name", str(fr)) if fr is not None else ""

        return ChatResponse(
            text=response.text,
            model=self._model_name,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            metadata={"finish_reason": finish_reason},
        )
