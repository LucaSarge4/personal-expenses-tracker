from types import SimpleNamespace

import httpx
import pytest
from pydantic import BaseModel

from app.llm.client import LLMError, _ollama_native_chat_url, _try_ollama_native, chat_json


class _Schema(BaseModel):
    value: int


class _FakeCompletions:
    def __init__(self, responses: list[str]) -> None:
        self._responses = list(responses)
        self.calls: list[list[dict]] = []

    def create(self, model, messages, temperature, response_format):  # noqa: ANN001
        self.calls.append(messages)
        content = self._responses.pop(0)
        message = SimpleNamespace(content=content)
        return SimpleNamespace(choices=[SimpleNamespace(message=message)])


class _FakeClient:
    def __init__(self, responses: list[str]) -> None:
        self.chat = SimpleNamespace(completions=_FakeCompletions(responses))


@pytest.fixture(autouse=True)
def _patch_settings(monkeypatch):
    monkeypatch.setattr(
        "app.llm.client._get_llm_settings",
        lambda: ("http://localhost:11434/v1", "qwen3:8b", None, 300),
    )
    # Force the fallback (portable OpenAI-compatible) path in these unit
    # tests; the Ollama-native fast path is covered separately.
    monkeypatch.setattr("app.llm.client._try_ollama_native", lambda *a, **k: None)


def test_chat_json_valid_output(monkeypatch):
    fake = _FakeClient(['{"value": 42}'])
    monkeypatch.setattr("app.llm.client._make_client", lambda *a, **k: fake)

    result = chat_json(system="sys", user="user", schema=_Schema)

    assert result.value == 42
    # /no_think should be appended for qwen3 models
    assert "/no_think" in fake.chat.completions.calls[0][1]["content"]


def test_chat_json_strips_thinking_tags(monkeypatch):
    fake = _FakeClient(["<think>pondering...</think>\n" + '{"value": 7}'])
    monkeypatch.setattr("app.llm.client._make_client", lambda *a, **k: fake)

    result = chat_json(system="sys", user="user", schema=_Schema)

    assert result.value == 7


def test_chat_json_retries_once_then_succeeds(monkeypatch):
    fake = _FakeClient(["not json at all", '{"value": 3}'])
    monkeypatch.setattr("app.llm.client._make_client", lambda *a, **k: fake)

    result = chat_json(system="sys", user="user", schema=_Schema)

    assert result.value == 3
    assert len(fake.chat.completions.calls) == 2


def test_chat_json_raises_after_two_failures(monkeypatch):
    fake = _FakeClient(["nope", "still nope"])
    monkeypatch.setattr("app.llm.client._make_client", lambda *a, **k: fake)

    with pytest.raises(LLMError):
        chat_json(system="sys", user="user", schema=_Schema)


def test_ollama_native_chat_url_for_v1_base():
    assert _ollama_native_chat_url("http://localhost:11434/v1") == "http://localhost:11434/api/chat"
    assert (
        _ollama_native_chat_url("http://localhost:11434/v1/") == "http://localhost:11434/api/chat"
    )


def test_ollama_native_chat_url_none_for_non_v1_base():
    # LM Studio's OpenAI-compat endpoint also happens to live at /v1, so URL
    # shape alone can't distinguish it from Ollama (native attempt is tried
    # and falls back silently if it's not actually Ollama). A base URL that
    # doesn't end in /v1 at all is unambiguously rejected up front.
    assert _ollama_native_chat_url("http://localhost:1234/api/v0") is None


def test_try_ollama_native_returns_content_on_success(monkeypatch):
    def fake_post(url, json, timeout):  # noqa: ANN001
        assert url == "http://localhost:11434/api/chat"
        assert json["think"] is False
        request = httpx.Request("POST", url)
        return httpx.Response(200, json={"message": {"content": '{"value": 5}'}}, request=request)

    monkeypatch.setattr("app.llm.client.httpx.post", fake_post)

    content = _try_ollama_native(
        "http://localhost:11434/v1", "gemma4:26b-a4b-it-qat", [], _Schema, 300
    )
    assert content == '{"value": 5}'


def test_try_ollama_native_falls_back_silently_on_error(monkeypatch):
    def fake_post(url, json, timeout):  # noqa: ANN001
        raise httpx.ConnectError("connection refused", request=httpx.Request("POST", url))

    monkeypatch.setattr("app.llm.client.httpx.post", fake_post)

    content = _try_ollama_native(
        "http://localhost:11434/v1", "gemma4:26b-a4b-it-qat", [], _Schema, 300
    )
    assert content is None


def test_try_ollama_native_skipped_for_non_v1_base_url():
    content = _try_ollama_native("http://localhost:1234/api/v0", "some-model", [], _Schema, 300)
    assert content is None


def test_chat_json_uses_native_path_when_available(monkeypatch):
    monkeypatch.setattr("app.llm.client._try_ollama_native", lambda *a, **k: '{"value": 99}')
    # Make the OpenAI-compatible fallback explode if it's ever reached.
    monkeypatch.setattr(
        "app.llm.client._make_client",
        lambda *a, **k: (_ for _ in ()).throw(AssertionError("fallback should not run")),
    )

    result = chat_json(system="sys", user="user", schema=_Schema)
    assert result.value == 99
