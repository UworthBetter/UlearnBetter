# -*- coding: utf-8 -*-
"""修正落空报告：`--decisions <overrides.jsonl>`（只读）。

对每条指向本主题的 Override（target 为 `topic:` / `concept:` /
`procedure:` / `procitem:` / `relation:` 且带本主题 ID）判断目标是否仍
存在，输出三类状态：

- `applied`   目标仍存在；
- `orphaned`  目标已消失，附最后已知标签（来自上一版 learn.json）；
- `inherited` 目标 ID 本轮是继承来的（笔记移动但标题/别名相同）。

**不修改 learn.json**——用户修正在读取时由后端叠加（本轮裁决 3）。
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Dict, List, Optional, Tuple

TOPIC_KINDS = ("topic", "concept", "procedure", "procitem", "relation")


def load_overrides(path: Path) -> List[dict]:
    overrides: List[dict] = []
    for lineno, line in enumerate(
            path.read_text(encoding="utf-8").splitlines(), start=1):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        try:
            obj = json.loads(line)
        except ValueError:
            overrides.append({"id": "<line %d>" % lineno,
                              "_parse_error": line[:120],
                              "target": "", "op": ""})
            continue
        if isinstance(obj, dict):
            overrides.append(obj)
    return overrides


def evaluate_decisions(overrides: List[dict], doc: dict,
                       previous: Optional[dict],
                       id_map: Optional[dict] = None) -> dict:
    topic_id = doc["topic"]["id"]
    concepts = {c["id"]: c for c in doc.get("concepts", [])}
    inherited_ids = {c["id"] for c in doc.get("concepts", [])
                     if c.get("id_origin") == "inherited"}
    procedures = {p["id"]: p for p in doc.get("procedures", [])}
    procitems = {(p["id"], it["id"])
                 for p in doc.get("procedures", [])
                 for g in p.get("groups", [])
                 for it in g.get("items", [])}

    prev_concepts = {c["id"]: c for c in (previous or {}).get("concepts", [])}
    prev_procs = {p["id"]: p for p in (previous or {}).get("procedures", [])}
    prev_items = {(p["id"], it["id"]): it
                  for p in (previous or {}).get("procedures", [])
                  for g in p.get("groups", [])
                  for it in g.get("items", [])}
    # ID 映射是最后已知标签的第二来源（路径消失的旧条目仍留在映射里），
    # 保证「重新编译两次结论不变」
    map_labels = _labels_from_id_map(id_map or {})

    entries = []
    skipped = 0
    parse_errors = 0
    statuses = {"applied": 0, "orphaned": 0, "inherited": 0}
    for ov in overrides:
        if ov.get("_parse_error") is not None:
            parse_errors += 1
            continue
        kind, ref = _parse_target(ov.get("target"))
        if kind is None or kind not in TOPIC_KINDS:
            skipped += 1
            continue
        if not _in_topic(kind, ref, topic_id):
            skipped += 1
            continue
        status, label = _classify(kind, ref, topic_id, concepts,
                                  inherited_ids, procedures, procitems,
                                  prev_concepts, prev_procs, prev_items,
                                  map_labels)
        statuses[status] += 1
        entries.append({
            "overrideId": ov.get("id"),
            "op": ov.get("op"),
            "target": ov.get("target"),
            "status": status,
            "lastKnownLabel": label,
        })
    return {
        "total": len(overrides),
        "parseErrors": parse_errors,
        "inTopic": len(entries),
        "skippedOtherTopic": skipped,
        "statuses": statuses,
        "entries": entries,
    }


def _labels_from_id_map(id_map: dict) -> dict:
    """从 ID 映射提取最后已知标签：concept id → label、procedure id →
    title、(procedure id, item id) → text。"""
    out: dict = {"concept": {}, "procedure": {}, "procitem": {}}
    for entry in (id_map.get("concepts") or {}).values():
        if isinstance(entry, dict) and entry.get("id"):
            out["concept"][entry["id"]] = entry.get("label")
    proc_ids: Dict[str, str] = {}
    for rel, entry in (id_map.get("procedures") or {}).items():
        if isinstance(entry, dict) and entry.get("id"):
            out["procedure"][entry["id"]] = entry.get("title")
            proc_ids[rel] = entry["id"]
    for rel, items in (id_map.get("procitems") or {}).items():
        pid = proc_ids.get(rel)
        if not pid or not isinstance(items, dict):
            continue
        for info in items.values():
            if isinstance(info, dict) and info.get("id"):
                out["procitem"][(pid, info["id"])] = info.get("text")
    return out


# ---------------------------------------------------------------- 解析

def _parse_target(target) -> Tuple[Optional[str], str]:
    if not isinstance(target, str) or ":" not in target:
        return None, ""
    kind, rest = target.split(":", 1)
    return kind, rest


def _in_topic(kind: str, ref: str, topic_id: str) -> bool:
    if kind == "topic":
        return ref == topic_id
    return ref.startswith(topic_id + "/")


def _classify(kind, ref, topic_id, concepts, inherited_ids, procedures,
              procitems, prev_concepts, prev_procs, prev_items, map_labels):
    """返回 (status, lastKnownLabel)。最后已知标签：上一版 learn.json
    优先，其次 ID 映射里的历史条目。"""
    if kind == "topic":
        return "applied", None
    rest = ref[len(topic_id) + 1:]
    if kind == "concept":
        cid = rest
        if cid in concepts:
            status = "inherited" if cid in inherited_ids else "applied"
            return status, concepts[cid].get("label")
        label = (prev_concepts.get(cid) or {}).get("label") \
            or map_labels["concept"].get(cid)
        return "orphaned", label
    if kind == "procedure":
        if rest in procedures:
            return "applied", procedures[rest].get("title")
        label = (prev_procs.get(rest) or {}).get("title") \
            or map_labels["procedure"].get(rest)
        return "orphaned", label
    if kind == "procitem":
        pid, _, iid = rest.partition("/")
        if (pid, iid) in procitems:
            return "applied", None
        prev_item = prev_items.get((pid, iid))
        if prev_item is not None:
            return "orphaned", prev_item.get("text")
        label = map_labels["procitem"].get((pid, iid))
        if label is not None:
            return "orphaned", label
        return "orphaned", (prev_procs.get(pid) or {}).get("title") \
            or map_labels["procedure"].get(pid)
    if kind == "relation":
        a, _, b = rest.partition("~")
        if a in concepts and b in concepts:
            status = "inherited" if (a in inherited_ids or
                                     b in inherited_ids) else "applied"
            return status, "%s ~ %s" % (concepts[a].get("label"),
                                        concepts[b].get("label"))
        la = (prev_concepts.get(a) or {}).get("label") \
            or map_labels["concept"].get(a)
        lb = (prev_concepts.get(b) or {}).get("label") \
            or map_labels["concept"].get(b)
        if la or lb:
            return "orphaned", "%s ~ %s" % (la or a, lb or b)
        return "orphaned", None
    return "orphaned", None
