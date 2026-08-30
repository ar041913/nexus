"""In-process telemetry for latency, LLM calls, tokens, and cost."""

from __future__ import annotations

import threading
import time
import uuid
from contextlib import contextmanager
from typing import Any, Iterator

_lock = threading.Lock()
_spans: list[dict[str, Any]] = []
_llm_calls: list[dict[str, Any]] = []


def reset() -> None:
    with _lock:
        _spans.clear()
        _llm_calls.clear()


def record_span(name: str, duration_ms: float, attributes: dict[str, Any] | None = None) -> dict[str, Any]:
    span = {
        "span_id": uuid.uuid4().hex[:12],
        "span_name": name,
        "duration_ms": round(duration_ms, 2),
        "attributes": attributes or {},
        "recorded_at": time.time(),
    }
    with _lock:
        _spans.append(span)
        if len(_spans) > 2000:
            del _spans[: len(_spans) - 2000]
    return span


def record_llm(
    *,
    model: str,
    provider: str = "openai",
    prompt_tokens: int = 0,
    completion_tokens: int = 0,
    cost_usd: float = 0.0,
    latency_ms: float = 0.0,
    used_fallback: bool = False,
) -> dict[str, Any]:
    event = {
        "model": model,
        "provider": provider,
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "tokens": prompt_tokens + completion_tokens,
        "cost_usd": round(cost_usd, 6),
        "latency_ms": round(latency_ms, 2),
        "used_fallback": used_fallback,
        "recorded_at": time.time(),
    }
    with _lock:
        _llm_calls.append(event)
        if len(_llm_calls) > 500:
            del _llm_calls[: len(_llm_calls) - 500]
    record_span(
        "llm.request",
        latency_ms,
        {
            "model": model,
            "tokens": event["tokens"],
            "cost_usd": event["cost_usd"],
            "used_fallback": used_fallback,
        },
    )
    return event


@contextmanager
def span(name: str, **attributes: Any) -> Iterator[None]:
    started = time.perf_counter()
    try:
        yield
    finally:
        record_span(name, (time.perf_counter() - started) * 1000, attributes)


def estimate_cost_usd(model: str, prompt_tokens: int, completion_tokens: int) -> float:
    # Prototype rates — gpt-4o-mini list prices (USD / 1M tokens)
    rates = {
        "gpt-4o-mini": (0.15, 0.60),
        "gpt-4o": (2.50, 10.00),
    }
    inp, out = rates.get(model, (0.15, 0.60))
    return (prompt_tokens / 1_000_000) * inp + (completion_tokens / 1_000_000) * out


def summary() -> dict[str, Any]:
    with _lock:
        spans = list(_spans)
        llm = list(_llm_calls)

    api_spans = [s for s in spans if s["span_name"] == "api.request"]
    pipeline_spans = [s for s in spans if s["span_name"].startswith("pipeline.")]
    durations = [s["duration_ms"] for s in api_spans]

    def percentile(values: list[float], p: float) -> float | None:
        if not values:
            return None
        ordered = sorted(values)
        idx = min(len(ordered) - 1, max(0, int(round((p / 100) * (len(ordered) - 1)))))
        return round(ordered[idx], 2)

    return {
        "request_count": len(api_spans),
        "span_count": len(spans),
        "latency_ms": {
            "p50": percentile(durations, 50),
            "p95": percentile(durations, 95),
            "max": round(max(durations), 2) if durations else None,
        },
        "pipeline_stage_ms": {
            s["span_name"]: s["duration_ms"]
            for s in pipeline_spans[-20:]
        },
        "llm": {
            "model_calls": len(llm),
            "tokens": sum(item["tokens"] for item in llm),
            "prompt_tokens": sum(item["prompt_tokens"] for item in llm),
            "completion_tokens": sum(item["completion_tokens"] for item in llm),
            "cost_usd": round(sum(item["cost_usd"] for item in llm), 6),
            "fallback_count": sum(1 for item in llm if item["used_fallback"]),
            "recent": llm[-8:],
        },
        "recent_spans": spans[-12:],
    }
