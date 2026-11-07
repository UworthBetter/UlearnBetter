# -*- coding: utf-8 -*-
"""校验与报告：四层中的前三层（结构 / 语义 / 出处），全部确定性。

不依赖 jsonschema 第三方库：校验规则与 schemas/learning/learn.schema.json
保持同步的最小实现。可渲染层（variation 冒烟等）属于前端加载器职责，
本阶段不实现也不声称完成。报告输出 JSON 与 Markdown 两份。
"""
from __future__ import annotations

import re
import unicodedata
from typing import Dict, List, Optional

BLOCK_SHAPES = ("definition", "structure", "process", "comparison",
                "variation", "procedure")
EV_KINDS = ("note", "src")

from topic import TopicIndex

LIMITS = {
    ("definition", "points"): 6,
    ("process", "steps"): 8,
    ("comparison", "items"): 4,
    ("comparison", "dims"): 6,
}


def build_report(doc: dict, idx: TopicIndex, issues: List[dict],
                 cache: dict, concept_infos: List[dict]) -> dict:
    doc_issues = validate_document(doc, idx)
    # idx.issues 在扫描之后仍会被 wikilink 解析等追加，合并去重
    seen = set()
    all_issues = []
    for i in list(issues) + list(idx.issues) + doc_issues:
        key = (i.get("kind"), i.get("note"), i.get("detail"))
        if key in seen:
            continue
        seen.add(key)
        all_issues.append(dict(i))
    stats = _stats(doc, idx, all_issues, cache, concept_infos)
    return {
        "schema": "learning.learn.report/0.1",
        "topic": doc["topic"]["id"],
        "compiler_version": doc["topic"]["generated"]["compiler_version"],
        "extractor": doc["topic"]["generated"]["extractor"],
        "stats": stats,
        "issues": all_issues,
        "limitations": LIMITATION_NOTES,
    }


# ---------------------------------------------------------------- 校验

