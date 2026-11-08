# -*- coding: utf-8 -*-
"""Obsidian markdown 笔记的确定性解析层。

只做结构解析，不做内容判断：frontmatter（YAML 子集）、章节、callout、
表格、任务清单、有序步骤、==高亮==、wikilink、时间戳链接、代码围栏、
mermaid 图。解析失败以异常/错误字段上抛，由调用方降级并记录。
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

FRONTMATTER_DELIM = "---"
# 兼容 Obsidian 转义竖线写法 [[目标\|显示]]
WIKILINK_RE = re.compile(r"\[\[([^\]|\n#]+?)(?:#[^\]|\n]*)?(?:\\?\|[^\]]*)?\]\]")
HIGHLIGHT_RE = re.compile(r"==([^=\n]+)==")
VIDEO_URL_RE = re.compile(
    r"(?:youtube\.com/watch\?\S*v=|youtu\.be/)([A-Za-z0-9_-]{5,})", re.IGNORECASE
)
T_PARAM_RE = re.compile(r"[?&]t=(\d+)s?", re.IGNORECASE)
BULLET_RE = re.compile(r"^(\s*)[-*]\s+(.*)$")
ORDERED_RE = re.compile(r"^(\s*)(\d+)[.、)）]\s+(.*)$")
TASK_RE = re.compile(r"^(\s*)- \[([ xX])\] (.*)$")
CALLOUT_RE = re.compile(r"^>\s*\[!(\w+)\]\s*(.*)$")
HEADING_RE = re.compile(r"^(#{1,6})\s+(.*)$")
CODE_FENCE_RE = re.compile(r"^```([\w-]*)\s*$")
CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳"


class FrontmatterError(ValueError):
    """frontmatter 存在但无法按 YAML 子集解析（损坏元数据）。"""


# ---------------------------------------------------------------- YAML 子集

def parse_yaml_lite(text: str) -> Dict[str, object]:
    """解析笔记 frontmatter 用到的 YAML 子集。

    支持：`key: value`、缩进块列表（`- item`）、行内列表 `[a, b]`、
    引号字符串、注释行。遇到无法理解的结构抛 FrontmatterError，
    由调用方按「损坏元数据」降级处理。
    """
    data: Dict[str, object] = {}
    current_key: Optional[str] = None
    current_list: Optional[List[object]] = None
    for raw in text.splitlines():
        if not raw.strip() or raw.strip().startswith("#"):
            continue
        indent = len(raw) - len(raw.lstrip(" "))
        line = raw.strip()
        if line.startswith("- "):
            if current_key is None or current_list is None:
                raise FrontmatterError("列表项出现在任何键之前: %r" % raw)
            if indent == 0:
                raise FrontmatterError("列表项缺少缩进: %r" % raw)
            current_list.append(_yaml_scalar(line[2:].strip()))
            continue
        m = re.match(r"^([^:：]+)[:：]\s*(.*)$", line)
        if not m:
            raise FrontmatterError("无法解析的行: %r" % raw)
        key = m.group(1).strip().strip("\"'")
        value = m.group(2).strip()
        if value == "":
            current_key = key
            current_list = []
            data[key] = current_list
        else:
            current_key, current_list = None, None
            data[key] = _yaml_value(value)
    return data


def _yaml_value(text: str) -> object:
    if text.startswith("[") and text.endswith("]"):
        inner = text[1:-1].strip()
        if not inner:
            return []
        return [_yaml_scalar(p.strip()) for p in _split_top(inner)]
    return _yaml_scalar(text)


def _split_top(text: str) -> List[str]:
    parts, buf, depth, quote = [], [], 0, None
    for ch in text:
        if quote:
            buf.append(ch)
            if ch == quote:
                quote = None
            continue
        if ch in "\"'":
            quote = ch
            buf.append(ch)
        elif ch in "[{":
            depth += 1
            buf.append(ch)
        elif ch in "]}":
            depth -= 1
            buf.append(ch)
        elif ch == "," and depth == 0:
            parts.append("".join(buf))
            buf = []
        else:
            buf.append(ch)
    if buf:
        parts.append("".join(buf))
    return parts


def _yaml_scalar(text: str) -> object:
    if len(text) >= 2 and text[0] == text[-1] and text[0] in "\"'":
        return text[1:-1]
    if text in ("true", "True"):
        return True
    if text in ("false", "False"):
        return False
    if text in ("null", "~"):
        return None
    return text


# ---------------------------------------------------------------- 数据结构

@dataclass
class Callout:
    kind: str  # abstract / info / warning / quote ...
    title: str
    lines: List[str] = field(default_factory=list)

    @property
    def text(self) -> str:
        return "\n".join(self.lines)


@dataclass
class Table:
    header: List[str]
    rows: List[List[str]] = field(default_factory=list)

    def as_text(self) -> str:
        lines = ["| " + " | ".join(self.header) + " |"]
        for row in self.rows:
            lines.append("| " + " | ".join(row) + " |")
        return "\n".join(lines)


@dataclass
class Fence:
    lang: str
    code: str


@dataclass
class Section:
    heading: Optional[str]  # 标题文本；文件开头无名段为 None
    level: int  # 标题级别；开头段为 0
    lines: List[str] = field(default_factory=list)

    @property
    def text(self) -> str:
        return "\n".join(self.lines).strip()

    def anchor(self) -> str:
        return self.heading or "（开头）"


@dataclass
class NoteDoc:
    rel_path: str
    raw: str
    frontmatter: Dict[str, object] = field(default_factory=dict)
    frontmatter_error: Optional[str] = None
    h1: Optional[str] = None
    sections: List[Section] = field(default_factory=list)

    @property
    def title(self) -> str:
        fm_title = self.frontmatter.get("title")
        if isinstance(fm_title, str) and fm_title.strip():
            return fm_title.strip()
        if self.h1:
            return strip_md(self.h1)
        return stem_of(self.rel_path)

    def find_section(self, keyword: str) -> Optional[Section]:
        for sec in self.sections:
            if sec.heading and keyword in sec.heading:
                return sec
        return None

    def callouts(self) -> List[Callout]:
        out: List[Callout] = []
        for sec in self.sections:
            out.extend(_callouts_of(sec.lines))
        return out

    def abstract(self) -> Optional[str]:
        for c in self.callouts():
            if c.kind == "abstract":
                return c.text.strip()
        return None

    def tables(self) -> List[Tuple[Section, Table]]:
        out = []
        for sec in self.sections:
            for tbl in _tables_of(sec.lines):
                out.append((sec, tbl))
        return out

    def fences(self) -> List[Tuple[Section, Fence]]:
        out = []
        for sec in self.sections:
            for f in _fences_of(sec.lines):
                out.append((sec, f))
        return out

    def wikilinks(self) -> List[Tuple[Section, str]]:
        out: List[Tuple[Section, str]] = []
        for sec in self.sections:
            for target in wiki_targets(sec.text):
                out.append((sec, target))
        return out

    def timestamps(self) -> List[dict]:
        return find_timestamps(self.raw)


# ---------------------------------------------------------------- 行级解析

def _callouts_of(lines: List[str]) -> List[Callout]:
    out: List[Callout] = []
    cur: Optional[Callout] = None
    for line in lines:
        m = CALLOUT_RE.match(line)
        if m:
            cur = Callout(kind=m.group(1).lower(), title=m.group(2).strip())
            out.append(cur)
            continue
        if cur is not None:
            if line.startswith(">"):
                cur.lines.append(re.sub(r"^>\s?", "", line))
            else:
                cur = None
    return out


def _tables_of(lines: List[str]) -> List[Table]:
    tables: List[Table] = []
    cur_rows: List[List[str]] = []
    for line in lines:
        s = line.strip()
        if s.startswith("|") and s.endswith("|") and len(s) > 1:
            cells = [c.strip() for c in s[1:-1].split("|")]
            if all(re.fullmatch(r":?-{2,}:?", c) for c in cells):
                continue  # 分隔行
            cur_rows.append(cells)
        else:
            if cur_rows:
                tables.append(_mk_table(cur_rows))
                cur_rows = []
    if cur_rows:
        tables.append(_mk_table(cur_rows))
    return tables


def _mk_table(rows: List[List[str]]) -> Table:
    width = max(len(r) for r in rows)
    rows = [r + [""] * (width - len(r)) for r in rows]
    return Table(header=rows[0], rows=rows[1:])


def _fences_of(lines: List[str]) -> List[Fence]:
    out: List[Fence] = []
    lang: Optional[str] = None
    buf: List[str] = []
    for line in lines:
        m = CODE_FENCE_RE.match(line.strip())
        if lang is None:
            if m:
                lang = m.group(1) or ""
                buf = []
        else:
            if m:
                out.append(Fence(lang=lang, code="\n".join(buf)))
                lang = None
                buf = []
            else:
                buf.append(line)
    return out


# ---------------------------------------------------------------- 文档解析

def parse_note(rel_path: str, text: str) -> NoteDoc:
    doc = NoteDoc(rel_path=rel_path.replace("\\", "/"), raw=text)
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    lines = text.split("\n")

    if lines and lines[0].strip() == FRONTMATTER_DELIM:
        end = None
        for i in range(1, min(len(lines), 60)):
            if lines[i].strip() == FRONTMATTER_DELIM:
                end = i
                break
        if end is None:
            doc.frontmatter_error = "frontmatter 未闭合"
        else:
            try:
                doc.frontmatter = parse_yaml_lite("\n".join(lines[1:end]))
            except FrontmatterError as exc:
                doc.frontmatter_error = str(exc)
            lines = lines[end + 1:]

    cur = Section(heading=None, level=0)
    in_fence = False
    for line in lines:
        stripped = line.strip()
        if stripped.startswith("```"):
            in_fence = not in_fence
            cur.lines.append(line)
            continue
        if not in_fence:
            m = HEADING_RE.match(stripped)
            if m:
                if cur.lines or cur.heading is not None:
                    doc.sections.append(cur)
                cur = Section(heading=strip_md(m.group(2).strip()), level=len(m.group(1)))
                continue
        if not (cur.heading is None and not stripped):
            cur.lines.append(line)
    if cur.heading is not None or cur.lines:
        doc.sections.append(cur)

    for sec in doc.sections:
        if sec.level == 1 and doc.h1 is None:
            doc.h1 = sec.heading
    return doc


# ---------------------------------------------------------------- 提取函数

def strip_md(text: str) -> str:
    """去掉 wikilink/链接语法，保留可读文本（保留 ==、** 等内联标记）。"""
    text = re.sub(
        r"\[\[([^\]|\n#]+?)(?:#[^\]\n]*)?(?:\\?\|([^\]]*))?\]\]",
        lambda m: (m.group(2) or m.group(1)).rstrip("\\"), text)
    text = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", text)
    return text.strip()


def wiki_targets(text: str) -> List[str]:
    """提取 wikilink 目标（去锚点/显示名/转义反斜杠后的干净目标）。"""
    return [m.group(1).strip().rstrip("\\")
            for m in WIKILINK_RE.finditer(text)]


def stem_of(rel_path: str) -> str:
    name = rel_path.replace("\\", "/").split("/")[-1]
    return re.sub(r"\.md$", "", name)


MD_TS_LINK_RE = re.compile(r"\[(\d{1,2}:\d{2}(?::\d{2})?)\]\(([^)\s]+)\)")


def find_timestamps(text: str) -> List[dict]:
    """提取 (video_id, 起点秒)。只认两种明确依据：

    1. `[m:ss](url)` 链接：t 参数优先，否则用标签里的时间；
    2. 裸 URL 的 t 参数。
    两者都没有的时间不编造。
    """
    out: List[dict] = []
    covered: List[tuple] = []
    for m in MD_TS_LINK_RE.finditer(text):
        url = m.group(2)
        vm = VIDEO_URL_RE.search(url)
        if not vm:
            continue
        tm = T_PARAM_RE.search(url)
        t = float(tm.group(1)) if tm else hms_to_sec(m.group(1))
        out.append({"video_id": vm.group(1), "t": t})
        covered.append((m.start() + vm.start(), m.start() + vm.end()))
    for m in VIDEO_URL_RE.finditer(text):
        if any(s <= m.start() < e for s, e in covered):
            continue
        tail = text[m.end():m.end() + 120]
        tail = re.split(r"[\s)]", tail, maxsplit=1)[0]
        tm = T_PARAM_RE.search(tail)
        if tm:
            out.append({"video_id": m.group(1), "t": float(tm.group(1))})
    return out


def hms_to_sec(s: str) -> float:
    sec = 0.0
    for p in s.split(":"):
        sec = sec * 60 + float(p)
    return sec


def highlights(text: str) -> List[str]:
    return [h.strip() for h in HIGHLIGHT_RE.findall(text)]


# ---------------------------------------------------------------- mermaid

@dataclass
class GraphEdge:
    src: str
    dst: str
    label: Optional[str] = None


_ARROW_RE = re.compile(r"\s*(-\.->|==>|-->)")
_NODE_RE = re.compile(
    r"\s*([A-Za-z0-9_\u4e00-\u9fff]+)\s*(\[[^\]]*\]|\([^)]*\)|\{[^}]*\})?")
_SKIP_KW = ("flowchart", "graph", "subgraph", "end", "classdef", "class",
            "style", "click", "direction")


def parse_mermaid(code: str) -> Tuple[List[Tuple[str, str]], List[GraphEdge]]:
    """解析 flowchart 的节点与边；subgraph/end 等修饰行跳过。

    支持 A --> B、A -->|标签| B、链式 A --> B --> C、-.-> 与 ==>。
    返回 (nodes[(id,label)], edges)。
    """
    node_labels: Dict[str, str] = {}
    order: List[str] = []
    edges: List[GraphEdge] = []

    def register(nid: str, label: Optional[str]) -> str:
        nid = nid.strip()
        if not nid:
            return ""
        if label:
            lab = re.sub(r"<br\s*/?>", " ", label[1:-1])
            lab = re.sub(r"[\"'“”‘’「」]", "", lab).strip()
            node_labels[nid] = lab
        if nid not in node_labels:
            node_labels[nid] = nid
        if nid not in order:
            order.append(nid)
        return nid

    for raw in code.splitlines():
        line = raw.strip()
        if not line or line.split(" ")[0].lower() in _SKIP_KW:
            continue
        tokens: List[Tuple[str, str]] = []  # ("node", id) / ("arrow", label)
        pos = 0
        while pos < len(line):
            am = _ARROW_RE.search(line, pos)
            nm = _NODE_RE.match(line, pos)
            if nm and (am is None or nm.start() <= am.start()):
                nid = register(nm.group(1), nm.group(2))
                if nid:
                    tokens.append(("node", nid))
                pos = nm.end()
            elif am:
                pos = am.end()
                lbl = None
                if line[pos:pos + 1] == "|":
                    close = line.find("|", pos + 1)
                    if close > 0:
                        lbl = re.sub(r"[\"'“”‘’]", "", line[pos + 1:close]).strip()
                        pos = close + 1
                tokens.append(("arrow", lbl or ""))
            else:
                break
        prev_node: Optional[str] = None
        pending_label: Optional[str] = None
        saw_arrow = False
        for kind, val in tokens:
            if kind == "node":
                if prev_node is not None and saw_arrow:
                    edges.append(GraphEdge(prev_node, val, pending_label))
                prev_node = val
                saw_arrow = False
                pending_label = None
            else:
                saw_arrow = True
                pending_label = val if val else None

    nodes = [(nid, node_labels[nid]) for nid in order]
    return nodes, edges


# ---------------------------------------------------------------- misc

def slugify(text: str) -> str:
    text = unicodedata.normalize("NFKC", text).lower()
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"[^\w]+", "-", text, flags=re.UNICODE)
    return text.strip("-") or "note"


def normalize_for_match(text: str) -> str:
    """标签/别名/节点匹配用的归一化：NFKC、去空白与标点。"""
    text = unicodedata.normalize("NFKC", text)
    return re.sub(r"[\s\-_/·，,。.：:；;()（）\[\]【】\"'`~～!？?…]+", "", text).lower()
