"""KPI semantic contracts: YAML registry, JSON Schema validation, SQL templates."""

from __future__ import annotations

import hashlib
import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

PACKAGE_ROOT = Path(__file__).parent
KPI_DIR = PACKAGE_ROOT / "kpis"
SCHEMA_PATH = PACKAGE_ROOT / "schemas" / "kpi_contract.json"
REPO_ROOT = PACKAGE_ROOT.parent.parent

REQUIRED_IDS = [
    "revenue",
    "units_sold",
    "average_selling_price",
    "inventory_availability",
    "on_time_delivery",
    "customer_complaints",
    "marketing_spend",
]


class ContractError(ValueError):
    """Invalid KPI contract."""


def _parse_scalar(raw: str) -> Any:
    text = raw.strip()
    if text in ("null", "~", ""):
        return None
    if text in ("true", "True"):
        return True
    if text in ("false", "False"):
        return False
    if (text.startswith('"') and text.endswith('"')) or (text.startswith("'") and text.endswith("'")):
        return text[1:-1]
    try:
        if "." in text:
            return float(text)
        return int(text)
    except ValueError:
        return text


def _parse_flow_list(raw: str) -> list[Any]:
    inner = raw.strip()[1:-1].strip()
    if not inner:
        return []
    return [_parse_scalar(part) for part in inner.split(",")]


def _parse_flow_dict(raw: str) -> dict[str, Any]:
    text = raw.strip()
    if text == "{}":
        return {}
    inner = text[1:-1].strip()
    if not inner:
        return {}
    result: dict[str, Any] = {}
    for item in inner.split(","):
        if ":" not in item:
            raise ContractError(f"Invalid YAML mapping entry near '{item}'")
        key, value = item.split(":", 1)
        result[key.strip()] = _parse_scalar(value.strip())
    return result


def _parse_simple_yaml(text: str) -> dict[str, Any]:
    """Minimal YAML subset parser for KPI contracts (no PyYAML required)."""
    lines = text.replace("\t", "  ").splitlines()
    root: dict[str, Any] = {}
    stack: list[tuple[int, Any, str | None]] = [(-1, root, None)]

    i = 0
    while i < len(lines):
        raw = lines[i]
        if not raw.strip() or raw.strip().startswith("#"):
            i += 1
            continue
        indent = len(raw) - len(raw.lstrip(" "))
        stripped = raw.strip()

        while stack and indent <= stack[-1][0] and stack[-1][0] != -1:
            stack.pop()
        parent = stack[-1][1]

        if stripped.startswith("- "):
            item_raw = stripped[2:]
            if isinstance(parent, list):
                if ": " in item_raw or item_raw.endswith(":"):
                    key, _, rest = item_raw.partition(":")
                    key = key.strip()
                    rest = rest.strip()
                    item: dict[str, Any] = {}
                    if rest:
                        item[key] = _parse_scalar(rest)
                        parent.append(item)
                        stack.append((indent, item, None))
                    else:
                        item[key] = {}
                        parent.append(item)
                        stack.append((indent, item[key], key))
                else:
                    parent.append(_parse_scalar(item_raw))
            i += 1
            continue

        key, _, rest = stripped.partition(":")
        key = key.strip()
        rest = rest.strip()
        if not isinstance(parent, dict):
            raise ContractError(f"Invalid YAML structure near '{key}'")

        if rest.startswith("{") and rest.endswith("}"):
            parent[key] = _parse_flow_dict(rest)
        elif rest.startswith("[") and rest.endswith("]"):
            parent[key] = _parse_flow_list(rest)
        elif rest in (">", "|"):
            block: list[str] = []
            i += 1
            while i < len(lines):
                nxt = lines[i]
                if not nxt.strip():
                    block.append("")
                    i += 1
                    continue
                nxt_indent = len(nxt) - len(nxt.lstrip(" "))
                if nxt_indent <= indent:
                    break
                block.append(nxt.strip())
                i += 1
            parent[key] = " ".join(part for part in block if part)
            continue
        elif rest == "":
            # Peek next non-empty line to decide dict vs list
            j = i + 1
            child: Any = {}
            while j < len(lines) and (not lines[j].strip() or lines[j].strip().startswith("#")):
                j += 1
            if j < len(lines):
                nxt = lines[j]
                nxt_indent = len(nxt) - len(nxt.lstrip(" "))
                if nxt_indent > indent and nxt.strip().startswith("- "):
                    child = []
            parent[key] = child
            stack.append((indent, child, key))
        else:
            parent[key] = _parse_scalar(rest)
        i += 1
    return root


