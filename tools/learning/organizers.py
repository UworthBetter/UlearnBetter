# -*- coding: utf-8 -*-
"""Organizer 协议与内置实现（learning.organize/0.1）。

照搬 extractors.py 的注入模式：`load_organizer("null|folder|pkg.module:Attr")`。
输出一律是提议，不直接生效；只给必要内容（标题、一句话、目录名、概念名），
笔记和字幕是数据，提示里必须写明不能当指令执行。

- `null`   什么都不产出（无密钥时的默认行为，不阻塞导入）；
- `folder` folderHint 与某目标的 title 或 folders 规范化（NFKC、去空白、
  小写）后相同 → confidence 0.9；否则不产出。想法（idea）不处理。
- 输出按 schemas/record/organize-response.schema.json 的最小镜像校验
  （零第三方依赖），非法条目丢弃并写 warnings；已被拒绝的
  (subject, goalId) 组合必须过滤，实现方漏过滤时这里兜底。
"""
from __future__ import annotations

import importlib
import re
import unicodedata
from typing import List, Optional, Protocol, Set, Tuple, runtime_checkable

ORGANIZE_SCHEMA = "learning.organize/0.1"

# SubjectRef / goalId 的 ID 字符集（与 schemas/record 契约一致）
_SIMPLE_ID = r"[A-Za-z0-9._\-\u4e00-\u9fff]{1,120}"
_SUBJECT_RE = re.compile(
    r"^(?:(?:goal|item|topic):%(id)s|(?:concept|procedure|procitem|relation):"
    r"[A-Za-z0-9._\-\u4e00-\u9fff/~]{1,363})$" % {"id": _SIMPLE_ID})
_ID_RE = re.compile(r"^%s$" % _SIMPLE_ID)

FOLDER_CONFIDENCE = 0.9


def normalize_folder(text: str) -> str:
    """目录名归一化：NFKC、trim、小写（C0 裁决）。"""
    return unicodedata.normalize("NFKC", str(text)).strip().lower()


@runtime_checkable
class Organizer(Protocol):
    name: str
    version: str

    def organize(self, request: dict) -> dict:
        """输入输出均为 learning.organize/0.1 的 dict。"""
        ...


class NullOrganizer:
    """无模型默认实现：不产出任何提议。"""

    name = "null"
    version = "0.1"

    def organize(self, request: dict) -> dict:
        return _empty_response(self)


class FolderOrganizer:
    """按目录名映射到目标（等价于今天的行为，作为基线）。"""

    name = "folder"
    version = "0.1"

    def organize(self, request: dict) -> dict:
        rejected = _rejected_combos(request)
        assignments = []
        for item in request.get("items", []):
            if item.get("kind") == "idea":
                continue  # 想法不处理（第一轮裁决 7：不拆新概念）
            hint = item.get("folderHint")
            if not isinstance(hint, str) or not hint.strip():
                continue
            goal = _match_goal(hint, request.get("goals", []))
            if goal is None:
                continue
            if (item.get("subject"), goal["id"]) in rejected:
                # 已被用户拒绝的组合不得再次输出（静默过滤，golden 行为）
                continue
            assignments.append({
                "subject": item["subject"],
                "goalId": goal["id"],
                "confidence": FOLDER_CONFIDENCE,
                # 理由保留目录名原文（含空格），便于用户核对
                "reason": "目录名「%s」与目标「%s」对应" % (hint, goal["title"]),
                "evidence": [],
            })
        out = _empty_response(self)
        out["assignments"] = assignments
        return out


def _match_goal(hint: str, goals: List[dict]) -> Optional[dict]:
    norm = normalize_folder(hint)
    if not norm:
        return None
    for goal in goals:
        if norm == normalize_folder(goal.get("title", "")):
            return goal
        for folder in goal.get("folders", []) or []:
            if norm == normalize_folder(folder):
                return goal
    return None


