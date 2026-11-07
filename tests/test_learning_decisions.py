# -*- coding: utf-8 -*-
"""修正落空报告（--decisions）测试：applied / orphaned / inherited；
重新编译两次结论不变；原笔记文件哈希不变；不修改 learn.json 内容。"""
import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "tools" / "learning"))

import notes_compile  # noqa: E402
from topic import sha1_text  # noqa: E402

DEMO = REPO / "samples" / "learn" / "demo-topic"
NOW = "2026-11-07T00:00:00+00:00"
TOPIC = "demo-topic"


class DecisionTests(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="decisions-test-"))
        self.topic = self.tmp / "demo-topic"
        shutil.copytree(DEMO, self.topic)
        self.out = self.tmp / "out"

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def snapshot(self):
        return {p.relative_to(self.topic).as_posix():
                sha1_text(p.read_text(encoding="utf-8-sig"))
                for p in sorted(self.topic.rglob("*.md"))}

    def compile_once(self):
        rc = notes_compile.main([str(self.topic), "--out", str(self.out),
                                 "--extractor", "annotated", "--now", NOW])
        self.assertEqual(rc, 0)
        return json.loads(
            (self.out / "demo-topic.learn.json").read_text(encoding="utf-8"))

    def compile_with_decisions(self):
        rc = notes_compile.main([str(self.topic), "--out", str(self.out),
                                 "--extractor", "annotated", "--now", NOW,
                                 "--decisions", str(self.overrides)])
        self.assertEqual(rc, 0)
        report = json.loads(
            (self.out / "demo-topic.report.json").read_text(encoding="utf-8"))
        self.assertIn("decisions", report)
        return report["decisions"], json.loads(
            (self.out / "demo-topic.learn.json").read_text(encoding="utf-8"))

    def test_applied_orphaned_inherited(self):
        doc = self.compile_once()
        item_id = doc["procedures"][0]["groups"][0]["items"][0]["id"]
        # 制造变化：删掉概念C（orphaned），移动无定义（inherited）
        (self.topic / "02-概念卡" / "概念C.md").unlink()
        (self.topic / "02-概念卡" / "无定义.md").rename(
            self.topic / "02-概念卡" / "无定义新位置.md")

        self.overrides = self.tmp / "overrides.jsonl"
        entries = [
            {"id": "ov-1", "at": NOW, "op": "rename",
             "target": "concept:%s/概念a" % TOPIC,
             "value": {"label": "改名A"}, "reason": None},
            {"id": "ov-2", "at": NOW, "op": "hide",
             "target": "concept:%s/概念c" % TOPIC,
             "value": {"hidden": True}, "reason": None},
            {"id": "ov-3", "at": NOW, "op": "rename",
             "target": "concept:%s/无定义" % TOPIC,
             "value": {"label": "改名无定义"}, "reason": None},
            {"id": "ov-4", "at": NOW, "op": "reassign",
             "target": "topic:%s" % TOPIC,
             "value": {"goalIds": ["g-1"]}, "reason": None},
            {"id": "ov-5", "at": NOW, "op": "pin_importance",
             "target": "procitem:%s/proc.环境搭建清单/%s" % (TOPIC, item_id),
             "value": {"level": 2}, "reason": None},
            {"id": "ov-6", "at": NOW, "op": "pin_importance",
             "target": "procitem:%s/proc.环境搭建清单/t00000000" % TOPIC,
             "value": {"level": 3}, "reason": None},
            {"id": "ov-7", "at": NOW, "op": "confirm_relation",
             "target": "relation:%s/概念a~concept-b" % TOPIC,
             "value": {"a": "concept:%s/概念a" % TOPIC,
                       "b": "concept:%s/concept-b" % TOPIC,
                       "kind": "related"}, "reason": None},
            {"id": "ov-8", "at": NOW, "op": "rename",
             "target": "concept:其它主题/某概念",
             "value": {"label": "x"}, "reason": None},
        ]
        self.overrides.write_text(
            "\n".join(json.dumps(e, ensure_ascii=False) for e in entries),
            encoding="utf-8")

        before_hash = self.snapshot()
        section, doc2 = self.compile_with_decisions()

        by_id = {e["overrideId"]: e for e in section["entries"]}
        self.assertEqual(by_id["ov-1"]["status"], "applied")
        self.assertEqual(by_id["ov-1"]["lastKnownLabel"], "概念A")
        self.assertEqual(by_id["ov-2"]["status"], "orphaned")
        self.assertEqual(by_id["ov-2"]["lastKnownLabel"], "概念C",
                         "orphaned 附最后已知标签")
        self.assertEqual(by_id["ov-3"]["status"], "inherited",
                         "ID 被继承的修正算 inherited")
        self.assertEqual(by_id["ov-4"]["status"], "applied")
        self.assertEqual(by_id["ov-5"]["status"], "applied")
        self.assertEqual(by_id["ov-6"]["status"], "orphaned")
        self.assertEqual(by_id["ov-7"]["status"], "applied")
        self.assertEqual(section["skippedOtherTopic"], 1)
        self.assertEqual(section["statuses"],
                         {"applied": 4, "orphaned": 2, "inherited": 1})

        # learn.json 不被 --decisions 修改：改名值不出现在产物里
        self.assertNotIn("改名A", json.dumps(doc2, ensure_ascii=False))
        label = {c["id"]: c["label"] for c in doc2["concepts"]}["概念a"]
        self.assertEqual(label, "概念A")

        # 原笔记文件哈希不变
        self.assertEqual(self.snapshot(), before_hash,
                         "--decisions 只读，不得写回输入笔记")

    def test_repeated_run_same_conclusion(self):
        doc = self.compile_once()
        item_id = doc["procedures"][0]["groups"][0]["items"][0]["id"]
        (self.topic / "02-概念卡" / "概念C.md").unlink()
        self.overrides = self.tmp / "overrides.jsonl"
        self.overrides.write_text(json.dumps({
            "id": "ov-x", "at": NOW, "op": "hide",
            "target": "concept:%s/概念c" % TOPIC,
            "value": {"hidden": True}, "reason": None}, ensure_ascii=False),
            encoding="utf-8")

        first, _ = self.compile_with_decisions()
        second, _ = self.compile_with_decisions()
        self.assertEqual(first, second, "重新编译两次结论不变")


if __name__ == "__main__":
    unittest.main()
