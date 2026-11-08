# -*- coding: utf-8 -*-
"""编译产物 manifest（learning.manifest/0.1）。

与 learn.json 同目录输出，给记录层后端扫描（`RECORD_LEARN_DIR/<topicId>/
{learn.json,manifest.json}`）。只汇总编译已确定的事实：

- `folderHint` 只放主题目录的上级目录名，绝不输出绝对路径；
- `identity.what` 由计数拼成；`about` 取学习主页 abstract 一句话，
  `route` 取学习路线（home-page stages）标题，找不到就是 null；
- `importanceHint`/`importanceFactors` 只用笔记里有依据的信号
  （frontmatter 标注、被章节笔记引用、出现在主页全景图），没有依据
  就是 null，不编分数；
- `route`（conceptId 数组）是建议路线（stages → 章节 → 首次出现），
  不是前置关系（第一轮裁决 5）。
"""
from __future__ import annotations

from typing import Dict, List, Optional

from topic import TopicIndex, sha1_text

MANIFEST_SCHEMA = "learning.manifest/0.1"


def build_manifest(doc: dict, idx: TopicIndex, topic_origin: str,
                   stem_to_cid: Dict[str, str]) -> dict:
    topic_id = doc["topic"]["id"]
    generated = doc["topic"]["generated"]

    # ---- 来源：优先取第一个有元数据的视频来源
    src = _pick_source(doc)

    # ---- 建议路线：stages → 章节 → 概念首次出现
    route = _suggested_route(doc, idx, stem_to_cid)

    # ---- 章节引用计数（重要性证据之一）
    chapter_refs = _chapter_refs(idx, stem_to_cid)
    overview_cids = _overview_concepts(doc)

    concepts = []
    for order, c in enumerate(doc.get("concepts", [])):
        note = _note_of(idx, c.get("note"))
        refs = chapter_refs.get(c["id"], 0)
        in_overview = c["id"] in overview_cids
        hint, factors = _importance(note, refs, in_overview)
        concepts.append({
            "id": c["id"],
            "label": c.get("label") or c["id"],
            "aliases": list(c.get("aliases", [])),
            "group": c.get("group"),
            "order": order,
            "importanceHint": hint,
            "importanceFactors": factors,
            "blockCount": len(c.get("blocks", [])),
        })

    groups: List[dict] = []
    group_index: Dict[str, List[str]] = {}
    for c in concepts:
        g = c["group"]
        if not g:
            continue
        group_index.setdefault(g, []).append(c["id"])
    for name, cids in group_index.items():
        groups.append({"name": name, "conceptIds": cids})

    procedures = []
    for p in doc.get("procedures", []):
        items = []
        for g in p.get("groups", []):
            for it in g.get("items", []):
                items.append({"id": it["id"], "text": it.get("text", "")})
        procedures.append({"id": p["id"], "title": p.get("title", ""),
                           "items": items})

    return {
        "schema": MANIFEST_SCHEMA,
        "topic": {
            "id": topic_id,
            "title": doc["topic"].get("title") or topic_id,
            "idOrigin": topic_origin,
        },
        "contentHash": _content_hash(idx),
        "compilerVersion": generated.get("compiler_version"),
        "generatedAt": generated.get("at"),
        "folderHint": _folder_hint(idx),
        "identity": {
            "what": "课程笔记：%d 章、%d 张概念卡、%d 份实操清单" % (
                len(idx.chapters), len(doc.get("concepts", [])),
                len(doc.get("procedures", []))),
            "about": _home_about(idx),
            "route": _route_title(doc),
        },
        "counts": {
            "chapters": len(idx.chapters),
            "concepts": len(doc.get("concepts", [])),
            "procedures": len(doc.get("procedures", [])),
        },
        "source": src,
        "concepts": concepts,
        "groups": groups,
        "procedures": procedures,
        "route": route,
    }


# ---------------------------------------------------------------- 辅助

def _content_hash(idx: TopicIndex) -> str:
    payload = "\n".join("%s %s" % (n.rel_path, n.note_hash)
                        for n in sorted(idx.notes, key=lambda n: n.rel_path))
    return sha1_text(payload)


def _folder_hint(idx: TopicIndex) -> Optional[str]:
    """主题目录的上级目录名（不含绝对路径）。"""
    name = idx.root.parent.name
    return name or None


