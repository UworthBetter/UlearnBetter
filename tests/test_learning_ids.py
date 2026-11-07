# -*- coding: utf-8 -*-
"""稳定 ID 规则测试：改标题 ID 不变；表格 / 列表重排块 ID 不变；
移动笔记且标题相同 → 继承并报告；两个候选同名 → 不继承、报告冲突；
主题目录改名后同一输出目录 ID 不变；实操项 ID 稳定。"""
import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "tools" / "learning"))

import notes_compile  # noqa: E402

NOW = "2026-11-07T00:00:00+00:00"

CONCEPT = """---
title: {title}
tags:
  - 类型/概念卡
---

# {title}

> [!abstract] 一句话定义
> {title} 的演示定义。

## 📌 是什么

- 要点一：内容。

## ⚖️ 对比

| 对象 | 速度 |
| --- | --- |
| {row1} | 快 |
| {row2} | 慢 |

## 🔁 步骤

1. {step1}
2. {step2}
"""


def concept_text(title: str, row1="甲", row2="乙", step1="第一步", step2="第二步"):
    return CONCEPT.format(title=title, row1=row1, row2=row2,
                          step1=step1, step2=step2)


class TopicSandbox(unittest.TestCase):
    """每个用例一个临时主题目录 + 输出目录，走完整 CLI。"""

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="ids-test-"))
        self.topic = self.tmp / "t-topic"
        self.out = self.tmp / "out"

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def write(self, rel: str, text: str) -> None:
        path = self.topic / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")

    def compile(self) -> dict:
        rc = notes_compile.main([str(self.topic), "--out", str(self.out),
                                 "--extractor", "null", "--now", NOW])
        self.assertEqual(rc, 0, "编译应成功")
        return self.learn()

    def learn(self) -> dict:
        path = next(self.out.glob("*.learn.json"))
        return json.loads(path.read_text(encoding="utf-8"))

    def report(self) -> dict:
        return json.loads(
            (self.out / "t-topic.report.json").read_text(encoding="utf-8"))


class TestConceptIds(TopicSandbox):

    def test_title_change_keeps_id(self):
        self.write("02-概念卡/甲.md", concept_text("甲概念"))
        doc = self.compile()
        cid = doc["concepts"][0]["id"]
        self.assertEqual(cid, "甲概念")
        self.assertEqual(doc["concepts"][0]["id_origin"], "title-slug")

        self.write("02-概念卡/甲.md", concept_text("甲概念改名"))
        doc2 = self.compile()
        self.assertEqual(doc2["concepts"][0]["id"], cid,
                         "改标题、不改路径时 ID 不变")
        self.assertEqual(doc2["concepts"][0]["id_origin"], "id-map")

    def test_table_row_reorder_keeps_block_id(self):
        self.write("02-概念卡/甲.md", concept_text("甲概念", row1="甲", row2="乙"))
        before = self.compile()
        bid = [b["id"] for b in before["concepts"][0]["blocks"]
               if b["shape"] == "comparison"][0]

        self.write("02-概念卡/甲.md", concept_text("甲概念", row1="乙", row2="甲"))
        after = self.compile()
        bid2 = [b["id"] for b in after["concepts"][0]["blocks"]
                if b["shape"] == "comparison"][0]
        self.assertEqual(bid, bid2, "表格行重排后块 ID 不变")

    def test_list_reorder_keeps_block_id(self):
        self.write("02-概念卡/甲.md", concept_text("甲概念", step1="第一步", step2="第二步"))
        before = self.compile()
        bid = [b["id"] for b in before["concepts"][0]["blocks"]
               if b["shape"] == "process"][0]

        self.write("02-概念卡/甲.md", concept_text("甲概念", step1="第二步", step2="第一步"))
        after = self.compile()
        bid2 = [b["id"] for b in after["concepts"][0]["blocks"]
                if b["shape"] == "process"][0]
        self.assertEqual(bid, bid2, "列表步骤重排后块 ID 不变")

    def test_unrelated_section_change_keeps_block_id(self):
        self.write("02-概念卡/甲.md", concept_text("甲概念"))
        before = self.compile()
        bids_before = {b["id"] for b in before["concepts"][0]["blocks"]}

        text = concept_text("甲概念") + "\n## 📎 附记\n\n- 无关新增段落。\n"
        self.write("02-概念卡/甲.md", text)
        after = self.compile()
        bids_after = {b["id"] for b in after["concepts"][0]["blocks"]}
        self.assertTrue(bids_before <= bids_after, "无关段落增删不改变既有块 ID")

    def test_moved_note_inherits_id(self):
        self.write("02-概念卡/旧位置.md", concept_text("可移动概念"))
        before = self.compile()
        cid = before["concepts"][0]["id"]

        (self.topic / "02-概念卡" / "旧位置.md").rename(
            self.topic / "02-概念卡" / "新位置.md")
        after = self.compile()
        self.assertEqual(after["concepts"][0]["id"], cid,
                         "路径消失且标题相同时继承原 ID")
        self.assertEqual(after["concepts"][0]["id_origin"], "inherited")
        kinds = {i["kind"] for i in self.report()["issues"]}
        self.assertIn("id_inherited", kinds, "继承要写进报告")

    def test_two_same_name_candidates_do_not_inherit(self):
        self.write("02-概念卡/唯一.md", concept_text("重名概念"))
        self.compile()

        (self.topic / "02-概念卡" / "唯一.md").unlink()
        self.write("02-概念卡/候选一.md", concept_text("重名概念"))
        self.write("02-概念卡/候选二.md", concept_text("重名概念"))
        after = self.compile()
        # 不继承：两个候选的新笔记都是新 slug（其中一个恰与旧 ID 同值
        # 也只是巧合，id_origin 必须仍是 title-slug，不是 inherited）
        self.assertEqual(len(after["concepts"]), 2)
        for c in after["concepts"]:
            self.assertEqual(c["id_origin"], "title-slug",
                             "两个候选同名时不继承")
        kinds = {i["kind"] for i in self.report()["issues"]}
        self.assertIn("concept_id_inherit_conflict", kinds, "冲突要写进报告")


