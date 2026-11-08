# -*- coding: utf-8 -*-
"""主题编译器：扫描 → 收集来源 → 构建块 → 组装 learning.learn/0.1。

特性：
- 来源与推测分离（grounding），时间戳只取笔记链接里明确给出的起点；
- 不把出现顺序当 prerequisite；不按别名合并（只报告候选冲突）；
- 增量缓存：按概念记录依赖文件哈希 + 编译器版本 + 抽取器，未变化则
  从上一份 learn.json 复用该概念；
- 输出绝不写回输入目录（由 CLI 在运行前后校验输入文件快照）。
"""
from __future__ import annotations

import copy
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import blocks as B
import ids as SID
from mdparse import (VIDEO_URL_RE, highlights, hms_to_sec, normalize_for_match,
                     strip_md, wiki_targets)
from topic import (CLASS_CHAPTER, ScannedNote, TopicIndex, scan_topic,
                   sha1_text)

COMPILER_VERSION = "notes-compiler/0.2.0"
SCHEMA = "learning.learn/0.1"


# ---------------------------------------------------------------- 来源

def harvest_sources(idx: TopicIndex) -> Tuple[List[dict], Dict[str, str]]:
    """收集全部视频来源。元数据尽量从「视频信息与时间戳」资源笔记读取，
    读不到时只登记链接事实（title=null），不编造。
    返回 (sources, video_id → source_id)。"""
    order: List[str] = []
    discovered: Dict[str, List[str]] = {}
    for note in sorted(idx.notes, key=lambda n: n.rel_path):
        for ts in note.doc.timestamps():
            vid = ts["video_id"]
            if vid not in discovered:
                order.append(vid)
                discovered[vid] = []
            if note.rel_path not in discovered[vid]:
                discovered[vid].append(note.rel_path)

    meta = _video_meta_from_resources(idx)
    sources = []
    id_map: Dict[str, str] = {}
    for i, vid in enumerate(order, start=1):
        sid = "v%d" % i
        id_map[vid] = sid
        m = meta.get(vid)
        sources.append({
            "id": sid,
            "kind": "video",
            "platform": _platform_of(idx, vid),
            "ref": vid,
            "title": m.get("title") if m else None,
            "author": m.get("author") if m else None,
            "duration_sec": m.get("duration_sec") if m else None,
            "meta_from": m.get("meta_from") if m else None,
            "discovered_in": discovered[vid],
        })
    return sources, id_map


def _platform_of(idx: TopicIndex, vid: str) -> Optional[str]:
    for note in idx.notes:
        for m in VIDEO_URL_RE.finditer(note.doc.raw):
            if m.group(1) == vid:
                return "youtube" if "youtu" in m.group(0).lower() else None
    return None


def _video_meta_from_resources(idx: TopicIndex) -> Dict[str, dict]:
    """解析资源笔记的信息 callout：标题/作者/时长/链接。"""
    out: Dict[str, dict] = {}
    for note in idx.resources:
        for c in note.doc.callouts():
            if c.kind not in ("info", "note"):
                continue
            text = c.text
            title = re.search(r"\*{0,2}标题\*{0,2}[:：]\s*(.+)", text)
            author = re.search(r"\*{0,2}作者\*{0,2}[:：]\s*([^\n·]+)", text)
            dur = re.search(r"\*{0,2}时长\*{0,2}[:：]\s*(\d{1,2}:\d{2}(?::\d{2})?)",
                            text)
            for m in VIDEO_URL_RE.finditer(text):
                vid = m.group(1)
                if vid in out:
                    continue
                out[vid] = {
                    "title": title.group(1).strip() if title else None,
                    "author": author.group(1).strip() if author else None,
                    "duration_sec": int(hms_to_sec(dur.group(1))) if dur else None,
                    "meta_from": note.rel_path,
                }
    return out


# ---------------------------------------------------------------- 编译

class CompileResult:
    def __init__(self, doc, report, cache, manifest, id_map):
        self.doc = doc
        self.report = report
        self.cache = cache
        self.manifest = manifest
        self.id_map = id_map


