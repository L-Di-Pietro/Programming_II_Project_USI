"""LLM provider tests — verify the abstraction layer behaves correctly even
without any external API."""

from __future__ import annotations

import pytest

from backend.config import Settings
from backend.llm import ChatMessage, GeminiProvider, LLMFactory, NullProvider


def test_null_provider_returns_canned_text():
    p = NullProvider()
    response = p.generate(messages=[ChatMessage(role="user", content="hello")])
    assert "DEMO MODE" in response.text
    assert response.model == "null-provider"
    assert response.metadata.get("demo") == "true"


def test_null_provider_is_deterministic():
    p = NullProvider()
    msg = [ChatMessage(role="user", content="repeat me")]
    a = p.generate(messages=msg)
    b = p.generate(messages=msg)
    assert a.text == b.text


def test_factory_returns_null_when_disabled():
    s = Settings(llm_enabled=False, llm_provider="gemini")
    provider = LLMFactory.from_settings(s)
    assert isinstance(provider, NullProvider)


def test_factory_returns_gemini_when_enabled():
    s = Settings(llm_enabled=True, llm_provider="gemini", gemini_api_key="fake")
    provider = LLMFactory.from_settings(s)
    assert isinstance(provider, GeminiProvider)


def test_gemini_provider_raises_until_implemented():
    p = GeminiProvider(api_key="fake")
    with pytest.raises(NotImplementedError):
        p.generate(messages=[ChatMessage(role="user", content="hi")])


def test_gemini_provider_rejects_empty_key():
    with pytest.raises(ValueError):
        GeminiProvider(api_key="")


def test_factory_unknown_provider_raises():
    s = Settings(llm_enabled=True, llm_provider="bogus-llm")
    with pytest.raises(ValueError):
        LLMFactory.from_settings(s)