def validate_document(doc: dict, idx: TopicIndex) -> List[dict]:
    issues: List[dict] = []

    def err(kind, where, detail):
        issues.append({"kind": kind, "note": where, "detail": detail})

    # 1) 结构层
    for key in ("schema", "topic", "sources", "stages", "relations",
                "concepts", "procedures"):
        if key not in doc:
            err("schema_missing_key", "<doc>", "缺少顶层字段 %s" % key)
    if doc.get("schema") != "learning.learn/0.1":
        err("schema_version", "<doc>", "schema 应为 learning.learn/0.1")

    concept_ids = set()
    block_ids = set()
    source_ids = {s.get("id") for s in doc.get("sources", [])}
    note_paths = {n.rel_path for n in idx.notes}

    for c in doc.get("concepts", []):
        cid = c.get("id", "<no-id>")
        if cid in concept_ids:
            err("duplicate_concept_id", c.get("note", ""), "概念 id 重复: %s" % cid)
        concept_ids.add(cid)
        if not c.get("one_liner"):
            err("empty_one_liner", c.get("note", ""), "一句话定义为空")
        blocks = c.get("blocks", [])
        if not blocks:
            err("no_blocks", c.get("note", ""), "概念没有任何块")
        for i, b in enumerate(blocks):
            where = c.get("note", "")
            bid = b.get("id", "<no-id>")
            if bid in block_ids:
                err("duplicate_block_id", where, "块 id 重复: %s" % bid)
            block_ids.add(bid)
            if b.get("shape") not in BLOCK_SHAPES:
                err("invalid_shape", where, "块 %s 形状非法: %r" % (bid, b.get("shape")))
            if i == 0 and b.get("shape") != "definition":
                err("first_block_not_definition", where,
                    "第一个块必须是 definition，得到 %s" % b.get("shape"))
            for limit_key, cap in LIMITS.items():
                shape, field = limit_key
                if b.get("shape") == shape and field in b and \
                        len(b[field]) > cap:
                    err("over_cap", where, "块 %s 的 %s=%d 超上限 %d"
                        % (bid, field, len(b[field]), cap))
            if b.get("shape") == "comparison":
                n_dims = len(b.get("dims", []))
                n_items = len(b.get("items", []))
                for r, row in enumerate(b.get("cells", [])):
                    if len(row) != n_items:
                        err("cells_shape", where,
                            "块 %s cells 第 %d 行 %d 格 != %d 个对象"
                            % (bid, r, len(row), n_items))
                if len(b.get("cells", [])) != n_dims:
                    err("cells_shape", where, "块 %s cells 行数 != 维度数" % bid)
            if b.get("grounding") == "supplementary":
                supp = [x for x in blocks if x.get("grounding") == "supplementary"]
                if len(supp) > 1:
                    err("too_many_supplementary", where,
                        "supplementary 块超过 1 个")

    # 2) 语义层：ev 引用存在
    def check_ev(ev, where, bid):
        if not isinstance(ev, dict):
            err("invalid_ev", where, "块 %s 的 ev 不是对象" % bid)
            return
        keys = set(ev.keys())
        if "note" in keys:
            path = ev["note"].split("#")[0]
            if path not in note_paths:
                err("ev_note_missing", where, "ev 指向不存在的笔记: %s" % ev["note"])
        if "src" in keys and ev["src"] not in source_ids:
            err("ev_src_missing", where, "ev 指向不存在的来源: %s" % ev.get("src"))

    for c in doc.get("concepts", []):
        where = c.get("note", "")
        for b in c.get("blocks", []):
            if not b.get("ev"):
                err("block_without_ev", where, "块 %s 缺少证据" % b.get("id"))
            for ev in b.get("ev", []):
                check_ev(ev, where, b.get("id"))
            for p in b.get("points", []):
                for ev in p.get("ev", []):
                    check_ev(ev, where, b.get("id"))
            for s in b.get("steps", []):
                for ev in s.get("ev", []):
                    check_ev(ev, where, b.get("id"))
        if c.get("note") and c["note"] not in note_paths:
            err("concept_note_missing", where, "概念卡路径不存在: %s" % c["note"])

    for p in doc.get("procedures", []):
        if not p.get("ev"):
            err("block_without_ev", p.get("id", ""), "实操块缺少证据")
        for g in p.get("groups", []):
            for it in g.get("items", []):
                for ev in it.get("ev", []):
                    check_ev(ev, p.get("title", ""), p.get("id"))

    known = concept_ids
    for rel in doc.get("relations", []):
        for side in ("a", "b"):
            if rel.get(side) not in known:
                err("relation_unknown_concept", "<relations>",
                    "关系端点 %r 不是已知概念" % rel.get(side))
        if rel.get("kind") == "prereq":
            err("prereq_generated", "<relations>",
                "出现了 prereq 关系：本轮裁决不允许自动生成前置")

    for s in doc.get("stages", []):
        if not s.get("chapters") and s.get("origin") == "home-page":
            err("empty_stage", "<stages>", "阶段 %r 没有任何章节" % s.get("title"))

    # 3) 出处层：数字检查（轻量）
    _number_check(doc, idx, err)
    return issues


def _norm_text(text: str) -> str:
    """证据匹配用的归一化：NFKC、去高亮/加粗/空白；wikilink 保留其内部
    文本（目标名与显示名都可能携带数字证据），不整体删除。"""
    text = unicodedata.normalize("NFKC", text)
    text = text.replace("==", "").replace("**", "").replace(" ", "")
    text = re.sub(r"\[\[([^\]]*)\]\]", lambda m: m.group(1).replace("|", ""), text)
    return text


_NUM_RE = re.compile(r"\d+(?:\.\d+)?")


def _numbers_of(text: str) -> List[str]:
    return _NUM_RE.findall(_norm_text(text))


