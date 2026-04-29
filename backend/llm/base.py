"""LLMProvider — abstract base + shared message/response types.

Concrete implementations live alongside this file (``null_provider.py``,
``gemini_provider.py``, future ``anthropic_provider.py`` etc.). Callers depend
only on this abstract interface.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Literal


# Roles follow the OpenAI/Anthropic/Gemini convention. Most providers accept
# all three; a few only have user/assistant — providers must translate.
Role = Literal["system", "user", "assistant"]


@dataclass(frozen=True, slots=True)
class ChatMessage:
    """A single conversational turn."""
    role: Role
    content: str


@dataclass(frozen=True, slots=True)
class ChatResponse:
    """Provider-agnostic LLM response."""
    text: str
    model: str
    prompt_tokens: int = 0
    completion_tokens: int = 0
    # Free-form metadata (provider-specific finish_reason, safety flags, etc.).
    metadata: dict[str, str] = field(default_factory=dict)


class LLMProvider(ABC):
    """Abstract base class — every provider implements ``generate``."""

    name: str = "abstract"

    @abstractmethod
    def generate(
        self,
        messages: list[ChatMessage],
        system: str | None = None,
        max_tokens: int = 1024,
        temperature: float = 0.2,
    ) -> ChatResponse:
        """Run a single chat-completion call.

        Parameters
        ----------
        messages
            Conversation history (most recent last). Roles ``user`` and
            ``assistant`` alternate; ``system`` may appear at index 0 OR be
            passed via the ``system`` argument (provider-specific).
        system
            System / instructions string. Passed alongside messages because
            some providers (e.g. Anthropic) take it as a separate argument.
        max_tokens
            Cap on completion length.
        temperature
            Sampling temperature (0 → deterministic, 1 → creative).

        Returns
        -------
        ChatResponse
        """
