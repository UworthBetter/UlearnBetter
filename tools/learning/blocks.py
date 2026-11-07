# -*- coding: utf-8 -*-
"""确定性块构建：从笔记结构生成六类内容块。

只做「有结构依据」的映射，不做语义猜测：
- definition  ← 概念卡 abstract 一句话定义 + 📌/角色 小节要点
- comparison  ← 表格（优点与局限 → pros_cons，其余 → matrix）
- process     ← 有序步骤（markdown 有序列表 / ①②③ 行，含代码围栏）
- procedure   ← 03-实操清单 的任务清单（主题级，航线终点）
- structure   ← 学习主页 mermaid 全景图（挂在锚概念上）
- variation   ← 离线确定性编译不生成；仅经标注/LLM 注入接口进入并校验

不能转换的内容按原文进入 preserved，不删除。
"""
from __future__ import annotations

import re
from typing import Dict, List, Optional, Tuple

from mdparse import (CIRCLED, Fence, NoteDoc, ORDERED_RE, Section, Table,
                     TASK_RE, BULLET_RE, find_timestamps, highlights,
                     normalize_for_match, parse_mermaid, slugify, strip_md)
from topic import ScannedNote, TopicIndex

POINT_CAP = 6
STEP_CAP = 8
ITEM_CAP = 4
DIM_CAP = 6

_SKIP_MARKS = ("✅", "⚠️", "❌")


def _skip_section(sec: Section) -> str:
    h = sec.heading or ""
    if "相关链接" in h:
        return "links"
    if "我的思考" in h or "💭" in h:
        return "thinking"
    return ""


def _mk_note_ev(rel: str, sec: Optional[Section]) -> dict:
    ref = rel if (sec is None or not sec.heading) else "%s#%s" % (rel, sec.heading)
    return {"note": ref}


def _ts_evs(text: str, src_of) -> List[dict]:
    out = []
    for ts in find_timestamps(text):
        sid = src_of(ts["video_id"])
        if sid:
            out.append({"src": sid, "t": ts["t"]})
    return out


def _mark_of(cell_text: str) -> Tuple[str, Optional[str]]:
    for mark, kind in (("✅", "good"), ("⚠️", "warn"), ("❌", "bad")):
        if mark in cell_text:
            return cell_text.replace(mark, "").strip(), kind
    return cell_text, None


# ================================================================ definition

def build_definition(note: ScannedNote, src_of) -> dict:
    """核心定义块骨架。第一个块，永远存在；内容由 compiler 填充。"""
    sec = note.doc.find_section("是什么")
    ev = [_mk_note_ev(note.rel_path, sec)]
    return {
        "id": None,  # 由 compiler 补 concept 前缀
        "shape": "definition",
        "title": "核心定义",
        "grounding": "note",
        "points": [],
        "ev": ev,
    }


def first_display_math(doc: NoteDoc) -> Optional[str]:
    """第一个 $$…$$ 块的内容。"""
    for sec in doc.sections:
        buf: List[str] = []
        inside = False
        for line in sec.lines:
            if line.strip() == "$$":
                if inside:
                    return "\n".join(buf).strip()
                inside = True
                buf = []
                continue
            if inside:
                buf.append(line)
    return None


def collect_points(note: ScannedNote, src_of, issues: List[dict]) -> Tuple[List[dict], List[dict]]:
    """收集要点（📌/是什么/角色 等小节的顶层无序列表，含嵌套原文）。

    返回 (points, overflow_preserved)。
    """
    doc = note.doc
    points: List[dict] = []
    overflow: List[dict] = []
    for sec in doc.sections:
        if _skip_section(sec):
            continue
        heading = sec.heading or ""
        if not ("📌" in heading or "是什么" in heading or "角色" in heading):
            continue
        # 含有序步骤的小节交给 process；其无序要点仍进定义
        points.extend(_bullets_with_children(sec, note, src_of))
    if len(points) > POINT_CAP:
        overflow = [{"heading": None,
                     "text": "\n".join(p["text"] for p in points[POINT_CAP:])}]
        for p in points[POINT_CAP:]:
            issues.append({"kind": "definition_points_overflow", "note": note.rel_path,
                           "detail": "要点超过 %d 条上限，超额部分按原文保留" % POINT_CAP})
        points = points[:POINT_CAP]
    return points, overflow


