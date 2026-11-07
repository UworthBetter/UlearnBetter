# -*- coding: utf-8 -*-
"""LLM 抽取预留接口。

默认 NullExtractor：完全不调用模型，基本转换不被密钥阻塞。
- FrontmatterAnnotatedExtractor：读概念卡 frontmatter 的 learn_blocks
  标注（人工或上游 LLM 预写、随笔记入库），确定性进入并逐块校验，
  是离线也能用的注入通道，也是将来 LLM 抽取结果的落盘形态。
- load_extractor("pkg.module:Attr")：注入自定义实现（例如真实 LLM
  客户端），由集成方在自己的环境里提供；本仓库不含任何密钥逻辑。

注入块必须自带 ev 与 grounding，校验失败会被丢弃并记录，不会
静默进入 learn.json。模拟输出必须以 extractor 名标记，不得冒充
真实模型联调。
"""
from __future__ import annotations

import importlib
from typing import Callable, List, Optional, Protocol, runtime_checkable

from topic import ScannedNote

BLOCK_SHAPES = ("definition", "structure", "process",
                "comparison", "variation", "procedure")
GROUNDINGS = ("video", "note", "derived", "illustrative", "supplementary")


@runtime_checkable
class ConceptExtractor(Protocol):
    name: str

    def extract(self, note: ScannedNote,
                ev_note: Callable[[str], dict]) -> List[dict]:
        """返回附加块（dict 列表）。ev_note(rel_or_heading) 生成笔记证据。"""
        ...


class NullExtractor:
    """无模型默认实现：不产出任何附加块。"""

    name = "null"

    def extract(self, note: ScannedNote,
                ev_note: Callable[[str], dict]) -> List[dict]:
        return []


class FrontmatterAnnotatedExtractor:
    """读取概念卡 frontmatter `learn_blocks` 标注（YAML 子集里的
    行内 JSON 不现实，因此约定标注为 JSON 字符串或块列表）。"""

    name = "frontmatter-annotated"

    def extract(self, note: ScannedNote,
                ev_note: Callable[[str], dict]) -> List[dict]:
        import json
        raw = note.doc.frontmatter.get("learn_blocks")
        if raw is None:
            return []
        blocks = raw
        if isinstance(raw, str):
            try:
                blocks = json.loads(raw)
            except ValueError:
                raise ValueError("learn_blocks 不是合法 JSON: %r" % raw[:80])
        if not isinstance(blocks, list):
            raise ValueError("learn_blocks 必须是块列表")
        out = []
        for b in blocks:
            if not isinstance(b, dict):
                raise ValueError("learn_blocks 元素必须是对象")
            block = dict(b)
            block.setdefault("title", "标注块")
            block.setdefault("role", "principle")
            if "ev" not in block:
                block["ev"] = [ev_note(note.rel_path)]
            out.append(block)
        return out


def validate_injected(block: dict, concept_id: str, used_ids: set,
                      issues: List[dict], note_rel: str) -> Optional[dict]:
    """对注入块做保守校验；失败返回 None 并记录 issue。"""
    shape = block.get("shape")
    if shape not in BLOCK_SHAPES:
        issues.append({"kind": "injected_block_invalid", "note": note_rel,
                       "detail": "未知形状 %r，丢弃" % shape})
        return None
    grounding = block.get("grounding", "note")
    if grounding not in GROUNDINGS:
        issues.append({"kind": "injected_block_invalid", "note": note_rel,
                       "detail": "未知 grounding %r，丢弃" % grounding})
        return None
    ev = block.get("ev")
    if not isinstance(ev, list) or not ev:
        issues.append({"kind": "injected_block_invalid", "note": note_rel,
                       "detail": "注入块缺少 ev，丢弃"})
        return None
    if shape == "variation":
        if not block.get("series") or not block.get("inputs"):
            issues.append({"kind": "injected_block_invalid", "note": note_rel,
                           "detail": "variation 需要 inputs 与 series，丢弃"})
            return None
    bid = block.get("id") or "%s.%s-ann" % (concept_id, shape)
    if bid in used_ids:
        issues.append({"kind": "injected_block_invalid", "note": note_rel,
                       "detail": "块 id %r 重复，丢弃" % bid})
        return None
    block["id"] = bid
    block.setdefault("title", "标注块")
    return block


def load_extractor(spec: str) -> ConceptExtractor:
    """spec: "null" | "annotated" | "包.模块:类名"。"""
    if spec == "null":
        return NullExtractor()
    if spec == "annotated":
        return FrontmatterAnnotatedExtractor()
    if ":" not in spec:
        raise ValueError("extractor 规格应为 null/annotated/pkg.module:Attr，得到 %r" % spec)
    mod_name, attr = spec.split(":", 1)
    mod = importlib.import_module(mod_name)
    try:
        cls = getattr(mod, attr)
    except AttributeError:
        raise ValueError("模块 %s 中没有 %s" % (mod_name, attr))
    instance = cls()
    if not isinstance(instance, ConceptExtractor):
        raise TypeError("%s 不是 ConceptExtractor" % spec)
    return instance
