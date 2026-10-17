"""LLM client behavior around settings, connectivity checks and failures.
(Prompt/response handling of chat_json is covered in test_llm_client.py.)"""

from types import SimpleNamespace

import pytest
from pydantic import BaseModel
from sqlmodel import Session, select

from app.db import engine
from app.llm import client as llm
from app.models import Setting


class _Schema(BaseModel):
    value: int


@pytest.fixture
def llm_settings():
    """Temporarily overrides LLM settings rows, restoring the originals after."""
    with Session(engine) as session:
        original = {s.key: s.value for s in session.exec(select(Setting)).all()}

    def apply(**values: str) -> None:
        with Session(engine) as session:
            for key, value in values.items():
                row = session.get(Setting, key)
                if row is None:
                    session.add(Setting(key=key, value=value))
                else:
                    row.value = value
            session.commit()

    yield apply

    with Session(engine) as session:
        for row in session.exec(select(Setting)).all():
            if row.key in original:
                row.value = original[row.key]
            else:
                session.delete(row)
        session.commit()


def test_settings_are_read_from_the_database(llm_settings):
    llm_settings(
        llm_base_url="http://127.0.0.1:1234/v1",
        llm_model="gemma",
        llm_api_key="secret",
        llm_timeout_s="42",
    )
    assert llm._get_llm_settings() == ("http://127.0.0.1:1234/v1", "gemma", "secret", 42)


def test_blank_api_key_and_timeout_fall_back_to_defaults(llm_settings):
    llm_settings(llm_api_key="", llm_timeout_s="")
    _base, _model, api_key, timeout_s = llm._get_llm_settings()
    assert api_key is None
    assert timeout_s == 300


def test_client_uses_a_placeholder_key_for_local_servers():
    client = llm._make_client("http://localhost:11434/v1", None, 10)
    assert client.api_key == "local"
    assert str(client.base_url).startswith("http://localhost:11434/v1")


class _Models:
    def __init__(self, ids: list[str] | None = None, error: Exception | None = None) -> None:
        self._ids = ids or []
        self._error = error

    def list(self):
        if self._error:
            raise self._error
        return SimpleNamespace(data=[SimpleNamespace(id=i) for i in self._ids])


def _fake_client(monkeypatch, models: _Models) -> None:
    monkeypatch.setattr(llm, "_make_client", lambda *a, **k: SimpleNamespace(models=models))


def test_list_models_returns_model_ids(monkeypatch):
    _fake_client(monkeypatch, _Models(["gemma4:26b", "qwen3:8b"]))
    assert llm.list_models() == ["gemma4:26b", "qwen3:8b"]


def test_health_reports_reachability(monkeypatch):
    _fake_client(monkeypatch, _Models(["m"]))
    assert llm.health() is True
    _fake_client(monkeypatch, _Models(error=ConnectionError("refused")))
    assert llm.health() is False


def test_transport_errors_are_not_retried(monkeypatch):
    monkeypatch.setattr(llm, "_get_llm_settings", lambda: ("http://x/v1", "gemma", None, 5))
    monkeypatch.setattr(llm, "_try_ollama_native", lambda *a, **k: None)
    calls = []

    def create(**kwargs):
        calls.append(kwargs)
        raise TimeoutError("server too slow")

    chat = SimpleNamespace(completions=SimpleNamespace(create=create))
    monkeypatch.setattr(llm, "_make_client", lambda *a, **k: SimpleNamespace(chat=chat))

    with pytest.raises(llm.LLMError, match="server too slow"):
        llm.chat_json("sys", "user", _Schema)
    assert len(calls) == 1


def test_no_think_suffix_only_for_qwen3(monkeypatch):
    monkeypatch.setattr(llm, "_get_llm_settings", lambda: ("http://x/v1", "gemma4:26b", None, 5))
    seen = []

    def native(base_url, model, messages, schema, timeout_s):
        seen.append(messages)
        return '{"value": 1}'

    monkeypatch.setattr(llm, "_try_ollama_native", native)
    llm.chat_json("sys", "hello", _Schema)
    assert seen[0][1]["content"] == "hello"


def test_timed_test_call_reports_success_with_latency(monkeypatch):
    monkeypatch.setattr(llm, "chat_json", lambda system, user, schema: schema(ok=True))
    result = llm.timed_test_call()
    assert result["ok"] is True
    assert isinstance(result["latency_ms"], float)
    assert "error" not in result


def test_timed_test_call_reports_the_error(monkeypatch):
    def fail(system, user, schema):
        raise llm.LLMError("connection refused")

    monkeypatch.setattr(llm, "chat_json", fail)
    result = llm.timed_test_call()
    assert result["ok"] is False
    assert result["error"] == "connection refused"