def compile_topic(topic_dir: Path, extractor, now: Optional[str] = None,
                  previous: Optional[dict] = None,
                  previous_cache: Optional[dict] = None,
                  id_map: Optional[dict] = None) -> CompileResult:
    idx = scan_topic(topic_dir)
    issues: List[dict] = list(idx.issues)

    # ---- 稳定主题 ID：frontmatter > 映射文件 > 目录名 slug（ids.py）
    topic_id, topic_origin = SID.resolve_topic_id(idx, id_map)
    if id_map is None:
        id_map = SID.new_map(topic_id, topic_origin, idx.root.name)
    else:
        if id_map.get("topicId") and id_map["topicId"] != topic_id:
            issues.append({
                "kind": "topic_id_changed", "note": "<topic>",
                "detail": "主题 ID 由 %s 变为 %s（frontmatter topic_id 优先）"
                          % (id_map["topicId"], topic_id)})
        id_map["topicId"] = topic_id
        id_map["topicIdOrigin"] = topic_origin
        id_map["dirName"] = idx.root.name

    sources, src_map = harvest_sources(idx)

    def src_of(video_id: str) -> Optional[str]:
        return src_map.get(video_id)

    registry = _concept_registry(idx, id_map, issues)
    concept_by_norm = registry["by_norm"]
    shared_signature = sha1_text(json.dumps({"sources": src_map, "concepts": concept_by_norm},
                                           ensure_ascii=False, sort_keys=True))

    # structure 块与 uses 关系（来自主页全景图）
    struct_block, anchor, uses_relations = B.build_structure(
        idx.home, idx, concept_by_norm, src_of, issues)

    # ---- 概念（带增量缓存）
    cache_topic = {}
    if previous_cache:
        cache_topic = previous_cache.get("topics", {}).get(topic_id, {})
    prev_concepts = {c["id"]: c for c in (previous or {}).get("concepts", [])}
    concepts: List[dict] = []
    contrasts: List[Tuple[str, str, dict]] = []
    concept_cache: Dict[str, dict] = {}
    for info in registry["list"]:
        note: ScannedNote = info["note"]
        deps: Dict[str, str] = dict(info["deps"])
        deps["@shared-registry"] = shared_signature
        cached = _reusable(prev_concepts.get(info["id"]),
                           cache_topic.get("concepts", {}).get(info["id"]),
                           deps, previous_cache or {}, extractor.name)
        if cached is not None:
            concepts.append(cached)
            for a, b in B.contrast_pairs(cached.get("blocks", [])):
                contrasts.append((a, b, {"note": note.rel_path}))
            concept_cache[info["id"]] = {"note": note.rel_path, "deps": deps}
            issues.append({"kind": "cache_reused", "note": note.rel_path,
                           "detail": "依赖未变化，复用上一版概念 %s" % info["id"]})
            continue
        concept, concept_contrasts = _build_concept(
            info, idx, src_of, concept_by_norm, extractor, issues,
            struct_block if anchor == info["id"] else None, id_map)
        for a, b in concept_contrasts:
            contrasts.append((a, b, {"note": note.rel_path}))
        concepts.append(concept)
        concept_cache[info["id"]] = {"note": note.rel_path, "deps": deps}

    # ---- 实操清单（主题级，航线终点）
    procedures: List[dict] = []
    proc_cache_in = cache_topic.get("procedures", {})
    prev_procs = {p.get("id"): p for p in (previous or {}).get("procedures", [])}
    proc_cache_out: Dict[str, dict] = {}
    used_proc_ids: set = set()
    for practice in idx.practices:
        block_id = SID.procedure_id(practice, id_map, used_proc_ids, issues)
        used_proc_ids.add(block_id)
        deps = {practice.rel_path: practice.note_hash}
        deps["@shared-registry"] = shared_signature
        cached = _reusable(prev_procs.get(block_id),
                           proc_cache_in.get(practice.rel_path),
                           deps, previous_cache or {}, extractor.name)
        if cached is not None:
            cached["id"] = block_id
            procedures.append(cached)
            issues.append({"kind": "cache_reused", "note": practice.rel_path,
                           "detail": "依赖未变化，复用上一版实操块 %s" % block_id})
            for g in cached.get("groups", []):
                SID.assign_procitem_ids(block_id, g["items"], id_map,
                                        practice.rel_path)
        else:
            block, preserved = B.build_procedure(practice, src_of, issues)
            block["id"] = block_id
            for g in block.get("groups", []):
                SID.assign_procitem_ids(block_id, g["items"], id_map,
                                        practice.rel_path)
            if preserved:
                block["preserved"] = preserved
            procedures.append(block)
        proc_cache_out[practice.rel_path] = {"deps": deps, "block_id": block_id}

    # ---- 关系与阶段
    relations = _relations(idx, registry, uses_relations, contrasts, issues)
    stages = _stages(idx, issues)

    doc = {
        "schema": SCHEMA,
        "topic": {
            "id": topic_id,
            "title": idx.root.name,
            "flags": {"disclaimer": None, "asof": None},
            "generated": {
                "at": now or datetime.now(timezone.utc).isoformat(timespec="seconds"),
                "by": "notes-compiler",
                "compiler_version": COMPILER_VERSION,
                "model": None,
                "extractor": extractor.name,
                "notes_dir": idx.root.name,
            },
        },
        "sources": sources,
        "stages": stages,
        "relations": relations,
        "concepts": concepts,
        "procedures": procedures,
    }

    cache = {
        "compiler_version": COMPILER_VERSION,
        "extractor": extractor.name,
        "topics": {topic_id: {
            "files": {n.rel_path: n.note_hash for n in idx.notes},
            "concepts": concept_cache,
            "procedures": proc_cache_out,
        }},
    }
    # 概念表回写映射（标题历史），随后产出 manifest
    SID.update_concept_map(id_map, registry["assigned"])
    from manifest import build_manifest
    manifest = build_manifest(doc, idx, topic_origin,
                              stem_to_cid={i["note"].stem: i["id"]
                                           for i in registry["list"]})
    from reporting import build_report
    report = build_report(doc, idx, issues, cache, registry["list"])
    return CompileResult(doc, report, cache, manifest, id_map)


