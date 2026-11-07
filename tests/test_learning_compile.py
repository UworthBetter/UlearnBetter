# -*- coding: utf-8 -*-
"""端到端编译测试：六类块、稳定 ID、增量缓存、只读保证、边界情况。"""
import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "tools" / "learning"))

import notes_compile  # noqa: E402
from compiler import compile_topic  # noqa: E402
from extractors import NullExtractor, load_extractor  # noqa: E402
from topic import sha1_text  # noqa: E402

DEMO = REPO / "samples" / "learn" / "demo-topic"
NOW = "2026-11-07T00:00:00+00:00"


def fresh_topic():
    tmp = Path(tempfile.mkdtemp(prefix="learn-demo-"))
    dst = tmp / "demo-topic"
    shutil.copytree(DEMO, dst)
    return dst


def run(topic: Path, out: Path, extractor="annotated"):
    rc = notes_compile.main([str(topic), "--out", str(out),
                             "--extractor", extractor, "--now", NOW])
    assert rc == 0, "编译应成功"
    doc = json.loads((out / "demo-topic.learn.json").read_text(encoding="utf-8"))
    rep = json.loads((out / "demo-topic.report.json").read_text(encoding="utf-8"))
    return doc, rep


class TestSixShapes(unittest.TestCase):
    def setUp(self):
        self.topic = fresh_topic()
        self.out = Path(tempfile.mkdtemp(prefix="learn-out-"))
        self.doc, self.rep = run(self.topic, self.out)

    def test_all_shapes_present(self):
        shapes = self.rep["stats"]["blocks_by_shape"]
        for shape in ("definition", "structure", "process",
                      "comparison", "variation", "procedure"):
            self.assertGreaterEqual(shapes[shape], 1, "缺少 %s 块" % shape)

    def test_first_block_is_definition(self):
        for c in self.doc["concepts"]:
            self.assertEqual(c["blocks"][0]["shape"], "definition")

    def test_stable_id_and_aliases(self):
        cb = self._by_id("concept-b")
        self.assertEqual(cb["id_origin"], "frontmatter")
        self.assertIn("B别名", cb["aliases"])

    def test_one_liner_and_key(self):
        ca = self._by_id("概念a")
        self.assertIn("两个数的比较", ca["one_liner"])
        self.assertEqual(ca["key"], "两个数的比较")

    def _by_id(self, cid):
        return {c["id"]: c for c in self.doc["concepts"]}[cid]


class TestProvenanceAndSources(unittest.TestCase):
    def setUp(self):
        self.topic = fresh_topic()
        self.out = Path(tempfile.mkdtemp(prefix="learn-out-"))
        self.doc, self.rep = run(self.topic, self.out)

    def test_multi_source(self):
        srcs = {s["id"]: s for s in self.doc["sources"]}
        self.assertEqual(len(srcs), 2)
        with_meta = [s for s in srcs.values() if s["title"]]
        self.assertEqual(len(with_meta), 1)
        self.assertEqual(with_meta[0]["duration_sec"], 630)
        self.assertEqual(with_meta[0]["ref"], "demo000001")

    def test_timestamps_only_from_links(self):
        cb = self._by_id("concept-b")
        ts = [ev for b in cb["blocks"] for ev in b.get("ev", [])
              if "t" in ev]
        pts = [ev for b in cb["blocks"] for p in b.get("points", [])
               for ev in p.get("ev", []) if "t" in ev]
        self.assertTrue(all(ev["t"] in (5.0, 12.0) for ev in ts + pts))

    def test_grounding_note_and_no_video_fabrication(self):
        for c in self.doc["concepts"]:
            for b in c["blocks"]:
                if b["shape"] != "variation":
                    self.assertEqual(b["grounding"], "note")
        self.assertEqual(self.doc["topic"]["generated"]["model"], None)

    def test_no_prereq_and_stages(self):
        kinds = {r["kind"] for r in self.doc["relations"]}
        self.assertNotIn("prereq", kinds)
        self.assertIn("uses", kinds)
        self.assertEqual(self.doc["stages"][0]["chapters"], ["ch01 概念A"])

    def test_ev_note_paths_exist(self):
        note_paths = {p.relative_to(self.topic).as_posix()
                      for p in self.topic.rglob("*.md")}
        for c in self.doc["concepts"]:
            for b in c["blocks"]:
                for ev in b.get("ev", []):
                    if "note" in ev:
                        self.assertIn(ev["note"].split("#")[0], note_paths)

    def _by_id(self, cid):
        return {c["id"]: c for c in self.doc["concepts"]}[cid]