def _number_check(doc: dict, idx: TopicIndex, err) -> None:
    """块文字里的数字必须能在证据笔记原文中找到（防编造数字）。"""
    raw_by_path = {n.rel_path: _norm_text(n.doc.raw) for n in idx.notes}

    def source_text(evs) -> str:
        parts = []
        for ev in evs or []:
            note = ev.get("note")
            if note:
                parts.append(raw_by_path.get(note.split("#")[0], ""))
        return "".join(parts)

    def check(text, evs, where, bid):
        src = source_text(evs)
        for num in _numbers_of(text):
            if num not in src:
                err("number_not_in_evidence", where,
                    "块 %s 文字中的数字 %s 未出现在证据笔记里" % (bid, num))

    for c in doc.get("concepts", []):
        for b in c.get("blocks", []):
            where = c.get("note", "")
            for p in b.get("points", []):
                check(p.get("text", ""), p.get("ev") or b.get("ev"), where,
                      b.get("id"))
            for s in b.get("steps", []):
                check(s.get("label", ""), s.get("ev") or b.get("ev"), where,
                      b.get("id"))
    for p in doc.get("procedures", []):
        for g in p.get("groups", []):
            for it in g.get("items", []):
                check(it.get("text", ""), it.get("ev"), p.get("title", ""),
                      p.get("id"))


# ---------------------------------------------------------------- 统计

def _stats(doc: dict, idx: TopicIndex, issues: List[dict], cache: dict,
           concept_infos: List[dict]) -> dict:
    blocks_by_shape: Dict[str, int] = {s: 0 for s in BLOCK_SHAPES}
    for c in doc.get("concepts", []):
        for b in c.get("blocks", []):
            blocks_by_shape[b.get("shape", "?")] = blocks_by_shape.get(b.get("shape", "?"), 0) + 1
    for p in doc.get("procedures", []):
        blocks_by_shape["procedure"] = blocks_by_shape.get("procedure", 0) + 1

    ts_ev = 0
    for c in doc.get("concepts", []):
        for b in c.get("blocks", []):
            for ev in b.get("ev", []):
                ts_ev += 1 if "t" in ev else 0
            for p in b.get("points", []):
                for ev in p.get("ev", []):
                    ts_ev += 1 if "t" in ev else 0
            for s in b.get("steps", []):
                for ev in s.get("ev", []):
                    ts_ev += 1 if "t" in ev else 0
    for p in doc.get("procedures", []):
        for g in p.get("groups", []):
            for it in g.get("items", []):
                for ev in it.get("ev", []):
                    ts_ev += 1 if "t" in ev else 0

    kind_counts: Dict[str, int] = {}
    for i in issues:
        kind_counts[i["kind"]] = kind_counts.get(i["kind"], 0) + 1

    topic_cache = cache.get("topics", {}).get(doc["topic"]["id"], {})
    preserved_secs = sum(len(c.get("preserved", [])) for c in doc.get("concepts", []))
    preserved_procs = sum(len(p.get("preserved", [])) for p in doc.get("procedures", []))

    return {
        "notes_scanned": len(idx.notes),
        "notes_by_class": _count_by(idx.notes, lambda n: n.note_class),
        "classified_by_tag": sum(1 for n in idx.notes if n.classified_by == "tag"),
        "concepts": len(doc.get("concepts", [])),
        "concept_ids_from_frontmatter": sum(
            1 for i in concept_infos if i["id_origin"] == "frontmatter"),
        "blocks_by_shape": blocks_by_shape,
        "procedures": len(doc.get("procedures", [])),
        "procedure_items": sum(len(g.get("items", []))
                               for p in doc.get("procedures", [])
                               for g in p.get("groups", [])),
        "sources": len(doc.get("sources", [])),
        "sources_with_metadata": sum(
            1 for s in doc.get("sources", []) if s.get("title")),
        "timestamp_evs": ts_ev,
        "relations_by_kind": _count_by(doc.get("relations", []), lambda r: r["kind"]),
        "stages": len(doc.get("stages", [])),
        "preserved_sections": preserved_secs + preserved_procs,
        "cache_reused_concepts": sum(
            1 for i in issues if i["kind"] == "cache_reused"
            and "概念" in i["detail"]),
        "cache_tracked_concepts": len(topic_cache.get("concepts", {})),
        "issue_counts": kind_counts,
    }