# ---------------------------------------------------------------- 概念注册

def _concept_registry(idx: TopicIndex, id_map: dict, issues: List[dict]) -> dict:
    """分配稳定 id（ids.py 规则：frontmatter > 映射 > 继承 > 标题 slug），
    建索引与分组。"""
    stem_group = _groups_from_home(idx)
    assigned = SID.assign_concept_ids(idx, id_map, issues)
    list_: List[dict] = []
    by_norm: Dict[str, str] = {}

    for note in idx.concepts:
        info = assigned[note.rel_path]
        doc = note.doc
        cid = info["id"]
        alias_list = info["aliases"]

        deps = {note.rel_path: note.note_hash}
        chapters: List[str] = []
        for _sec, target in doc.wikilinks():
            hit = idx.resolve_stem(target)
            if hit and hit.note_class == CLASS_CHAPTER:
                if hit.stem not in chapters:
                    chapters.append(hit.stem)
                deps[hit.rel_path] = hit.note_hash
        if idx.home is not None:
            deps[idx.home.rel_path] = idx.home.note_hash

        label = info["label"]
        for probe in [label] + alias_list:
            norm = normalize_for_match(probe)
            if norm and norm not in by_norm:
                by_norm[norm] = cid
        by_norm.setdefault(normalize_for_match(note.stem), cid)

        list_.append({
            "id": cid, "note": note, "label": label, "aliases": alias_list,
            "id_origin": info["id_origin"], "group": stem_group.get(note.stem),
            "chapters": chapters, "deps": deps,
        })

    # 别名冲突：不同概念共享别名 → 只记录候选，不合并
    seen_alias: Dict[str, str] = {}
    for info in list_:
        for alias in info["aliases"]:
            norm = normalize_for_match(alias)
            other = seen_alias.get(norm)
            if other and other != info["id"]:
                issues.append({
                    "kind": "alias_collision", "note": info["note"].rel_path,
                    "detail": "别名 %r 与概念 %s 重名：仅记录候选关联，不合并"
                              % (alias, other)})
            else:
                seen_alias[norm] = info["id"]
    return {"list": list_, "by_norm": by_norm, "assigned": assigned}