def _bullets_with_children(sec: Section, note: ScannedNote, src_of) -> List[dict]:
    out: List[dict] = []
    lines = sec.lines
    i = 0
    while i < len(lines):
        m = BULLET_RE.match(lines[i])
        if m and m.group(1) == "":
            text = m.group(2)
            j = i + 1
            children: List[str] = []
            while j < len(lines):
                cm = BULLET_RE.match(lines[j]) or ORDERED_RE.match(lines[j])
                if cm and cm.group(1) != "":
                    children.append(lines[j].strip())
                    j += 1
                else:
                    break
            full = "\n".join([text] + children)
            point = {"text": full, "ev": [_mk_note_ev(note.rel_path, sec)]}
            point["ev"].extend(_ts_evs(full, src_of))
            out.append(point)
            i = j
        else:
            i += 1
    return out


# ================================================================ comparison

def build_comparisons(note: ScannedNote, concept_lookup, src_of,
                      issues: List[dict]) -> List[dict]:
    """概念卡中的表格 → comparison 块。

    优点/局限两列表 → pros_cons；其余 ≥2 数据列的表 → matrix
    （首列=对象，其余列=维度）。对象可映射到其它概念时记录 contrast 候选。
    """
    out: List[dict] = []
    doc = note.doc
    for sec, tbl in doc.tables():
        if _skip_section(sec):
            continue
        if len(tbl.header) < 2:
            continue
        head_text = " ".join(tbl.header)
        block = {
            "id": None,
            "shape": "comparison",
            "title": (sec.heading or "对比表").strip(),
            "grounding": "note",
            "ev": [_mk_note_ev(note.rel_path, sec)],
        }
        if ("优点" in head_text and "局限" in head_text) or \
           ("✅" in head_text and "⚠️" in head_text):
            block["compare_mode"] = "pros_cons"
            items = [{"label": strip_md(h) or ("列%d" % (i + 1)),
                      "concept": None}
                     for i, h in enumerate(tbl.header[:2])]
            col_texts = []
            for dim_i in range(min(2, len(tbl.header))):
                texts = []
                for row in tbl.rows:
                    cell, _ = _mark_of(row[dim_i] if dim_i < len(row) else "")
                    if cell:
                        texts.append(cell)
                col_texts.append("；".join(texts))
            while len(col_texts) < 2:
                col_texts.append("")
            block["items"] = items
            block["dims"] = ["要点"]
            block["cells"] = [[{"text": col_texts[0]}, {"text": col_texts[1]}]]
        else:
            block["compare_mode"] = "matrix"
            items = []
            for row in tbl.rows:
                label, mark = _mark_of(row[0])
                concept = concept_lookup(label) if label else None
                items.append({"label": label or "对象%d" % (len(items) + 1),
                              "concept": concept})
            dims = [strip_md(h) or "维度%d" % (i + 1)
                    for i, h in enumerate(tbl.header[1:])]
            cells = []
            for d in range(len(dims)):
                row_cells = []
                for it_i, row in enumerate(tbl.rows):
                    raw = row[d + 1] if d + 1 < len(row) else ""
                    text, mark = _mark_of(raw)
                    cell = {"text": text}
                    if mark:
                        cell["mark"] = mark
                    row_cells.append(cell)
                cells.append(row_cells)
            block["items"], block["dims"], block["cells"] = items, dims, cells
            if len(items) > ITEM_CAP:
                issues.append({"kind": "comparison_items_overflow", "note": note.rel_path,
                               "detail": "对比对象 %d 超过建议上限 %d（保留全部）"
                                         % (len(items), ITEM_CAP)})
            if len(dims) > DIM_CAP:
                issues.append({"kind": "comparison_dims_overflow", "note": note.rel_path,
                               "detail": "对比维度 %d 超过建议上限 %d（保留全部）"
                                         % (len(dims), DIM_CAP)})
        out.append(block)
    return out


def contrast_pairs(blocks: List[dict]) -> List[Tuple[str, str]]:
    """comparison 块中 ≥2 个对象映射到概念 → contrast 关系候选。"""
    pairs = []
    for b in blocks:
        mapped = [it["concept"] for it in b.get("items", []) if it.get("concept")]
        if len(mapped) >= 2:
            pairs.append((mapped[0], mapped[1]))
    return pairs


# ================================================================ process

def build_processes(note: ScannedNote, src_of, issues: List[dict]) -> List[dict]:
    """有序步骤 → process 块。依据：markdown 有序列表 或 ①②③ 行（含围栏）。"""
    doc = note.doc
    out: List[dict] = []
    for sec in doc.sections:
        if _skip_section(sec):
            continue
        steps = _ordered_steps(sec, note, src_of)
        if len(steps) < 2:
            continue
        if len(steps) > STEP_CAP:
            issues.append({"kind": "process_steps_overflow", "note": note.rel_path,
                           "detail": "步骤 %d 超过建议上限 %d（保留全部）"
                                     % (len(steps), STEP_CAP)})
        heading = (sec.heading or "") or "流程"
        mode = "derivation" if re.search(r"推导|证明|约掉", heading + sec.text[:200]) \
            else ("time" if re.search(r"历史|时间线|时间轴", heading) else "causal")
        out.append({
            "id": None,
            "shape": "process",
            "title": heading,
            "grounding": "note",
            "mode": mode,
            "steps": steps,
            "ev": [_mk_note_ev(note.rel_path, sec)],
        })
    return out


