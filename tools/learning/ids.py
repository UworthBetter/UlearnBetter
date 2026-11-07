# -*- coding: utf-8 -*-
"""稳定 ID：主题 / 概念 / 块 / 实操清单项的 ID 规则与映射文件。

映射文件 `<out>/learn-ids.json`（learning.learn-ids/0.1）只在输出目录里
维护，绝不写回笔记。规则（优先级从高到低）：

- 主题：学习主页 frontmatter `topic_id` > 映射文件 > 首次编译时目录名
  slug，之后固定。改目录名后用 `--ids <旧映射>` 或同一输出目录仍保持
  原 ID。
- 概念：frontmatter `id` > 映射里同一路径的 ID > 路径消失且恰好一个新
  笔记标题或别名集合相同时继承（报告 id_inherited）> 新 slug。
  改标题、不改路径时 ID 不变。冲突时加后缀并报告，不静默覆盖。
- 块：`<cid>.<shape>.<hash8>`，hash 基于内容锚点（块类型 + 规范化后的
  标题 / 表头 / 首行文本）；同锚点重复时按出现序加后缀。表格行、列表
  项重排与无关段落增删不改变 ID。
- 实操清单：块 ID 由映射按笔记路径固定；清单项 ID `t<hash8>` 基于规范化
  文本锚点，供 checklist 事件与 `procitem:` 引用。
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from mdparse import normalize_for_match, slugify, strip_md
from topic import ScannedNote, TopicIndex

IDS_SCHEMA = "learning.learn-ids/0.1"

# SubjectRef 允许的 ID 字符（与 schemas/record 契约一致）
ID_MAX_LEN = 120


# ---------------------------------------------------------------- 映射文件

def new_map(topic_id: str, origin: str, dir_name: str) -> dict:
    return {
        "schema": IDS_SCHEMA,
        "topicId": topic_id,
        "topicIdOrigin": origin,
        "dirName": dir_name,
        "concepts": {},      # rel_path -> {id,label,aliases,idOrigin,titles[]}
        "procedures": {},    # rel_path -> {id,title}
        "blocks": {},        # rel_path -> {anchor -> [blockId, ...]}
        "procitems": {},     # rel_path -> {anchorNorm -> itemId}
    }


def load_ids(path: Optional[Path]) -> Optional[dict]:
    if path is None or not path.exists():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except ValueError:
        return None
    if not isinstance(data, dict) or data.get("schema") != IDS_SCHEMA:
        return None
    return data


def save_ids(path: Path, id_map: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(id_map, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8")


# ---------------------------------------------------------------- 主题

def resolve_topic_id(idx: TopicIndex, id_map: Optional[dict]) -> Tuple[str, str]:
    """返回 (topic_id, origin)。frontmatter > 映射文件 > 目录名 slug。"""
    home = idx.home
    if home is not None:
        fm = home.doc.frontmatter.get("topic_id")
        if isinstance(fm, str) and fm.strip():
            return _safe_id(slugify(fm)), "frontmatter"
    if id_map and isinstance(id_map.get("topicId"), str) and id_map["topicId"]:
        return id_map["topicId"], "id-map"
    return _safe_id(slugify(idx.root.name)), "dir-slug"


def _safe_id(cid: str) -> str:
    return (cid or "topic")[:ID_MAX_LEN]


# ---------------------------------------------------------------- 概念

def concept_label(note: ScannedNote) -> str:
    return strip_md(note.doc.h1 or note.doc.title) or note.stem


def concept_aliases(note: ScannedNote) -> List[str]:
    aliases = note.doc.frontmatter.get("aliases")
    if isinstance(aliases, list):
        return [str(a) for a in aliases if a]
    if isinstance(aliases, str) and aliases.strip():
        return [aliases.strip()]
    return []


def assign_concept_ids(idx: TopicIndex, id_map: Optional[dict],
                       issues: List[dict]) -> Dict[str, dict]:
    """为每个概念笔记分配稳定 ID。返回 rel_path -> 分配信息：

    {id, id_origin, label, aliases}。同时向 id_map（原地更新，可为新映射）
    写入概念表并处理继承。
    """
    concepts_map: Dict[str, dict] = {}
    if id_map is not None:
        concepts_map = id_map.setdefault("concepts", {})

    # ---- 第一遍：frontmatter > 同路径映射 > 新 slug
    assigned: Dict[str, dict] = {}
    used_ids: Dict[str, str] = {}   # id -> rel_path（冲突报告用）
    for note in idx.concepts:
        rel = note.rel_path
        label = concept_label(note)
        aliases = concept_aliases(note)
        old = concepts_map.get(rel)
        fm_id = note.doc.frontmatter.get("id")
        if isinstance(fm_id, str) and fm_id.strip():
            cid = _safe_id(slugify(fm_id))
            origin = "frontmatter"
            if old and old.get("id") and old["id"] != cid:
                issues.append({
                    "kind": "concept_id_frontmatter_override", "note": rel,
                    "detail": "frontmatter id %s 覆盖映射中的 %s，ID 已变化"
                              % (cid, old["id"])})
        elif old and old.get("id"):
            cid = old["id"]
            origin = "id-map"
        else:
            cid = _safe_id(slugify(note.doc.title or note.stem))
            origin = "title-slug"
        cid = _dedupe(cid, used_ids, rel, issues)
        used_ids[cid] = rel
        assigned[rel] = {"id": cid, "id_origin": origin,
                         "label": label, "aliases": aliases}

    # ---- 第二遍：继承（旧路径消失，新笔记标题/别名集合相同）
    _inherit(idx, id_map, concepts_map, assigned, used_ids, issues)
    return assigned


def _dedupe(cid: str, used_ids: Dict[str, str], rel: str,
            issues: List[dict]) -> str:
    base, n = cid, 2
    while cid in used_ids:
        cid = "%s-%d" % (base, n)
        n += 1
    if cid != base:
        issues.append({
            "kind": "concept_id_collision", "note": rel,
            "detail": "id 冲突（%s 已被 %s 使用），改用 %s"
                      % (base, used_ids[base], cid)})
    return cid


def _alias_set_key(aliases: List[str]) -> Tuple[str, ...]:
    return tuple(sorted({normalize_for_match(a) for a in aliases if
                         normalize_for_match(a)}))


def _inherit(idx: TopicIndex, id_map: Optional[dict],
             concepts_map: Dict[str, dict], assigned: Dict[str, dict],
             used_ids: Dict[str, str], issues: List[dict]) -> None:
    if not id_map:
        return
    current_paths = set(assigned)
    # 候选 = 本次以新 slug 生成的概念（frontmatter 与映射命中的不参与）
    candidates = {rel: info for rel, info in assigned.items()
                  if info["id_origin"] == "title-slug"}
    for old_rel, old in sorted(concepts_map.items()):
        if old_rel in current_paths:
            continue
        old_titles = {normalize_for_match(t) for t in old.get("titles", [])
                      if normalize_for_match(t)}
        if old.get("label"):
            old_titles.add(normalize_for_match(old["label"]))
        old_alias_key = _alias_set_key(old.get("aliases", []))
        matches = []
        for rel, info in candidates.items():
            if info["id_origin"] != "title-slug":
                continue
            title_hit = normalize_for_match(info["label"]) in old_titles
            alias_hit = (old_alias_key and old_alias_key != ()
                         and _alias_set_key(info["aliases"]) == old_alias_key)
            if title_hit or alias_hit:
                matches.append((rel, info))
        if not matches:
            continue
        if len(matches) > 1:
            issues.append({
                "kind": "concept_id_inherit_conflict", "note": old_rel,
                "detail": "原概念 %s（id=%s）消失后有 %d 个同名新笔记"
                          "（%s），不继承，保留各新 ID"
                          % (old_rel, old.get("id"), len(matches),
                             "、".join(r for r, _ in matches))})
            continue
        new_rel, info = matches[0]
        old_id = old.get("id")
        if not old_id:
            continue
        # 让出第一遍占用的新 slug，再接管旧 ID（冲突时加后缀）
        if used_ids.get(info["id"]) == new_rel:
            del used_ids[info["id"]]
        new_id = old_id
        if new_id in used_ids and used_ids[new_id] != new_rel:
            new_id = _dedupe(new_id, used_ids, new_rel, issues)
        used_ids[new_id] = new_rel
        info["id"] = new_id
        info["id_origin"] = "inherited"
        # 候选已不再是新 slug
        del candidates[new_rel]
        issues.append({
            "kind": "id_inherited", "note": new_rel,
            "detail": "原路径 %s 的 id=%s 由本笔记继承（标题/别名相同）"
                      % (old_rel, new_id)})


def update_concept_map(id_map: dict, assigned: Dict[str, dict]) -> None:
    """编译成功后把当前概念写回映射（含标题历史）。"""
    concepts_map = id_map.setdefault("concepts", {})
    for rel, info in assigned.items():
        entry = concepts_map.get(rel)
        if entry is None:
            concepts_map[rel] = {
                "id": info["id"],
                "label": info["label"],
                "aliases": list(info["aliases"]),
                "idOrigin": info["id_origin"],
                "titles": [info["label"]],
            }
            continue
        entry["id"] = info["id"]
        entry["aliases"] = list(info["aliases"])
        entry["idOrigin"] = info["id_origin"]
        titles = entry.setdefault("titles", [])
        if entry.get("label") and entry["label"] not in titles:
            titles.append(entry["label"])
        if info["label"] not in titles:
            titles.append(info["label"])
        entry["label"] = info["label"]


# ---------------------------------------------------------------- 块锚点

def anchor_hash(*parts: str) -> str:
    """内容锚点哈希：规范化各部分后取 sha1 前 8 位。"""
    text = "\x1f".join(normalize_for_match(p) for p in parts)
    return hashlib.sha1(text.encode("utf-8")).hexdigest()[:8]


def assign_block_ids(concept_id: str, blocks: List[dict],
                     id_map: Optional[dict], note_rel: str) -> None:
    """按内容锚点分配块 ID：`<cid>.<shape>.<hash8>`，同锚点按出现序加
    后缀 `.2`、`.3`。definition（每概念唯一）保持 `<cid>.def`，structure
    保持 `<cid>.overview`。已有 ID 的块（frontmatter 标注注入等）不动。

    comparison / process 块由 blocks.py 携带临时 `_anchor` 键（规范化前
    的「标题 / 表头」拼接），此处消费并移除，绝不写入产物。
    """
    block_map: Dict[str, List[str]] = {}
    if id_map is not None:
        block_map = id_map.setdefault("blocks", {}).setdefault(note_rel, {})
    seen: Dict[str, int] = {}
    for block in blocks:
        if block.get("id"):
            block.pop("_anchor", None)
            continue
        shape = block.get("shape")
        anchor_text = block.pop("_anchor", "")
        if shape == "definition":
            block["id"] = "%s.def" % concept_id
            continue
        if shape == "structure":
            block["id"] = "%s.overview" % concept_id
            continue
        h = anchor_hash(shape, anchor_text)
        key = "%s.%s" % (shape, h)
        n = seen.get(key, 0) + 1
        seen[key] = n
        suffix = "" if n == 1 else ".%d" % n
        block["id"] = "%s.%s.%s%s" % (concept_id, shape, h, suffix)
        block_map.setdefault(key, [])
        if block["id"] not in block_map[key]:
            block_map[key].append(block["id"])


def block_anchor(*parts: str) -> str:
    """comparison/process 共用的锚点文本：规范化前的原始拼接。"""
    return "\x1e".join(p for p in parts if p)


# ---------------------------------------------------------------- 实操清单

def procedure_id(practice: ScannedNote, id_map: Optional[dict],
                 used: set, issues: List[dict]) -> str:
    """实操块 ID：映射里该路径的 ID > `proc.<标题slug>`；冲突加后缀。"""
    proc_map: Dict[str, dict] = {}
    if id_map is not None:
        proc_map = id_map.setdefault("procedures", {})
    old = proc_map.get(practice.rel_path)
    base = old["id"] if old and old.get("id") else \
        "proc.%s" % slugify(practice.doc.title or practice.stem)
    base = _safe_id(base)
    cid, n = base, 2
    while cid in used:
        cid = "%s-%d" % (base, n)
        n += 1
    if cid != base:
        issues.append({"kind": "procedure_id_collision",
                       "note": practice.rel_path,
                       "detail": "id 冲突，改用 %s" % cid})
    proc_map[practice.rel_path] = {"id": cid,
                                   "title": practice.doc.title or practice.stem}
    return cid


def assign_procitem_ids(proc_id: str, items: List[dict],
                        id_map: Optional[dict], note_rel: str) -> None:
    """清单项 ID：`t<hash8>`，锚点为规范化后的条目文本；同文本重复按
    出现序加后缀。"""
    item_map: Dict[str, str] = {}
    if id_map is not None:
        item_map = id_map.setdefault("procitems", {}).setdefault(note_rel, {})
    seen: Dict[str, int] = {}
    for item in items:
        norm = normalize_for_match(item.get("text", ""))
        h = anchor_hash("procitem", norm)
        n = seen.get(h, 0) + 1
        seen[h] = n
        suffix = "" if n == 1 else ".%d" % n
        item["id"] = "t%s%s" % (h, suffix)
        # 记录最后已知文本，供修正落空报告跨多次编译给出标签
        item_map[norm or item["id"]] = {"id": item["id"],
                                        "text": item.get("text", "")}
