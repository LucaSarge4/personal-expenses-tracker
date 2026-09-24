import re
import time

import httpx
from openai import OpenAI
from pydantic import BaseModel, ValidationError
from sqlmodel import Session, select

from app.db import engine
from app.models import Setting

THINK_TAG_RE = re.compile(r"<think>.*?</think>", re.DOTALL)

# Generous headroom for our largest prompts (category list + few-shot examples
# + a classification batch), without relying on a per-user `ollama create`
# step or the server's own (sometimes small) default context length.
OLLAMA_NUM_CTX = 16384


class LLMError(Exception):
    pass


def _get_llm_settings() -> tuple[str, str, str | None, int]:
    with Session(engine) as session:
        rows = {s.key: s.value for s in session.exec(select(Setting)).all()}
    base_url = rows.get("llm_base_url", "http://localhost:11434/v1")
    model = rows.get("llm_model", "qwen3:30b-a3b")
    api_key = rows.get("llm_api_key") or None
    timeout_s = int(rows.get("llm_timeout_s") or 300)
    return base_url, model, api_key, timeout_s


def _make_client(base_url: str, api_key: str | None, timeout_s: int) -> OpenAI:
    return OpenAI(base_url=base_url, api_key=api_key or "local", timeout=timeout_s)


def _strip_think(text: str) -> str:
    return THINK_TAG_RE.sub("", text).strip()


def _ollama_native_chat_url(base_url: str) -> str | None:
    """Ollama serves an OpenAI-compatible API at <host>/v1 and its own richer
    API at <host>/api. Only servers using that exact convention get the native
    fast path (which can properly disable "thinking"); anything else falls
    back to the portable OpenAI-compatible path untouched."""
    trimmed = base_url.rstrip("/")
    if not trimmed.endswith("/v1"):
        return None
    return trimmed[: -len("/v1")] + "/api/chat"


def _try_ollama_native(
    base_url: str, model: str, messages: list[dict], schema: type[BaseModel], timeout_s: int
) -> str | None:
    url = _ollama_native_chat_url(base_url)
    if url is None:
        return None
    try:
        response = httpx.post(
            url,
            json={
                "model": model,
                "messages": messages,
                "think": False,
                "stream": False,
                "format": schema.model_json_schema(),
                "options": {"temperature": 0, "num_ctx": OLLAMA_NUM_CTX},
            },
            timeout=timeout_s,
        )
        response.raise_for_status()
        return response.json()["message"]["content"]
    except (httpx.HTTPError, KeyError, ValueError):
        return None


def health() -> bool:
    base_url, _model, api_key, timeout_s = _get_llm_settings()
    client = _make_client(base_url, api_key, timeout_s)
    try:
        client.models.list()
        return True
    except Exception:
        return False


def list_models() -> list[str]:
    base_url, _model, api_key, timeout_s = _get_llm_settings()
    client = _make_client(base_url, api_key, timeout_s)
    response = client.models.list()
    return [m.id for m in response.data]


def chat_json[T: BaseModel](system: str, user: str, schema: type[T]) -> T:
    base_url, model, api_key, timeout_s = _get_llm_settings()

    user_message = user
    if "qwen3" in model.lower():
        user_message = f"{user}\n/no_think"

    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": user_message},
    ]

    response_format = {
        "type": "json_schema",
        "json_schema": {
            "name": schema.__name__,
            "schema": schema.model_json_schema(),
            "strict": True,
        },
    }

    last_error: Exception | None = None
    for _attempt in range(2):
        try:
            native_content = _try_ollama_native(base_url, model, messages, schema, timeout_s)
            if native_content is not None:
                content = native_content
            else:
                client = _make_client(base_url, api_key, timeout_s)
                completion = client.chat.completions.create(
                    model=model,
                    messages=messages,
                    temperature=0,
                    response_format=response_format,
                )
                content = completion.choices[0].message.content or ""
            content = _strip_think(content)
            return schema.model_validate_json(content)
        except ValidationError as exc:
            last_error = exc
            messages.append({"role": "assistant", "content": content})
            messages.append(
                {
                    "role": "user",
                    "content": (
                        f"Your previous response was invalid: {exc}. Reply with valid JSON only."
                    ),
                }
            )
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            break

    raise LLMError(f"LLM call failed after retry: {last_error}")


def timed_test_call() -> dict[str, object]:
    class _Ping(BaseModel):
        ok: bool

    start = time.monotonic()
    try:
        result = chat_json(
            system="Reply with a JSON object matching the schema.",
            user='Reply with {"ok": true}.',
            schema=_Ping,
        )
        latency_ms = round((time.monotonic() - start) * 1000, 1)
        return {"ok": result.ok, "latency_ms": latency_ms}
    except LLMError as exc:
        latency_ms = round((time.monotonic() - start) * 1000, 1)
        return {"ok": False, "latency_ms": latency_ms, "error": str(exc)}