def _type_ok(value: Any, expected: dict[str, Any]) -> bool:
    types = expected.get("type")
    if types is None:
        return True
    if not isinstance(types, list):
        types = [types]
    mapping = {
        "object": dict,
        "array": list,
        "string": str,
        "number": (int, float),
        "integer": int,
        "boolean": bool,
        "null": type(None),
    }
    for t in types:
        py = mapping.get(t)
        if py is None:
            continue
        if t == "number" and isinstance(value, bool):
            continue
        if isinstance(value, py):
            return True
    return False


def validate_contract(data: dict[str, Any], schema: dict[str, Any] | None = None) -> list[str]:
    schema = schema or json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    errors: list[str] = []

    def walk(node: Any, spec: dict[str, Any], path: str) -> None:
        if not _type_ok(node, spec):
            errors.append(f"{path}: expected {spec.get('type')}, got {type(node).__name__}")
            return
        if "enum" in spec and node not in spec["enum"]:
            errors.append(f"{path}: {node!r} not in {spec['enum']}")
        if spec.get("type") == "string":
            if "minLength" in spec and len(node) < spec["minLength"]:
                errors.append(f"{path}: shorter than minLength")
            if "pattern" in spec and not re.match(spec["pattern"], node):
                errors.append(f"{path}: does not match {spec['pattern']}")
        if spec.get("type") == "object" and isinstance(node, dict):
            for req in spec.get("required", []):
                if req not in node:
                    errors.append(f"{path}: missing required field '{req}'")
            props = spec.get("properties", {})
            for key, child in node.items():
                if key in props:
                    walk(child, props[key], f"{path}.{key}" if path else key)
        if spec.get("type") == "array" and isinstance(node, list):
            if "minItems" in spec and len(node) < spec["minItems"]:
                errors.append(f"{path}: fewer than minItems")
            item_spec = spec.get("items")
            if item_spec:
                for idx, item in enumerate(node):
                    walk(item, item_spec, f"{path}[{idx}]")

    walk(data, schema, "")
    if data.get("formula_type") == "sql" and not data.get("sql_template"):
        errors.append("sql_template is required when formula_type=sql")
    if data.get("formula_type") == "derived" and not data.get("derived_from"):
        errors.append("derived_from is required when formula_type=derived")
    return errors


@lru_cache(maxsize=1)
def load_contracts() -> list[dict[str, Any]]:
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    contracts: list[dict[str, Any]] = []
    for path in sorted(KPI_DIR.glob("*.yaml")):
        parsed = _parse_simple_yaml(path.read_text(encoding="utf-8"))
        errors = validate_contract(parsed, schema)
        if errors:
            raise ContractError(f"{path.name}: " + "; ".join(errors))
        if parsed.get("id") != path.stem:
            raise ContractError(f"{path.name}: id must match filename")
        contracts.append(parsed)
    ids = [c["id"] for c in contracts]
    missing = [kpi_id for kpi_id in REQUIRED_IDS if kpi_id not in ids]
    if missing:
        raise ContractError(f"Missing KPI contracts: {missing}")
    order = {kpi_id: i for i, kpi_id in enumerate(REQUIRED_IDS)}
    contracts.sort(key=lambda c: order.get(c["id"], 99))
    return contracts


def get_contract(kpi_id: str) -> dict[str, Any]:
    for contract in load_contracts():
        if contract["id"] == kpi_id:
            return contract
    raise KeyError(kpi_id)


def sql_template_path(contract: dict[str, Any]) -> Path | None:
    rel = contract.get("sql_template")
    if not rel:
        return None
    return REPO_ROOT / rel


def sql_template_hash(contract: dict[str, Any]) -> str | None:
    path = sql_template_path(contract)
    if path is None or not path.exists():
        return None
    return hashlib.sha256(path.read_text(encoding="utf-8").encode("utf-8")).hexdigest()


def execute_sql_kpi(conn, contract: dict[str, Any], period_start: str, period_end: str) -> float:
    path = sql_template_path(contract)
    if path is None:
        raise ContractError(f"{contract['id']} has no SQL template")
    sql = path.read_text(encoding="utf-8").strip().rstrip(";")
    placeholders = sql.count("?")
    params = [period_start, period_end] * (placeholders // 2)
    if placeholders % 2:
        params.append(period_start)
    row = conn.execute(sql, params).fetchone()
    value = row[0] if row else None
    return float(value) if value is not None else 0.0