def _ordered_steps(sec: Section, note: ScannedNote, src_of) -> List[dict]:
    steps: List[dict] = []
    lines = list(sec.lines)

    def push(label: str):
        label = strip_md(label).strip()
        if not label:
            return
        step = {"label": label, "ev": [_mk_note_ev(note.rel_path, sec)]}
        step["ev"].extend(_ts_evs(label, src_of))
        steps.append(step)

    # ① 围栏里的 ①②③ 行（整个围栏合计 ≥2 行才成块）
    fence_buf: Optional[List[str]] = None
    for line in lines:
        s = line.strip()
        if s.startswith("```"):
            if fence_buf is not None:
                _circled_steps(fence_buf, push)
                fence_buf = None
            else:
                fence_buf = []
            continue
        if fence_buf is not None:
            fence_buf.append(line)
    if fence_buf:
        _circled_steps(fence_buf, push)

    # ② markdown 有序列表（连续 ≥2 项；允许嵌套缩进）
    run: List[str] = []
    for line in lines:
        m = ORDERED_RE.match(line)
        if m:
            run.append(m.group(3))
        else:
            if len(run) >= 2:
                for t in run:
                    push(t)
            run = []
    if len(run) >= 2:
        for t in run:
            push(t)
    return steps


def _circled_steps(lines: List[str], push) -> int:
    """把围栏内 ①②③ 开头的行变成步骤；返回行数（<2 时不动）。"""
    circled = [ln.strip()[1:].strip() for ln in lines
               if ln.strip() and ln.strip()[0] in CIRCLED]
    if len(circled) >= 2:
        for t in circled:
            push(t)
    return len(circled)


def circled_run_length(fence: Fence) -> int:
    return sum(1 for ln in fence.code.splitlines()
               if ln.strip() and ln.strip()[0] in CIRCLED)


# ================================================================ procedure

def build_procedure(practice: ScannedNote, src_of, issues: List[dict]) -> Tuple[dict, List[dict]]:
    """实操清单 → 主题级 procedure 块（航线终点，不硬挂概念）。"""
    doc = practice.doc
    block = {
        "id": "proc.%s" % slugify(doc.title),
        "shape": "procedure",
        "title": doc.title,
        "grounding": "note",
        "ev": [{"note": practice.rel_path}],
        "groups": [],
        "warnings": [],
    }
    preserved: List[dict] = []
    for c in doc.callouts():
        if c.kind in ("warning", "caution"):
            for ln in c.lines:
                t = ln.strip().lstrip("-").strip()
                if t:
                    block["warnings"].append(t)
    for sec in doc.sections:
        if _skip_section(sec):
            continue
        items = []
        for line in sec.lines:
            m = TASK_RE.match(line)
            if not m:
                continue
            text = m.group(3).strip()
            item = {"id": "t%d" % (len(items) + 1), "text": text,
                    "ev": [_mk_note_ev(practice.rel_path, sec)]}
            item["ev"].extend(_ts_evs(text, src_of))
            v = re.search(r"[（(]验证[:：]\s*([^）)]+)[）)]", text)
            if v:
                item["verify"] = v.group(1).strip()
            c = re.search(r"`([^`]+)`", text)
            if c and c.group(1) in text:
                item["cmd"] = c.group(1)
            items.append(item)
        if items:
            if len(items) > 8:
                issues.append({"kind": "procedure_items_overflow", "note": practice.rel_path,
                               "detail": "分组 %r 条目 %d 超过建议上限 8（保留全部）"
                                         % (sec.heading, len(items))})
            block["groups"].append({"title": sec.heading, "items": items})
        elif sec.text:
            preserved.append({"heading": sec.heading, "text": sec.text})
    if not block["groups"]:
        issues.append({"kind": "procedure_no_checklist", "note": practice.rel_path,
                       "detail": "实操笔记中没有任务清单项"})
    return block, preserved


# ================================================================ structure