def _groups_from_home(idx: TopicIndex) -> Dict[str, str]:
    """主页「核心概念卡」表：第一列=分组，其余列 wikilink=概念（按文件名）。"""
    out: Dict[str, str] = {}
    home = idx.home
    if home is None:
        return out
    for sec, tbl in home.doc.tables():
        if not sec.heading or "核心概念卡" not in sec.heading:
            continue
        if len(tbl.header) < 2:
            continue
        for row in tbl.rows:
            group = strip_md(row[0]).strip()
            if not group:
                continue
            for cell in row[1:]:
                for target in wiki_targets(cell):
                    stem = target.strip()
                    hit = idx.resolve_stem(stem)
                    if hit is not None:
                        out.setdefault(hit.stem, group)
    return out


# ---------------------------------------------------------------- 单概念

def _build_concept(info, idx, src_of, concept_by_norm, extractor, issues,
                   struct_block, id_map=None) -> Tuple[dict, List[Tuple[str, str]]]:
    note: ScannedNote = info["note"]
    doc = note.doc
    cid = info["id"]

    one_liner = doc.abstract()
    key = None
    if one_liner:
        hl = highlights(one_liner)
        key = hl[0] if hl else None
    else:
        issues.append({"kind": "missing_definition", "note": note.rel_path,
                       "detail": "缺少 abstract 一句话定义，回退正文首段"})
        one_liner = _first_paragraph(doc) or ""

    def ev_note(ref: str) -> dict:
        if ref.endswith(".md"):
            return {"note": ref}
        return {"note": "%s#%s" % (note.rel_path, ref)}

    # ---- definition（永远第一个）
    definition = B.build_definition(note, src_of)
    definition["id"] = "%s.def" % cid
    points, overflow = B.collect_points(note, src_of, issues)
    definition["points"] = points
    math = B.first_display_math(doc)
    if math:
        definition["math"] = math
    for sec, fence in doc.fences():
        if fence.lang == "mermaid":
            continue
        if B.circled_run_length(fence) >= 2:
            continue  # ①②③ 围栏已交给 process
        definition["artifact"] = {"lang": fence.lang or "text", "code": fence.code}
        break

    used_ids = {definition["id"]}
    blocks_: List[dict] = [definition]

    # ---- comparison
    def lookup(label: str) -> Optional[str]:
        norm = normalize_for_match(strip_md(label))
        if not norm:
            return None
        hit = concept_by_norm.get(norm)
        if hit and hit != cid:
            return hit
        for n2, c2 in concept_by_norm.items():
            if n2 and (norm in n2 or n2 in norm) and c2 != cid:
                return c2
        return None

    comps = B.build_comparisons(note, lookup, src_of, issues)
    blocks_.extend(comps)
    contrasts = B.contrast_pairs(comps)

    # ---- process
    procs = B.build_processes(note, src_of, issues)
    blocks_.extend(procs)

    # ---- 注入块（标注 / LLM 接口），逐块校验，失败丢弃并记录
    from extractors import validate_injected
    try:
        injected = extractor.extract(note, ev_note)
    except Exception as exc:  # 标注损坏不阻塞编译
        issues.append({"kind": "extractor_error", "note": note.rel_path,
                       "detail": "extractor=%s 失败: %s" % (extractor.name, exc)})
        injected = []
    for raw in injected:
        blk = validate_injected(raw, cid, used_ids, issues, note.rel_path)
        if blk is not None:
            blocks_.append(blk)
            used_ids.add(blk["id"])

    # ---- structure 挂锚概念
    if struct_block is not None:
        blocks_.append(struct_block)
        used_ids.add(struct_block["id"])

    # ---- 基于内容锚点分配块 ID（ids.py；definition/structure 保持原格式）
    SID.assign_block_ids(cid, blocks_, id_map, note.rel_path)

    preserved = B.collect_preserved(note, issues)
    if overflow:
        preserved.extend(overflow)

    concept = {
        "id": cid,
        "label": info["label"],
        "aliases": info["aliases"],
        "note": note.rel_path,
        "note_hash": note.note_hash,
        "id_origin": info["id_origin"],
        "one_liner": one_liner,
        "key": key,
        "group": info["group"],
        "chapters": info["chapters"],
        "blocks": blocks_,
    }
    if preserved:
        concept["preserved"] = preserved
    return concept, contrasts