def _home_about(idx: TopicIndex) -> Optional[str]:
    home = idx.home
    if home is None:
        return None
    abstract = home.doc.abstract()
    if not abstract:
        return None
    for line in abstract.splitlines():
        line = line.strip()
        if line:
            return line
    return None


def _route_title(doc: dict) -> Optional[str]:
    titles = [s.get("title") for s in doc.get("stages", [])
              if s.get("origin") == "home-page" and s.get("title")]
    if not titles:
        return None
    return " → ".join(titles)


def _pick_source(doc: dict) -> dict:
    sources = doc.get("sources", []) or [{}]
    src = next((s for s in sources if s.get("title")), sources[0])
    url = None
    if src.get("platform") == "youtube" and src.get("ref"):
        url = "https://www.youtube.com/watch?v=%s" % src["ref"]
    return {
        "title": src.get("title") or "",
        "author": src.get("author"),
        "duration": src.get("duration_sec"),
        "url": url,
    }


def _overview_concepts(doc: dict) -> set:
    out = set()
    for c in doc.get("concepts", []):
        for b in c.get("blocks", []):
            for node in b.get("nodes", []):
                if node.get("concept"):
                    out.add(node["concept"])
    return out


def _chapter_refs(idx: TopicIndex, stem_to_cid: Dict[str, str]) -> Dict[str, int]:
    """每个概念被多少个不同章节笔记引用（按 wikilink 目标解析）。"""
    refs: Dict[str, set] = {}
    for ch in idx.chapters:
        hit_cids = set()
        for _sec, target in ch.doc.wikilinks():
            cid = stem_to_cid.get(target.strip())
            if cid:
                hit_cids.add(cid)
        for cid in hit_cids:
            refs.setdefault(cid, set()).add(ch.rel_path)
    return {cid: len(paths) for cid, paths in refs.items()}


def _note_of(idx: TopicIndex, rel: Optional[str]):
    if not rel:
        return None
    for n in idx.notes:
        if n.rel_path == rel:
            return n
    return None


def _importance(note, chapter_ref_count: int, in_overview: bool):
    """只给有依据的信号：frontmatter importance 标注、被 ≥2 个章节引用、
    出现在主页全景图。无任何依据 → (None, [])。"""
    factors: List[str] = []
    hint = None
    if note is not None:
        fm = note.doc.frontmatter.get("importance")
        if isinstance(fm, int) and not isinstance(fm, bool) and fm in (1, 2, 3):
            hint = fm
            factors.append("frontmatter 标注 importance=%d" % fm)
    if chapter_ref_count >= 2:
        factors.append("被 %d 个章节笔记引用" % chapter_ref_count)
    if in_overview:
        factors.append("出现在学习主页全景图")
    if hint is None and factors:
        hint = 3 if chapter_ref_count >= 4 else \
            2 if chapter_ref_count >= 2 else 1
    return hint, factors


def _suggested_route(doc: dict, idx: TopicIndex,
                     stem_to_cid: Dict[str, str]) -> List[str]:
    """建议路线：先按 stages 里的章节顺序，再补未入线章节，最后补
    未在任何章节出现过的概念（按编译顺序）。只是建议，不是前置。"""
    by_stem = {n.stem: n for n in idx.chapters}
    staged: List[str] = []
    seen_ch = set()
    for stage in doc.get("stages", []):
        for ch_stem in stage.get("chapters", []):
            if ch_stem not in seen_ch:
                seen_ch.add(ch_stem)
                staged.append(ch_stem)

    order: List[str] = []
    seen = set()

    def add_chapter(stem: str) -> None:
        note = by_stem.get(stem)
        if note is None:
            return
        for _sec, target in note.doc.wikilinks():
            cid = stem_to_cid.get(target.strip())
            if cid and cid not in seen:
                seen.add(cid)
                order.append(cid)

    for stem in staged:
        add_chapter(stem)
    for ch in sorted(idx.chapters, key=lambda n: n.rel_path):
        if ch.stem not in seen_ch:
            add_chapter(ch.stem)
    for c in doc.get("concepts", []):
        if c["id"] not in seen:
            seen.add(c["id"])
            order.append(c["id"])
    return order