def build_structure(home: Optional[ScannedNote], idx: TopicIndex, concept_by_norm,
                    src_of, issues: List[dict]):
    """学习主页 mermaid 全景图 → structure 块 + uses 关系。

    返回 (block, anchor_concept_id, uses_relations)。锚概念 = 图中映射到
    概念的节点里度数最大者（并列取先出现）。
    """
    if home is None:
        return None, None, []
    doc = home.doc
    graph = None
    for sec, fence in doc.fences():
        if fence.lang == "mermaid":
            graph = (sec, fence)
            break
    if graph is None:
        issues.append({"kind": "no_overview_graph", "note": home.rel_path,
                       "detail": "学习主页没有 mermaid 全景图，跳过 structure 块"})
        return None, None, []
    sec, fence = graph
    nodes, edges = parse_mermaid(fence.code)

    mapped: Dict[str, Optional[str]] = {}
    for nid, label in nodes:
        mapped[nid] = _match_concept(label, concept_by_norm)

    unmapped = [lab for (nid, lab) in nodes if mapped[nid] is None]
    if unmapped:
        issues.append({"kind": "overview_nodes_unmapped", "note": home.rel_path,
                       "detail": "全景图 %d 个节点未对应概念卡: %s"
                                 % (len(unmapped), "、".join(unmapped[:6]))})

    degree: Dict[str, int] = {}
    for e in edges:
        degree[e.src] = degree.get(e.src, 0) + 1
        degree[e.dst] = degree.get(e.dst, 0) + 1
    anchor = None
    best = -1
    for nid, _ in nodes:
        if mapped.get(nid) and degree.get(nid, 0) > best:
            best = degree.get(nid, 0)
            anchor = mapped[nid]
    if anchor is None:
        issues.append({"kind": "overview_no_anchor", "note": home.rel_path,
                       "detail": "全景图没有任何节点对应概念卡，structure 块未生成"})
        return None, None, []

    block = {
        "id": "%s.overview" % anchor,
        "shape": "structure",
        "title": (sec.heading or "全景图").strip(),
        "grounding": "note",
        "layout": "flow",
        "nodes": [{"id": nid, "label": lab, "concept": mapped.get(nid)}
                  for nid, lab in nodes],
        "edges": [{"from": e.src, "to": e.dst, "label": e.label, "kind": "flow"}
                  for e in edges],
        "ev": [_mk_note_ev(home.rel_path, sec)],
    }
    uses = []
    seen = set()
    for e in edges:
        a, b = mapped.get(e.src), mapped.get(e.dst)
        if a and b and a != b and (a, b) not in seen:
            seen.add((a, b))
            uses.append({"a": a, "b": b, "kind": "uses",
                         "ev": [_mk_note_ev(home.rel_path, sec)]})
    return block, anchor, uses


def _match_concept(label: str, concept_by_norm) -> Optional[str]:
    """节点标签 ↔ 概念 label/别名：归一化后相等或互相包含。"""
    lab = normalize_for_match(label)
    if not lab:
        return None
    hit = concept_by_norm.get(lab)
    if hit:
        return hit
    for norm, cid in concept_by_norm.items():
        if not norm:
            continue
        if lab in norm or norm in lab:
            return cid
    return None


# ================================================================ preserved

def collect_preserved(note: ScannedNote, issues: List[dict]) -> List[dict]:
    """未被任何块覆盖的小节内容按原文保留（我的思考除外，留给用户）。

    已进入定义/对比/流程块的小节跳过；H1 段保留 abstract 以外的
    callout / 公式；其余小节整节保留。
    """
    doc = note.doc
    preserved: List[dict] = []
    for sec in doc.sections:
        skip = _skip_section(sec)
        if skip == "thinking":
            issues.append({"kind": "thinking_section_skipped", "note": note.rel_path,
                           "detail": "「我的思考」不进模板，留给用户"})
            continue
        if skip or not sec.text:
            continue
        if sec.level == 1:
            body = []
            keep = False
            for ln in sec.lines:
                s = ln.strip()
                if s.startswith("> [!"):
                    keep = s.startswith("> [!abstract]") is False
                    if keep:
                        body.append(ln)
                    continue
                if s.startswith(">"):
                    if keep:
                        body.append(ln)
                    continue
                keep = False
                if s.startswith("$$"):
                    body.append(ln)
            if body:
                preserved.append({"heading": None, "text": "\n".join(body).strip()})
            continue
        heading = sec.heading or ""
        if ("📌" in heading or "是什么" in heading or "角色" in heading
                or "优点" in heading or "局限" in heading):
            # 这些小节已进入定义/对比块
            continue
        # 含有序步骤的小节已进入 process 块
        if _ordered_steps(sec, note, lambda vid: None):
            continue
        preserved.append({"heading": sec.heading, "text": sec.text})
    return preserved