class TestTopicAndProcIds(TopicSandbox):

    def test_topic_dir_rename_keeps_id_in_same_out(self):
        self.write("02-概念卡/甲.md", concept_text("甲概念"))
        self.compile()
        self.assertTrue((self.out / "t-topic.learn.json").exists())

        renamed = self.tmp / "t-renamed"
        self.topic.rename(renamed)
        self.topic = renamed
        rc = notes_compile.main([str(renamed), "--out", str(self.out),
                                 "--extractor", "null", "--now", NOW])
        self.assertEqual(rc, 0)
        self.assertTrue((self.out / "t-topic.learn.json").exists(),
                        "同一输出目录下改目录名后主题 ID 不变")
        self.assertFalse((self.out / "t-renamed.learn.json").exists())
        id_map = json.loads(
            (self.out / "learn-ids.json").read_text(encoding="utf-8"))
        self.assertEqual(id_map["topicId"], "t-topic")

    def test_procitem_ids_stable_across_reorder(self):
        self.write("02-概念卡/甲.md", concept_text("甲概念"))
        self.write("03-实操清单/清单.md",
                   "---\ntitle: 演示清单\ntags:\n  - 类型/实操\n---\n\n"
                   "# 演示清单\n\n"
                   "## 步骤\n\n"
                   "- [ ] 勾选甲\n- [ ] 勾选乙\n- [ ] 勾选丙\n")
        before = self.compile()
        items_before = [(it["id"], it["text"])
                        for g in before["procedures"][0]["groups"]
                        for it in g["items"]]
        self.assertEqual(len(items_before), 3)

        self.write("03-实操清单/清单.md",
                   "---\ntitle: 演示清单\ntags:\n  - 类型/实操\n---\n\n"
                   "# 演示清单\n\n"
                   "## 步骤\n\n"
                   "- [ ] 勾选丙\n- [ ] 勾选甲\n- [ ] 勾选乙\n")
        after = self.compile()
        items_after = {(it["id"], it["text"])
                       for g in after["procedures"][0]["groups"]
                       for it in g["items"]}
        self.assertEqual(set(items_before), items_after,
                         "清单项重排后 ID 与文本的对应不变")

    def test_frontmatter_topic_id_wins(self):
        self.write("02-概念卡/甲.md", concept_text("甲概念"))
        self.write("演示 · 学习主页.md",
                   "---\ntitle: 学习主页\ntags:\n  - MOC\ntopic_id: 自定义主题\n---\n\n"
                   "# 学习主页\n")
        self.compile()
        self.assertTrue((self.out / "自定义主题.learn.json").exists(),
                        "frontmatter topic_id 优先于目录名")
        manifest = json.loads(
            (self.out / "自定义主题.manifest.json").read_text(encoding="utf-8"))
        self.assertEqual(manifest["topic"]["id"], "自定义主题")
        self.assertEqual(manifest["topic"]["idOrigin"], "frontmatter")


if __name__ == "__main__":
    unittest.main()