class TestEdgeCases(unittest.TestCase):
    def setUp(self):
        self.topic = fresh_topic()
        self.out = Path(tempfile.mkdtemp(prefix="learn-out-"))
        self.doc, self.rep = run(self.topic, self.out)

    def kinds(self):
        return [i["kind"] for i in self.rep["issues"]]

    def test_broken_wikilink_reported(self):
        self.assertIn("broken_wikilink", self.kinds())

    def test_missing_definition_fallback(self):
        self.assertIn("missing_definition", self.kinds())
        c = {x["id"]: x for x in self.doc["concepts"]}["无定义"]
        self.assertIn("正文首段", c["one_liner"])

    def test_corrupted_metadata_falls_back_to_dir(self):
        self.assertIn("corrupted_metadata", self.kinds())
        ids = {c["id"] for c in self.doc["concepts"]}
        self.assertIn("损坏卡片", ids)

    def test_same_name_notes_flagged_not_merged(self):
        self.assertIn("ambiguous_wikilink", self.kinds())
        ids = [c["id"] for c in self.doc["concepts"]]
        self.assertEqual(len(ids), len(set(ids)), "同名不得导致合并或 id 重复")

    def test_invalid_annotation_dropped(self):
        self.assertIn("injected_block_invalid", self.kinds())
        cc = {c["id"]: c for c in self.doc["concepts"]}["概念c"]
        self.assertEqual([b["shape"] for b in cc["blocks"]], ["definition"])

    def test_thinking_section_excluded_and_reported(self):
        self.assertIn("thinking_section_skipped", self.kinds())
        ca = {c["id"]: c for c in self.doc["concepts"]}["概念a"]
        blob = json.dumps(ca, ensure_ascii=False)
        self.assertNotIn("私人想法", blob)

    def test_unconverted_content_preserved(self):
        cb = {c["id"]: c for c in self.doc["concepts"]}["concept-b"]
        texts = json.dumps(cb.get("preserved", []), ensure_ascii=False)
        self.assertTrue(cb.get("preserved"), "未转换内容应按原文保留")
        self.assertIn("配置样例", texts, "小节原文应保留")


class TestIncrementalCache(unittest.TestCase):
    def setUp(self):
        self.topic = fresh_topic()
        self.out = Path(tempfile.mkdtemp(prefix="learn-out-"))

    def test_repeat_run_identical_and_reused(self):
        doc1, rep1 = run(self.topic, self.out)
        raw1 = (self.out / "demo-topic.learn.json").read_text(encoding="utf-8")
        doc2, rep2 = run(self.topic, self.out)
        raw2 = (self.out / "demo-topic.learn.json").read_text(encoding="utf-8")
        self.assertEqual(raw1, raw2, "同输入两次编译应字节一致")
        self.assertEqual(rep2["stats"]["cache_reused_concepts"],
                         rep2["stats"]["concepts"])
        self.assertEqual(rep1["stats"]["cache_reused_concepts"], 0)

    def test_referenced_material_change_rebuilds_only_dependent(self):
        run(self.topic, self.out)
        chapter = self.topic / "01-课程笔记" / "ch01 概念A.md"
        chapter.write_text(chapter.read_text(encoding="utf-8") + "\n- 新增一句引用 [[概念A]]。\n",
                           encoding="utf-8")
        doc, rep = run(self.topic, self.out)
        reused = {i.get("note") for i in rep["issues"]
                  if i["kind"] == "cache_reused"}
        self.assertNotIn("02-概念卡/概念A.md", reused, "依赖章节变化的概念应重建")
        self.assertIn("02-概念卡/概念B.md", reused, "无关概念应复用")
        ca = {c["id"]: c for c in doc["concepts"]}["概念a"]
        self.assertIn("ch01 概念A", ca["chapters"])

    def test_input_untouched(self):
        before = {p.relative_to(self.topic).as_posix():
                  sha1_text(p.read_text(encoding="utf-8-sig"))
                  for p in sorted(self.topic.rglob("*.md"))}
        run(self.topic, self.out)
        after = {p.relative_to(self.topic).as_posix():
                 sha1_text(p.read_text(encoding="utf-8-sig"))
                 for p in sorted(self.topic.rglob("*.md"))}
        self.assertEqual(before, after, "编译不得写回输入笔记")

    def test_out_inside_topic_rejected(self):
        rc = notes_compile.main([str(self.topic),
                                 "--out", str(self.topic / "learn-out")])
        self.assertEqual(rc, 1)


