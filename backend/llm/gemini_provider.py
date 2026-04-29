"""GeminiProvider — Google Gemini API skeleton.

In v1 this raises ``NotImplementedError``. To activate it in v1.1:

1. Add ``google-generativeai`` to ``requirements.txt``.
2. Implement ``generate`` (the call structure is sketched in the docstring).
3. Set ``LLM_ENABLED=true`` and ``LLM_PROVIDER=gemini`` in ``.env``.
4. Set ``GEMINI_API_KEY``.

That's it — no other code changes. Keeping this stub here means the team
doesn't have to remember the integration plan; it's encoded in the file.
"""

from __future__ import annotations

from backend.llm.base import ChatMessage, ChatResponse, LLMProvider


class GeminiProvider(LLMProvider):
    """Skeleton for Google Gemini integration.

    Sketch of the eventual implementation::

        import google.generativeai as genai

        def __init__(self, api_key: str, model: str = "gemini-1.5-flash"):
            genai.configure(api_key=api_key)
            self._model = genai.GenerativeModel(model)
            self._model_name = model

        def generate(self, messages, system=None, max_tokens=1024, temperature=0.2):
            # Gemini takes "system_instruction" at model construction time (or
            # as a kwarg on generate_content). It expects messages as a list
            # of dicts with role ∈ {"user", "model"} (note: "model", not
            # "assistant").
            history = [
                {
                    "role": "user" if m.role == "user" else "model",
                    "parts": [m.content],
                }
                for m in messages
            ]
            response = self._model.generate_content(
                history,
                generation_config={
                    "max_output_tokens": max_tokens,
                    "temperature": temperature,
                },
                system_instruction=system,
            )
            return ChatResponse(
                text=response.text,
                model=self._model_name,
                prompt_tokens=response.usage_metadata.prompt_token_count,
                completion_tokens=response.usage_metadata.candidates_token_count,
                metadata={"finish_reason": response.candidates[0].finish_reason.name},
            )
    """

    name = "gemini"

    def __init__(self, api_key: str, model: str = "gemini-1.5-flash") -> None:
        if not api_key:
            raise ValueError("GeminiProvider requires a non-empty api_key")
        self._api_key = api_key
        self._model_name = model

    def generate(
        self,
        messages: list[ChatMessage],
        system: str | None = None,
        max_tokens: int = 1024,
        temperature: float = 0.2,
    ) -> ChatResponse:
        raise NotImplementedError(
            "GeminiProvider is a skeleton in v1. To activate it: "
            "(1) `pip install google-generativeai`, "
            "(2) implement this method per the sketch in this file's docstring, "
            "(3) set LLM_ENABLED=true in .env."
        )