def _count_by(items, key):
    out: Dict[str, int] = {}
    for it in items:
        k = key(it)
        out[k] = out.get(k, 0) + 1
    return out


LIMITATION_NOTES = [
    "离线确定性编译：不调用 LLM，不产出 grounding=video 的逐句字幕核对",
    "时间戳只保留笔记链接中明确给出的起点秒数，不伪造结束点与引文",
    "章节笔记里的时间戳不提升为概念块级证据（避免无依据的归属），"
    "可通过 sources[].discovered_in 追溯到具体笔记",
    "variation 块只能经 frontmatter learn_blocks 标注或 LLM 注入接口进入，"
    "并经校验；确定性编译不生成实验数据",
    "数字检查为轻量版（NFKC 归一 + 子串匹配），未做繁简与中文数字换算",
    "claims/implies 的计算核对与可渲染冒烟属于后续阶段，本报告不声称完成",
    "章节笔记内容不直接进块；概念卡未覆盖的小节按原文保留在 preserved",
]


# ---------------------------------------------------------------- 输出

def render_markdown(report: dict) -> str:
    s = report["stats"]
    lines = []
    ap = lines.append
    ap("# 学习内容编译报告 · %s" % report["topic"])
    ap("")
    ap("- 编译器：`%s`（extractor=%s）" % (report["compiler_version"],
                                           report["extractor"]))
    ap("- 笔记：%d 篇（概念卡 %d / 章节 %d / 实操 %d / 资源 %d / 主页 %d / 其他 %d）"
        % (s["notes_scanned"], s["notes_by_class"].get("concept", 0),
           s["notes_by_class"].get("chapter", 0),
           s["notes_by_class"].get("practice", 0),
           s["notes_by_class"].get("resource", 0),
           s["notes_by_class"].get("home", 0),
           s["notes_by_class"].get("other", 0)))
    ap("- 概念：%d 个（frontmatter id：%d 个）"
        % (s["concepts"], s["concept_ids_from_frontmatter"]))
    ap("- 块：" + " · ".join("%s %d" % (k, v)
                             for k, v in s["blocks_by_shape"].items()))
    ap("- 实操清单：%d 份 / %d 项" % (s["procedures"], s["procedure_items"]))
    ap("- 来源：%d 个视频（%d 个有元数据） · 保留时间戳证据 %d 条"
        % (s["sources"], s["sources_with_metadata"], s["timestamp_evs"]))
    ap("- 关系：" + " · ".join("%s %d" % (k, v)
                               for k, v in s["relations_by_kind"].items()
                               if v) or "- 关系：无")
    ap("- 阶段：%d 个 · 保留未转换小节 %d 处 · 缓存复用概念 %d/%d"
        % (s["stages"], s["preserved_sections"],
           s["cache_reused_concepts"], s["cache_tracked_concepts"]))
    ap("")
    ap("## 问题清单（%d 条）" % len(report["issues"]))
    by_kind: Dict[str, List[dict]] = {}
    for i in report["issues"]:
        by_kind.setdefault(i["kind"], []).append(i)
    if not by_kind:
        ap("- 无")
    for kind in sorted(by_kind):
        ap("")
        ap("### %s（%d）" % (kind, len(by_kind[kind])))
        for i in by_kind[kind][:12]:
            ap("- `%s`：%s" % (i.get("note") or "-", i.get("detail", "")))
        if len(by_kind[kind]) > 12:
            ap("- … 其余 %d 条见 report.json" % (len(by_kind[kind]) - 12))
    ap("")
    ap("## 已知限制")
    for note in report["limitations"]:
        ap("- %s" % note)
    return "\n".join(lines) + "\n"