def _empty_response(organizer) -> dict:
    return {
        "schema": ORGANIZE_SCHEMA,
        "organizer": _by(organizer),
        "assignments": [],
        "goalProposals": [],
        "ideaAttachments": [],
        "warnings": [],
    }


def _by(organizer) -> dict:
    return {
        "kind": "component",
        "name": getattr(organizer, "name", type(organizer).__name__),
        "version": getattr(organizer, "version", "0"),
        "model": None,
        "promptVersion": None,
        "mock": False,
    }


def load_organizer(spec: str) -> Organizer:
    """spec: "null" | "folder" | "包.模块:类名"。"""
    if spec == "null":
        return NullOrganizer()
    if spec == "folder":
        return FolderOrganizer()
    if ":" not in spec:
        raise ValueError(
            "organizer 规格应为 null/folder/pkg.module:Attr，得到 %r" % spec)
    mod_name, attr = spec.split(":", 1)
    mod = importlib.import_module(mod_name)
    try:
        cls = getattr(mod, attr)
    except AttributeError:
        raise ValueError("模块 %s 中没有 %s" % (mod_name, attr))
    instance = cls()
    if not isinstance(instance, Organizer):
        raise TypeError("%s 不是 Organizer" % spec)
    return instance


# ---------------------------------------------------------------- 校验

def run_organizer(organizer: Organizer, request: dict) -> dict:
    """调用 organizer.organize 并对输出做保守校验：

    - 结构 / 模式非法的条目丢弃并写 warnings；
    - 指向未知 subject / goalId 的 assignment 丢弃；
    - 已被 decisions.rejected 的 (subject, goalId) 组合强制过滤；
    - organizer 元数据非法时回退为保守描述并写 warning。
    """
    raw = organizer.organize(request)
    if not isinstance(raw, dict):
        raise ValueError("organizer 输出必须是对象，得到 %r" % type(raw).__name__)
    warnings: List[str] = [w for w in raw.get("warnings", [])
                           if isinstance(w, str)]

    subjects = {i.get("subject") for i in request.get("items", [])}
    kinds = {i.get("subject"): i.get("kind") for i in request.get("items", [])}
    goal_ids = {g.get("id") for g in request.get("goals", [])}
    rejected = _rejected_combos(request)

    by = raw.get("organizer")
    if not _valid_by(by):
        warnings.append("organizer 元数据非法，回退为保守描述：%r" % (by,))
        by = _by(organizer)

    assignments = []
    for a in raw.get("assignments", []) or []:
        if not isinstance(a, dict):
            warnings.append("丢弃非法 assignment（不是对象）：%r" % (a,))
            continue
        if not _valid_subject(a.get("subject")):
            warnings.append("丢弃非法 assignment（subject 无效）：%r"
                            % (a.get("subject"),))
            continue
        goal_id = a.get("goalId")
        if goal_id is not None and not _valid_id(goal_id):
            warnings.append("丢弃非法 assignment（goalId 无效）：%r" % (goal_id,))
            continue
        conf = a.get("confidence")
        if not isinstance(conf, (int, float)) or isinstance(conf, bool) \
                or not 0 <= conf <= 1:
            warnings.append("丢弃非法 assignment（confidence 越界）：%r" % (conf,))
            continue
        if not isinstance(a.get("reason"), str):
            warnings.append("丢弃非法 assignment（reason 缺失）：%r" % (a,))
            continue
        evidence = a.get("evidence", [])
        if not isinstance(evidence, list) or not all(
                isinstance(e, dict) and isinstance(e.get("sourceId"), str)
                for e in evidence):
            warnings.append("丢弃非法 assignment（evidence 无效）：%r" % (a,))
            continue
        if a["subject"] not in subjects:
            warnings.append("丢弃指向未知 subject 的 assignment：%r"
                            % (a["subject"],))
            continue
        if goal_id is not None and goal_id not in goal_ids:
            warnings.append("丢弃指向未知目标的 assignment：%s → %s"
                            % (a["subject"], goal_id))
            continue
        if goal_id is not None and (a["subject"], goal_id) in rejected:
            warnings.append("丢弃被用户拒绝过的组合：%s → %s"
                            % (a["subject"], goal_id))
            continue
        assignments.append({
            "subject": a["subject"], "goalId": goal_id,
            "confidence": conf, "reason": a["reason"],
            "evidence": [_clean_evidence(e) for e in evidence],
        })

    goal_proposals = []
    for p in raw.get("goalProposals", []) or []:
        if not isinstance(p, dict) or not isinstance(p.get("title"), str) \
                or not p.get("title") \
                or not isinstance(p.get("reason"), str) \
                or not isinstance(p.get("fromSubjects"), list) \
                or not all(_valid_subject(s) for s in p["fromSubjects"]):
            warnings.append("丢弃非法 goalProposal：%r" % (p,))
            continue
        intent = p.get("intent")
        goal_proposals.append({
            "title": p["title"], "intent": intent if isinstance(intent, str) else None,
            "reason": p["reason"], "fromSubjects": list(p["fromSubjects"]),
        })

    idea_attachments = []
    for at in raw.get("ideaAttachments", []) or []:
        if not isinstance(at, dict) or not _valid_subject(at.get("subject")) \
                or not _valid_subject(at.get("conceptRef")) \
                or not isinstance(at.get("reason"), str):
            warnings.append("丢弃非法 ideaAttachment：%r" % (at,))
            continue
        conf = at.get("confidence")
        if not isinstance(conf, (int, float)) or isinstance(conf, bool) \
                or not 0 <= conf <= 1:
            warnings.append("丢弃非法 ideaAttachment（confidence 越界）：%r"
                            % (conf,))
            continue
        if kinds.get(at["subject"]) != "idea":
            warnings.append("丢弃非想法资料的 ideaAttachment：%r"
                            % (at["subject"],))
            continue
        idea_attachments.append({
            "subject": at["subject"], "conceptRef": at["conceptRef"],
            "confidence": conf, "reason": at["reason"],
        })

    response = {
        "schema": ORGANIZE_SCHEMA,
        "organizer": by,
        "assignments": assignments,
        "goalProposals": goal_proposals,
        "ideaAttachments": idea_attachments,
        "warnings": warnings,
    }
    if request.get("sample") is True:
        response["sample"] = True
    return response


