# -*- coding: utf-8 -*-
"""manifest（learning.manifest/0.1）测试：字段齐全并通过 schema；
无主页时 about/route 为 null；无绝对路径；分组与 concept.group 一致。"""
import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "tools" / "learning"))

import notes_compile  # noqa: E402

DEMO = REPO / "samples" / "learn" / "demo-topic"
NOW = "2026-11-07T00:00:00+00:00"

# schemas/record 的 manifest schema 尚未允许 importanceHint 为 null
# （已知契约缺口，见 tools/learning/HANDOFF.md）；本测试只放行这一类
# 错误，其余 schema 违规视为失败。


def _is_known_gap(error) -> bool:
    path = list(error.absolute_path)
    return (len(path) == 3 and path[0] == "concepts"
            and path[2] == "importanceHint"
            and "None is not one of" in error.message)


class ManifestTests(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="manifest-test-"))
        self.topic = self.tmp / "demo-topic"
        shutil.copytree(DEMO, self.topic)
        self.out = self.tmp / "out"

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def compile(self, *extra):
        rc = notes_compile.main([str(self.topic), "--out", str(self.out),
                                 "--extractor", "annotated", "--now", NOW,
                                 *extra])
        self.assertEqual(rc, 0, "编译应成功")
        return json.loads(
            (self.out / "demo-topic.manifest.json").read_text(encoding="utf-8"))

    def test_fields_complete_and_schema_valid(self):
        m = self.compile()
        for key in ("schema", "topic", "contentHash", "compilerVersion",
                    "generatedAt", "folderHint", "identity", "counts",
                    "source", "concepts", "groups", "procedures", "route"):
            self.assertIn(key, m, "manifest 缺字段 %s" % key)
        self.assertEqual(m["schema"], "learning.manifest/0.1")
        self.assertEqual(m["topic"]["id"], "demo-topic")
        self.assertEqual(m["topic"]["idOrigin"], "dir-slug")
        self.assertTrue(m["contentHash"].startswith("sha1:"))
        self.assertEqual(m["counts"], {"chapters": 3, "concepts": 6,
                                       "procedures": 1})
        self.assertEqual(m["source"]["title"], "演示视频一（虚构）")
        self.assertEqual(m["source"]["author"], "演示作者")
        self.assertEqual(m["source"]["duration"], 630)

        try:
            from jsonschema import Draft202012Validator
        except ImportError:
            self.skipTest("optional jsonschema is not installed")
        schema = json.loads(
            (REPO / "schemas" / "record" / "manifest.schema.json")
            .read_text(encoding="utf-8"))
        errors = [e for e in Draft202012Validator(schema).iter_errors(m)
                  if not _is_known_gap(e)]
        self.assertEqual(errors, [],
                         "除 importanceHint-null 已知缺口外应通过 schema：%r"
                         % [str(e) for e in errors])

    def test_no_absolute_paths(self):
        self.compile()
        learn_text = (self.out / "demo-topic.learn.json").read_text(
            encoding="utf-8")
        manifest_text = (self.out / "demo-topic.manifest.json").read_text(
            encoding="utf-8")
        for text in (learn_text, manifest_text):
            self.assertNotIn(str(self.tmp), text, "不得泄露本机绝对路径")
            self.assertNotIn("\\\\", text.replace("\\\\n", ""),
                             "不得出现盘符反斜杠路径")
        doc = json.loads(learn_text)
        self.assertEqual(doc["topic"]["generated"]["notes_dir"],
                         self.topic.name, "notes_dir 只放目录名")
        m = json.loads(manifest_text)
        self.assertEqual(m["folderHint"], self.tmp.name,
                         "folderHint 是主题目录的上级目录名")

    def test_about_and_route_null_without_home(self):
        (self.topic / "演示主题 · 学习主页.md").unlink()
        m = self.compile()
        self.assertIsNone(m["identity"]["about"], "无主页时 about 为 null")
        self.assertIsNone(m["identity"]["route"], "无主页时 route 为 null")
        self.assertIn("章", m["identity"]["what"])
        self.assertIsInstance(m["route"], list, "建议路线数组仍给出")

    def test_groups_match_concept_group(self):
        m = self.compile()
        doc = json.loads(
            (self.out / "demo-topic.learn.json").read_text(encoding="utf-8"))
        by_group = {}
        for c in doc["concepts"]:
            if c.get("group"):
                by_group.setdefault(c["group"], []).append(c["id"])
        self.assertEqual({g["name"]: g["conceptIds"] for g in m["groups"]},
                         by_group, "manifest 分组与 concept.group 一致")
        # 没有分组的概念 group 为 null
        grouped = {cid for cids in by_group.values() for cid in cids}
        for c in m["concepts"]:
            if c["id"] not in grouped:
                self.assertIsNone(c["group"])

    def test_importance_only_with_evidence(self):
        m = self.compile()
        by_id = {c["id"]: c for c in m["concepts"]}
        # 概念a / concept-b 出现在主页全景图，有依据
        for cid in ("概念a", "concept-b"):
            self.assertEqual(by_id[cid]["importanceHint"], 1)
            self.assertEqual(by_id[cid]["importanceFactors"],
                             ["出现在学习主页全景图"])
        # 无定义 / 损坏卡片 没有任何依据
        for cid in ("无定义", "损坏卡片"):
            self.assertIsNone(by_id[cid]["importanceHint"],
                              "没有依据就 null，不编分数")
            self.assertEqual(by_id[cid]["importanceFactors"], [])

    def test_procedures_items_have_stable_ids(self):
        m = self.compile()
        proc = m["procedures"][0]
        self.assertEqual(proc["title"], "环境搭建清单")
        self.assertEqual(len(proc["items"]), 4)
        for it in proc["items"]:
            self.assertRegex(it["id"], r"^t[0-9a-f]{8}")
            self.assertTrue(it["text"])

    def test_route_starts_with_staged_chapter(self):
        m = self.compile()
        self.assertEqual(m["route"][0], "概念a",
                         "建议路线先走学习路线里的第一章")


if __name__ == "__main__":
    unittest.main()
