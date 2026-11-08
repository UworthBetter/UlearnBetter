# -*- coding: utf-8 -*-
"""主题目录扫描与笔记分类：用 tags 识别概念卡 / 章节笔记 / 实操 / 资源 /
学习主页；tags 缺失或损坏时按目录名降级，并在报告中记录分类依据。
"""
from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional

from mdparse import NoteDoc, parse_note, slugify, stem_of

TAG_CONCEPT = "类型/概念卡"
TAG_CHAPTER = "类型/课程笔记"
TAG_PRACTICE = "类型/实操"
TAG_RESOURCE = "类型/资源"
TAG_MOC = "MOC"

DIR_HINTS = (
    ("02-概念卡", "concept"),
    ("03-实操清单", "practice"),
    ("01-课程笔记", "chapter"),
    ("90-资源", "resource"),
)

CLASS_CONCEPT = "concept"
CLASS_CHAPTER = "chapter"
CLASS_PRACTICE = "practice"
CLASS_RESOURCE = "resource"
CLASS_HOME = "home"
CLASS_OTHER = "other"


def sha1_text(text: str) -> str:
    return "sha1:" + hashlib.sha1(text.encode("utf-8")).hexdigest()


@dataclass
class ScannedNote:
    doc: NoteDoc
    rel_path: str
    note_class: str          # CLASS_*
    classified_by: str       # "tag" / "dir" / "filename"
    note_hash: str

    @property
    def stem(self) -> str:
        return stem_of(self.rel_path)


@dataclass
class TopicIndex:
    root: Path
    topic_id: str
    notes: List[ScannedNote] = field(default_factory=list)
    issues: List[dict] = field(default_factory=list)

    # ---- 按类查询
    def of_class(self, cls: str) -> List[ScannedNote]:
        return [n for n in self.notes if n.note_class == cls]

    @property
    def concepts(self) -> List[ScannedNote]:
        return self.of_class(CLASS_CONCEPT)

    @property
    def chapters(self) -> List[ScannedNote]:
        return self.of_class(CLASS_CHAPTER)

    @property
    def practices(self) -> List[ScannedNote]:
        return self.of_class(CLASS_PRACTICE)

    @property
    def resources(self) -> List[ScannedNote]:
        return self.of_class(CLASS_RESOURCE)

    @property
    def home(self) -> Optional[ScannedNote]:
        homes = self.of_class(CLASS_HOME)
        if not homes:
            return None
        if len(homes) > 1:
            self.issues.append({
                "kind": "multiple_home_pages",
                "note": homes[1].rel_path,
                "detail": "存在 %d 个学习主页，使用第一个 %s" % (len(homes), homes[0].rel_path),
            })
        return homes[0]

    # ---- wikilink 解析（主题内按文件名解析，Obsidian 最短路径语义）
    def resolve_stem(self, stem: str) -> Optional[ScannedNote]:
        """按文件名解析 wikilink 目标。同名单记为歧义并取排序第一个。"""
        hits = [n for n in self.notes if n.stem == stem]
        if not hits:
            return None
        if len(hits) > 1:
            self.issues.append({
                "kind": "ambiguous_wikilink",
                "note": hits[1].rel_path,
                "detail": "同名笔记 %r，解析到 %s" % (stem, hits[0].rel_path),
            })
        return hits[0]


def _classify(doc: NoteDoc, rel_path: str) -> tuple:
    """返回 (class, by)。tags 优先，缺 tag/元数据损坏时按目录与文件名降级。"""
    tags = doc.frontmatter.get("tags")
    tag_list: List[str] = []
    if isinstance(tags, list):
        tag_list = [str(t) for t in tags if t is not None]
    elif isinstance(tags, str) and tags.strip():
        tag_list = [t.strip() for t in tags.split(",") if t.strip()]

    for tag, cls in ((TAG_CONCEPT, CLASS_CONCEPT), (TAG_CHAPTER, CLASS_CHAPTER),
                     (TAG_PRACTICE, CLASS_PRACTICE), (TAG_RESOURCE, CLASS_RESOURCE),
                     (TAG_MOC, CLASS_HOME)):
        if tag in tag_list:
            return cls, "tag"

    for frag, cls in DIR_HINTS:
        if frag in rel_path.replace("\\", "/"):
            return cls, "dir"
    if "学习主页" in rel_path:
        return CLASS_HOME, "filename"
    if doc.find_section("一句话定义") is not None:
        return CLASS_CONCEPT, "structure"
    return CLASS_OTHER, "none"


def scan_topic(root: Path) -> TopicIndex:
    root = root.resolve()
    if not root.is_dir():
        raise FileNotFoundError("主题目录不存在: %s" % root)
    idx = TopicIndex(root=root, topic_id=root.name)
    for path in sorted(root.rglob("*.md")):
        rel = path.relative_to(root).as_posix()
        if "Templates" in rel.split("/"):
            # 模板是建库脚手架，不是学习内容
            idx.issues.append({"kind": "template_note_skipped", "note": rel,
                               "detail": "Templates 目录不参与编译"})
            continue
        try:
            text = path.read_text(encoding="utf-8-sig")
        except UnicodeDecodeError as exc:
            idx.issues.append({"kind": "unreadable_note", "note": rel,
                               "detail": "utf-8 解码失败: %s" % exc})
            continue
        doc = parse_note(rel, text)
        if doc.frontmatter_error:
            idx.issues.append({"kind": "corrupted_metadata", "note": rel,
                               "detail": doc.frontmatter_error})
        cls, by = _classify(doc, rel)
        idx.notes.append(ScannedNote(
            doc=doc, rel_path=rel, note_class=cls, classified_by=by,
            note_hash=sha1_text(text)))
        if by != "tag":
            idx.issues.append({"kind": "classified_by_fallback", "note": rel,
                               "detail": "分类依据=%s（tags 缺失或损坏）" % by})
    return idx