def _rejected_combos(request: dict) -> Set[Tuple[str, str]]:
    out = set()
    for r in (request.get("decisions") or {}).get("rejected", []) or []:
        if isinstance(r, dict):
            out.add((r.get("subject"), r.get("goalId")))
    return out


def _clean_evidence(e: dict) -> dict:
    """按 schema 收紧 evidence：sourceId 必填，url/note 须为字符串，
    startSec/endSec 须为数字，其余键丢弃。"""
    clean = {"sourceId": e["sourceId"]}
    if isinstance(e.get("url"), str):
        clean["url"] = e["url"]
    for key in ("startSec", "endSec"):
        if isinstance(e.get(key), (int, float)) and \
                not isinstance(e.get(key), bool):
            clean[key] = e[key]
    if isinstance(e.get("note"), str):
        clean["note"] = e["note"]
    return clean


def _valid_by(by) -> bool:
    return isinstance(by, dict) \
        and by.get("kind") in ("component", "compiler", "user") \
        and isinstance(by.get("name"), str) \
        and isinstance(by.get("version"), str) \
        and (by.get("model") is None or isinstance(by.get("model"), str)) \
        and (by.get("promptVersion") is None
             or isinstance(by.get("promptVersion"), str)) \
        and isinstance(by.get("mock"), bool)


def _valid_subject(s) -> bool:
    return isinstance(s, str) and bool(_SUBJECT_RE.match(s))


def _valid_id(s) -> bool:
    return isinstance(s, str) and bool(_ID_RE.match(s))
