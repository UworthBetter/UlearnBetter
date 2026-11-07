# -*- coding: utf-8 -*-
"""mdparse 解析层单元测试（无网络、无第三方依赖）。"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools" / "learning"))

import mdparse as mp  # noqa: E402


NOTE = """---
title: 示例
tags:
  - 类型/概念卡
  - 状态/待复习
aliases:
  - 别名一
created: 2026-11-07
---

# 示例标题

> [!abstract] 一句话定义
> 用==高亮短语==概括的概念。

## 📌 是什么

- 要点一（[1:23](https://www.youtube.com/watch?v=abcDEF12345&t=83s)）。
- 要点二 [0:45](https://youtu.be/abcDEF12345?si=x&t=45)。

## ⚖️ 优点与局限

| ✅ 优点 | ⚠️ 局限 |
| --- | --- |
| 快 | 贵 |

```text
① 第一步
② 第二步
```
"""


class TestFrontmatter(unittest.TestCase):
    def test_ok(self):
        doc = mp.parse_note("a.md", NOTE)
        self.assertEqual(doc.frontmatter["title"], "示例")
        self.assertEqual(doc.frontmatter["tags"], ["类型/概念卡", "状态/待复习"])
        self.assertEqual(doc.frontmatter["aliases"], ["别名一"])
        self.assertIsNone(doc.frontmatter_error)

    def test_corrupted(self):
        bad = "---\ntitle 没有冒号\n---\n\n# x\n"
        doc = mp.parse_note("b.md", bad)
        self.assertIsNotNone(doc.frontmatter_error)
        self.assertEqual(doc.frontmatter, {})

    def test_unclosed(self):
        doc = mp.parse_note("c.md", "---\ntitle: x\n\n正文")
        self.assertIsNotNone(doc.frontmatter_error)

    def test_inline_list(self):
        doc = mp.parse_note("d.md", "---\ntags: [类型/概念卡, MOC]\n---\n\n# x\n")
        self.assertEqual(doc.frontmatter["tags"], ["类型/概念卡", "MOC"])


class TestStructure(unittest.TestCase):
    def test_sections_and_abstract(self):
        doc = mp.parse_note("a.md", NOTE)
        self.assertEqual(doc.h1, "示例标题")
        self.assertEqual(doc.abstract(), "用==高亮短语==概括的概念。")
        headings = [s.heading for s in doc.sections if s.heading]
        self.assertIn("📌 是什么", headings)
        sec = doc.find_section("是什么")
        self.assertIn("要点一", sec.text)

    def test_tables(self):
        doc = mp.parse_note("a.md", NOTE)
        tables = doc.tables()
        self.assertEqual(len(tables), 1)
        _sec, tbl = tables[0]
        self.assertEqual(tbl.header, ["✅ 优点", "⚠️ 局限"])
        self.assertEqual(tbl.rows, [["快", "贵"]])

    def test_fences_and_circled(self):
        doc = mp.parse_note("a.md", NOTE)
        fences = doc.fences()
        self.assertEqual(len(fences), 1)
        self.assertEqual(fences[0][1].lang, "text")
        self.assertEqual(mp.CIRCLED[0], "①")

    def test_highlights(self):
        doc = mp.parse_note("a.md", NOTE)
        self.assertEqual(mp.highlights(doc.abstract()), ["高亮短语"])


class TestTimestamps(unittest.TestCase):
    def test_url_t_param(self):
        ts = mp.find_timestamps("见 [1:23](https://www.youtube.com/watch?v=abcDEF12345&t=83s)。")
        self.assertEqual(ts, [{"video_id": "abcDEF12345", "t": 83.0}])

    def test_youtu_be(self):
        ts = mp.find_timestamps("[0:45](https://youtu.be/abcDEF12345?si=x&t=45)")
        self.assertEqual(ts, [{"video_id": "abcDEF12345", "t": 45.0}])

    def test_label_fallback(self):
        ts = mp.find_timestamps("[2:03](https://www.youtube.com/watch?v=abcDEF12345)")
        self.assertEqual(ts, [{"video_id": "abcDEF12345", "t": 123.0}])

    def test_no_time_no_record(self):
        """链接没有时间信息时不得编造时间戳。"""
        self.assertEqual(mp.find_timestamps("https://www.youtube.com/watch?v=abcDEF12345"), [])

    def test_hms(self):
        self.assertEqual(mp.hms_to_sec("1:20:04"), 4804.0)


class TestMermaid(unittest.TestCase):
    def test_flowchart(self):
        code = 'flowchart TD\n    A["概念A<br>基础"] --> B["概念B"]\n    B -->|"标签"| C\n'
        nodes, edges = mp.parse_mermaid(code)
        labels = dict(nodes)
        self.assertEqual(labels["A"], "概念A 基础")
        self.assertEqual(len(edges), 2)
        self.assertEqual((edges[0].src, edges[0].dst), ("A", "B"))
        self.assertEqual(edges[1].label, "标签")

    def test_chain_and_skip(self):
        code = "flowchart LR\n A --> B --> C\n subgraph S\n  D\n end\n"
        nodes, edges = mp.parse_mermaid(code)
        self.assertEqual([(e.src, e.dst) for e in edges],
                         [("A", "B"), ("B", "C")])


class TestMisc(unittest.TestCase):
    def test_slugify(self):
        self.assertEqual(mp.slugify("抵扣价"), "抵扣价")
        self.assertEqual(mp.slugify("MCP（Model Context Protocol）"),
                         "mcp-model-context-protocol")

    def test_strip_md_keeps_text(self):
        self.assertEqual(mp.strip_md("[[抵扣价|抵扣]]"), "抵扣")
        self.assertEqual(mp.strip_md("[[ch03]]"), "ch03")
        self.assertIn("要点", mp.strip_md("[要点](https://x.com)"))

    def test_wikilink_target_with_anchor(self):
        doc = mp.parse_note("a.md", "## S\n- [[目标#小节]] 与 [[目标二|显示]]\n")
        targets = [t for _s, t in doc.wikilinks()]
        self.assertEqual(targets, ["目标", "目标二"])


if __name__ == "__main__":
    unittest.main()