class TestExtractorInterface(unittest.TestCase):
    def test_null_extractor_by_default(self):
        topic = fresh_topic()
        out = Path(tempfile.mkdtemp(prefix="learn-out-"))
        doc, rep = run(topic, out, extractor="null")
        shapes = set()
        for c in doc["concepts"]:
            shapes |= {b["shape"] for b in c["blocks"]}
        self.assertNotIn("variation", shapes, "null 抽取器不应产出 variation")
        self.assertEqual(doc["topic"]["generated"]["extractor"], "null")

    def test_load_extractor_specs(self):
        self.assertIsInstance(load_extractor("null"), NullExtractor)
        with self.assertRaises(ValueError):
            load_extractor("不存在的规格")
        with self.assertRaises(ValueError):
            load_extractor("os.path:NoSuchAttr")

    def test_custom_extractor_injectable(self):
        """自定义抽取器可注入（模拟输出必须命名标记，不冒充真实模型）。"""
        topic = fresh_topic()
        out = Path(tempfile.mkdtemp(prefix="learn-out-"))
        sys.path.insert(0, str(topic))
        (topic / "_fake_extractor.py").write_text(
            "class FakeExtractor:\n"
            "    name = 'fake-llm-simulated'\n"
            "    def extract(self, note, ev_note):\n"
            "        return [{'shape': 'process', 'grounding': 'note',\n"
            "                 'title': '注入流程', 'steps': [\n"
            "                     {'label': '甲'}, {'label': '乙'}],\n"
            "                 'ev': [ev_note(note.rel_path)]}]\n",
            encoding="utf-8")
        try:
            rc = notes_compile.main([str(topic), "--out", str(out),
                                     "--extractor", "_fake_extractor:FakeExtractor",
                                     "--now", NOW])
            self.assertEqual(rc, 0)
            doc = json.loads((out / "demo-topic.learn.json").read_text(encoding="utf-8"))
            self.assertEqual(doc["topic"]["generated"]["extractor"],
                             "fake-llm-simulated")
            injected = [b for c in doc["concepts"] for b in c["blocks"]
                        if b.get("title") == "注入流程"]
            self.assertGreaterEqual(len(injected), 1)
        finally:
            sys.path.remove(str(topic))


class TestDeterminism(unittest.TestCase):
    def test_same_input_same_output_fresh_dirs(self):
        doc1, _ = run(fresh_topic(), Path(tempfile.mkdtemp(prefix="learn-a-")))
        doc2, _ = run(fresh_topic(), Path(tempfile.mkdtemp(prefix="learn-b-")))
        self.assertEqual(doc1["concepts"], doc2["concepts"])
        self.assertEqual(doc1["sources"], doc2["sources"])
        self.assertEqual(doc1["relations"], doc2["relations"])


if __name__ == "__main__":
    unittest.main()
