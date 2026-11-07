# -*- coding: utf-8 -*-
"""校验报告单元测试：结构/语义/出处三层与数字检查。"""
import copy
import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "tools" / "learning"))

from compiler import compile_topic  # noqa: E402
from extractors import NullExtractor  # noqa: E402
from reporting import render_markdown, validate_document  # noqa: E402
from topic import scan_topic  # noqa: E402

DEMO = REPO / "samples" / "learn" / "demo-topic"


def base_doc():
    tmp = Path(tempfile.mkdtemp(prefix="learn-val-"))
    topic = tmp / "demo-topic"
    shutil.copytree(DEMO, topic)
    idx = scan_topic(topic)
    result = compile_topic(topic, NullExtractor(), now="2026-11-07T00:00:00+00:00")
    return result.doc, idx


def kinds(issues):
    return [i["kind"] for i in issues]


class TestValidateDocument(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.doc, cls.idx = base_doc()

    def test_clean_baseline_has_no_schema_errors(self):
        bad = {"schema_missing_key", "schema_version", "duplicate_concept_id",
               "duplicate_block_id", "invalid_shape",
               "first_block_not_definition", "ev_src_missing",
               "ev_note_missing", "block_without_ev", "relation_unknown_concept",
               "prereq_generated", "cells_shape", "empty_one_liner",
               "number_not_in_evidence", "too_many_supplementary"}
        self.assertFalse(bad & set(kinds(validate_document(self.doc, self.idx))),
                         "基线产物不应有结构/语义/出处层错误")

    def _multi_block_concept(self, doc):
        for c in doc["concepts"]:
            if len(c["blocks"]) >= 2:
                return c
        self.fail("基线缺少多块概念")

    def test_duplicate_block_id(self):
        doc = copy.deepcopy(self.doc)
        c = self._multi_block_concept(doc)
        c["blocks"][1]["id"] = c["blocks"][0]["id"]
        self.assertIn("duplicate_block_id", kinds(validate_document(doc, self.idx)))

    def test_first_block_not_definition(self):
        doc = copy.deepcopy(self.doc)
        c = self._multi_block_concept(doc)
        c["blocks"] = c["blocks"][::-1]
        self.assertIn("first_block_not_definition", kinds(validate_document(doc, self.idx)))

    def test_ev_src_missing(self):
        doc = copy.deepcopy(self.doc)
        doc["concepts"][0]["blocks"][0]["ev"].append({"src": "v999", "t": 1})
        self.assertIn("ev_src_missing", kinds(validate_document(doc, self.idx)))

    def test_ev_note_missing(self):
        doc = copy.deepcopy(self.doc)
        doc["concepts"][0]["blocks"][0]["ev"].append({"note": "不存在.md"})
        self.assertIn("ev_note_missing", kinds(validate_document(doc, self.idx)))

    def test_prereq_forbidden(self):
        doc = copy.deepcopy(self.doc)
        a = doc["concepts"][0]["id"]
        b = doc["concepts"][1]["id"]
        doc["relations"].append({"a": a, "b": b, "kind": "prereq",
                                 "ev": [{"note": doc["concepts"][0]["note"]}]})
        self.assertIn("prereq_generated", kinds(validate_document(doc, self.idx)))

    def test_relation_unknown_concept(self):
        doc = copy.deepcopy(self.doc)
        doc["relations"].append({"a": "幽灵", "b": "更幽灵", "kind": "related",
                                 "ev": [{"note": doc["concepts"][0]["note"]}]})
        self.assertIn("relation_unknown_concept", kinds(validate_document(doc, self.idx)))

    def test_number_not_in_evidence(self):
        doc = copy.deepcopy(self.doc)
        pts = doc["concepts"][0]["blocks"][0]["points"]
        if not pts:  # 概念A 一定有要点
            self.fail("基线概念缺少要点")
        pts[0]["text"] = pts[0]["text"] + "编造数字 987654"
        self.assertIn("number_not_in_evidence",
                      kinds(validate_document(doc, self.idx)))

    def test_cells_shape_mismatch(self):
        doc = copy.deepcopy(self.doc)
        for c in doc["concepts"]:
            for b in c["blocks"]:
                if b["shape"] == "comparison":
                    b["cells"][0].pop()
                    self.assertIn("cells_shape",
                                  kinds(validate_document(doc, self.idx)))
                    return
        self.fail("基线缺少 comparison 块")

    def test_block_without_ev(self):
        doc = copy.deepcopy(self.doc)
        doc["concepts"][0]["blocks"][0]["ev"] = []
        self.assertIn("block_without_ev", kinds(validate_document(doc, self.idx)))


class TestMarkdownReport(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.doc, cls.idx = base_doc()

    def test_render(self):
        from reporting import build_report
        report = build_report(self.doc, self.idx, [], {"topics": {}}, [])
        md = render_markdown(report)
        self.assertIn("学习内容编译报告", md)
        self.assertIn("已知限制", md)
        self.assertIn("问题清单", md)
        # 数字统计与 JSON 一致
        self.assertIn("概念：%d 个" % report["stats"]["concepts"], md)


class TestJsonSerializable(unittest.TestCase):
    def test_doc_roundtrip(self):
        doc, _ = base_doc()
        text = json.dumps(doc, ensure_ascii=False)
        loaded = json.loads(text)
        self.assertEqual(loaded["schema"], "learning.learn/0.1")
        self.assertEqual(loaded["concepts"], doc["concepts"])


class TestAgainstJsonSchema(unittest.TestCase):
    """jsonschema 已安装时，产物必须通过 schemas/learning/learn.schema.json。"""

    def test_demo_doc_valid(self):
        try:
            import jsonschema
        except ImportError:
            self.skipTest("jsonschema 未安装（可选依赖）")
        doc, _ = base_doc()
        schema = json.loads(
            (REPO / "schemas" / "learning" / "learn.schema.json")
            .read_text(encoding="utf-8"))
        errors = list(jsonschema.Draft7Validator(schema).iter_errors(doc))
        self.assertEqual(errors, [])


if __name__ == "__main__":
    unittest.main()
