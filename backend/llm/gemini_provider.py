"""GeminiProvider — Google Gemini API integration.

Activation
----------
1. ``pip install google-generativeai>=0.7`` (already in requirements.txt).
2. Set ``LLM_ENABLED=true`` and ``LLM_PROVIDER=gemini`` in ``.env``.
3. Set ``GEMINI_API_KEY`` in ``.env``.

The SDK is imported lazily inside ``generate()`` so constructing a provider
(or instantiating the factory in a test) does not require the SDK to be
installed. Only the first real chat call needs ``google-generativeai``.
"""

from __future__ import annotations

from backend.llm.base import ChatMessage, ChatResponse, LLMProvider


class GeminiProvider(LLMProvider):
    """Google Gemini chat-completion provider.

    Translates the project's provider-agnostic ``ChatMessage`` / ``ChatResponse``
    types to/from Gemini's native shape:

    * Roles ``user`` and ``assistant`` map to Gemini's ``user`` and ``model``
      (Gemini does not have an ``assistant`` role name).
    * The system prompt is passed via ``system_instruction`` at model
      construction time (Gemini does not accept a system message inline).
    """

    name = "gemini"

    def __init__(self, api_key: str, model: str = "gemini-1.5-flash") -> None:
        if not api_key:
            raise ValueError("GeminiProvider requires a non-empty api_key")
        self._api_key = api_key
        self._model_name = model
        self._configured = False

    def _ensure_configured(self):
        """Lazy SDK import + ``configure`` call. Cached after first invocation."""
        if self._configured:
            return self._genai  # type: ignore[has-type]
        try:
            import google.generativeai as genai
        except ImportError as e:  # pragma: no cover - exercised only without the SDK
            raise RuntimeError(
                "google-generativeai is not installed. "
                "Run `pip install google-generativeai>=0.7` or remove "
                "LLM_PROVIDER=gemini from your .env."
            ) from e
        genai.configure(api_key=self._api_key)
        self._genai = genai
        self._configured = True
        return genai

    def generate(
        self,
        messages: list[ChatMessage],
        system: str | None = None,
        max_tokens: int = 1024,
        temperature: float = 0.2,
    ) -> ChatResponse:
        genai = self._ensure_configured()

        # Build the model with the system instruction baked in. Constructing
        # per-call is cheap and lets the system prompt change between calls.
        model = genai.GenerativeModel(
            model_name=self._model_name,
            system_instruction=system,
        )

        history = [
            {
                "role": "user" if m.role == "user" else "model",
                "parts": [m.content],
            }
            for m in messages
            if m.role in ("user", "assistant")
        ]

        response = model.generate_content(
            history,
            generation_config={
                "max_output_tokens": max_tokens,
                "temperature": temperature,
            },
        )

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