def _first_paragraph(doc) -> Optional[str]:
    for sec in doc.sections:
        for line in sec.lines:
            s = strip_md(line.strip())
            if s and not s.startswith((">", "|", "$$")) and not s.startswith("```"):
                return s
    return None


# ---------------------------------------------------------------- 关系/阶段

def _relations(idx: TopicIndex, registry, uses_relations, contrasts,
               issues) -> List[dict]:
    """related=概念间 wikilink；uses=全景图边；contrast=对比块。
    不生成 prereq：出现顺序只用于建议路线。"""
    out: List[dict] = []
    seen = set()

    def add(a: str, b: str, kind: str, ev: List[dict]):
        if a == b:
            return
        key = (min(a, b), max(a, b), kind)
        if key in seen:
            return
        seen.add(key)
        out.append({"a": a, "b": b, "kind": kind, "ev": ev})

    cid_by_stem = {i["note"].stem: i["id"] for i in registry["list"]}

    # 断链检查覆盖全部笔记；关系只统计概念卡之间
    for note in idx.notes:
        for _sec, target in note.doc.wikilinks():
            hit = idx.resolve_stem(target)
            if hit is None:
                issues.append({"kind": "broken_wikilink", "note": note.rel_path,
                               "detail": "断链 [[%s]]" % target})
    for info in registry["list"]:
        note = info["note"]
        for _sec, target in note.doc.wikilinks():
            hit = idx.resolve_stem(target)
            other = cid_by_stem.get(hit.stem) if hit else None
            if other and other != info["id"]:
                add(info["id"], other, "related", [{"note": note.rel_path}])
    for rel in uses_relations:
        add(rel["a"], rel["b"], "uses", rel["ev"])
    for a, b, ev in contrasts:
        add(a, b, "contrast", [ev])
    return out


def _stages(idx: TopicIndex, issues: List[dict]) -> List[dict]:
    """学习路线：主页「## 学习路线」下的三级标题各成一个阶段。

    解析层把每个标题切成独立小节，因此这里按小节顺序遍历。
    """
    home = idx.home
    if home is not None:
        secs = home.doc.sections
        start = None
        for i, sec in enumerate(secs):
            if sec.heading and "学习路线" in sec.heading and sec.level <= 2:
                start = i + 1
                break
        if start is not None:
            stages = []
            for sec in secs[start:]:
                if sec.level <= 2:
                    break
                if sec.level != 3:
                    continue
                stage = {"title": sec.heading or "阶段", "chapters": [],
                         "origin": "home-page"}
                for target in wiki_targets(sec.text):
                    hit = idx.resolve_stem(target.strip())
                    if hit and hit.note_class == CLASS_CHAPTER:
                        stage["chapters"].append(hit.stem)
                stages.append(stage)
            if stages:
                return stages
        issues.append({"kind": "no_stages_section", "note": home.rel_path,
                       "detail": "主页没有学习路线小节，按章节顺序自动分组"})
    chapters = sorted(idx.chapters, key=lambda n: n.rel_path)
    groups: List[dict] = []
    for i, ch in enumerate(chapters):
        if i % 3 == 0:
            groups.append({"title": "章节 %d–%d" % (i + 1, min(i + 3, len(chapters))),
                           "chapters": [], "origin": "auto-by-chapters"})
        groups[-1]["chapters"].append(ch.stem)
    return groups


# ---------------------------------------------------------------- 缓存

def _reusable(prev_block: Optional[dict], cache_entry: Optional[dict],
              deps: Dict[str, str], cache_root: dict, extractor_name: str):
    """上一版块可直接复用的条件：编译器版本、抽取器、全部依赖哈希一致。"""
    if prev_block is None or cache_entry is None:
        return None
    if cache_root.get("compiler_version") != COMPILER_VERSION:
        return None
    if cache_root.get("extractor") != extractor_name:
        return None
    if cache_entry.get("deps") != deps:
        return None
    return copy.deepcopy(prev_block)


def merge_cache(old: Optional[dict], new: dict) -> dict:
    """多主题共用一份缓存文件时，保留未重新编译主题的旧条目。"""
    merged = new
    if old:
        for tid, entry in old.get("topics", {}).items():
            if tid not in merged["topics"]:
                merged["topics"][tid] = entry
    return merged
