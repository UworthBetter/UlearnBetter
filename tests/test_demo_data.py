# -*- coding: utf-8 -*-
"""预置演示数据（samples/demo）的一致性与来源检查，以及生成工具的纯函数测试。

不调用模型、不联网：
- 编译产物必须能由仓库里的笔记用项目编译器逐字复现；
- 笔记无断链，时间戳链接只指向本主题的视频且不越过时长；
- 生成日志标明真实模型（mock=false），记录里的引用都能在编译产物里找到；
- 数据与工具里没有 API key / 凭据，ingest 元数据不含字幕正文。
"""
import json
import os
import re
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from jsonschema import Draft202012Validator, FormatChecker
from referencing import Registry, Resource

ROOT = Path(__file__).resolve().parents[1]
DEMO = ROOT / "samples" / "demo"
sys.path.insert(0, str(ROOT / "tools" / "demo"))
import notes_from_ingest as nfi  # noqa: E402
import compile_demo  # noqa: E402

TOPICS = json.loads((ROOT / "tools/demo/topics.json").read_text(encoding="utf-8"))["topics"]
SHAPES = {"definition", "structure", "process", "comparison", "variation", "procedure"}


def read_json(p: Path):
    return json.loads(p.read_text(encoding="utf-8"))


def read_jsonl(p: Path):
    return [json.loads(line) for line in p.read_text(encoding="utf-8").splitlines() if line.strip()]


class DemoCompiledData(unittest.TestCase):
    def test_compile_reproduces_committed_learn_and_manifest(self):
        for t in TOPICS:
            with self.subTest(topic=t["id"]), tempfile.TemporaryDirectory() as tmp:
                res = compile_demo.compile_topic(t, Path(tmp))
                self.assertEqual(res.returncode, 0, res.stderr)
                for name in ("learn", "manifest"):
                    fresh = read_json(Path(tmp) / f"{t['id']}.{name}.json")
                    committed = read_json(DEMO / "learn" / t["id"] / f"{name}.json")
                    self.assertEqual(fresh, committed, f"{t['id']} {name}.json 与笔记编译结果不一致")

    def test_schemas_and_topic_metadata(self):
        schemas = {p.name: read_json(p) for p in (ROOT / "schemas/record").glob("*.json")}
        registry = Registry().with_resources((n, Resource.from_contents(v)) for n, v in schemas.items())
        learn_schema = Draft202012Validator(read_json(ROOT / "schemas/learning/learn.schema.json"))
        manifest_schema = Draft202012Validator(schemas["manifest.schema.json"], registry=registry,
                                               format_checker=FormatChecker())
        for t in TOPICS:
            with self.subTest(topic=t["id"]):
                learn = read_json(DEMO / "learn" / t["id"] / "learn.json")
                manifest = read_json(DEMO / "learn" / t["id"] / "manifest.json")
                learn_schema.validate(learn)
                manifest_schema.validate(manifest)
                self.assertEqual(manifest["topic"]["id"], t["id"])
                self.assertEqual(manifest["topic"]["title"], t["name"])
                self.assertEqual(manifest["folderHint"], t["folder"])
                self.assertTrue(manifest["identity"]["about"])
                self.assertNotIn("==", manifest["identity"]["about"])
                self.assertEqual([s["ref"] for s in learn["sources"]], t["videos"])
                self.assertTrue(all(s["title"] for s in learn["sources"]))

    def test_six_card_shapes_are_covered(self):
        seen = set()
        for t in TOPICS:
            learn = read_json(DEMO / "learn" / t["id"] / "learn.json")
            for c in learn["concepts"]:
                seen.update(b["shape"] for b in c["blocks"])
            for p in learn["procedures"]:
                seen.add(p.get("shape", "procedure"))
        self.assertEqual(seen, SHAPES)
        for t in TOPICS:
            learn = read_json(DEMO / "learn" / t["id"] / "learn.json")
            for c in learn["concepts"]:
                for b in c["blocks"]:
                    if b["shape"] == "variation":
                        self.assertEqual(b["grounding"], "illustrative")
                        self.assertIsNone(nfi.check_variation(dict(b)))


class DemoNotes(unittest.TestCase):
    def test_notes_have_no_broken_wikilinks(self):
        for t in TOPICS:
            with self.subTest(topic=t["id"]):
                self.assertEqual(nfi.count_broken(DEMO / "notes" / t["folder"] / t["name"]), 0)

    def test_timestamp_links_point_to_topic_videos_within_duration(self):
        for t in TOPICS:
            durations = {}
            for vid in t["videos"]:
                meta = read_json(DEMO / "ingest" / f"yt_{vid}.json")
                durations[vid] = meta["duration_sec"]
            for p in (DEMO / "notes" / t["folder"] / t["name"]).rglob("*.md"):
                for m in nfi.YT_LINK.finditer(p.read_text(encoding="utf-8")):
                    with self.subTest(note=p.name, url=m.group(0)):
                        self.assertIn(m.group(1), durations)
                        if m.group(2):
                            self.assertLessEqual(int(m.group(2)), durations[m.group(1)])

    def test_generation_logs_record_real_model_runs(self):
        for t in TOPICS:
            with self.subTest(topic=t["id"]):
                log = read_json(DEMO / "notes" / t["folder"] / f"{t['name']}.generation.json")
                self.assertIs(log["mock"], False)
                self.assertTrue(log["model"])
                self.assertGreater(log["usage"]["calls"], 0)
                self.assertTrue(all(c.get("requestId") for c in log["calls"]))
                self.assertEqual(log["brokenLinksAfterRepair"], 0)
                self.assertEqual([v["videoId"] for v in log["videos"]], t["videos"])
                self.assertTrue(all(v["transcriptSource"] for v in log["videos"]))

    def test_ingest_metadata_has_no_transcript_text(self):
        for p in (DEMO / "ingest").glob("*.json"):
            with self.subTest(file=p.name):
                d = read_json(p)
                self.assertTrue(d["chapters"])
                self.assertNotIn("segments", d.get("transcript") or {})
                self.assertNotIn("text", d.get("transcript") or {})


class DemoRecord(unittest.TestCase):
    def test_record_references_exist_in_compiled_topics(self):
        concepts, procitems = set(), set()
        for t in TOPICS:
            m = read_json(DEMO / "learn" / t["id"] / "manifest.json")
            concepts.update("concept:%s/%s" % (t["id"], c["id"]) for c in m["concepts"])
            procitems.update("procitem:%s/%s/%s" % (t["id"], p["id"], i["id"]) for p in m["procedures"] for i in p["items"])
        schema = Draft202012Validator(read_json(ROOT / "schemas/record/event.schema.json"), format_checker=FormatChecker())
        events = read_jsonl(DEMO / "record/events.jsonl")
        self.assertGreater(len(events), 100)
        self.assertEqual(len({e["id"] for e in events}), len(events))
        for e in events:
            schema.validate(e)
            target = procitems if e["kind"] == "checklist" else concepts
            self.assertIn(e["subject"], target)
        for o in read_jsonl(DEMO / "record/overrides.jsonl"):
            if o["op"] == "attach_idea":
                self.assertIn(o["value"]["conceptRef"], concepts)
        kinds = {e["kind"] for e in events}
        self.assertEqual(kinds, {"visit", "recall", "checklist", "reflection", "question"})

    def test_items_goals_and_meta(self):
        meta = read_json(DEMO / "record/demo-meta.json")
        goals = read_json(DEMO / "record/goals.json")
        items = read_json(DEMO / "record/items.json")
        self.assertEqual(meta["organizer"], "llm")
        self.assertEqual(sorted(meta["topics"]), sorted(t["id"] for t in TOPICS))
        self.assertEqual(len(goals), 3)
        self.assertTrue(all(g["origin"] == "proposed" and g["confirmedAt"] for g in goals))
        rows = items if isinstance(items, list) else items.get("items", [])
        kinds = sorted(i["kind"] for i in rows)
        self.assertEqual(kinds.count("notes"), 3)
        self.assertGreaterEqual(kinds.count("idea"), 3)
        self.assertEqual(kinds.count("video"), 1)
        assignments = read_json(DEMO / "record/assignments.json")["assignments"]
        llm = [a for a in assignments if a["by"]["name"] == "llm"]
        self.assertTrue(llm)
        self.assertTrue(all(a["by"]["mock"] is False and a["by"]["model"] for a in llm))


CREDENTIAL_PATTERNS = [
    re.compile(r"\b[0-9a-f]{32}\.[A-Za-z0-9]{16}\b"),        # 智谱 / bigmodel 风格的 key
    re.compile(r"\bsk-[A-Za-z0-9_-]{20,}"),                    # OpenAI / Anthropic 风格
    re.compile(r"\bAIza[0-9A-Za-z_-]{30,}"),                  # Google
    re.compile(r"\bgsk_[A-Za-z0-9]{20,}"),                    # Groq
    re.compile(r"Bearer\s+[A-Za-z0-9._-]{16,}"),
    re.compile(r"(?i)(api[_-]?key|secret|password|token)\"?\s*[:=]\s*\"[^\"\s]{12,}\""),
]


class DemoSecrets(unittest.TestCase):
    def scanned_files(self):
        for base in (DEMO, ROOT / "tools/demo"):
            for p in base.rglob("*"):
                if p.is_file() and p.suffix in (".json", ".jsonl", ".md", ".py", ".mjs"):
                    yield p

    def test_no_credentials_in_demo_data_or_tools(self):
        env_key = None
        env_file = ROOT / "server/.env"
        if env_file.exists():
            for line in env_file.read_text(encoding="utf-8").splitlines():
                if re.match(r"\s*(ASSISTANT_API_KEY|[A-Z]+_API_KEY)\s*=", line):
                    env_key = line.split("=", 1)[1].strip().strip("'\"") or env_key
        for p in self.scanned_files():
            text = p.read_text(encoding="utf-8", errors="replace")
            with self.subTest(file=str(p.relative_to(ROOT))):
                for pat in CREDENTIAL_PATTERNS:
                    self.assertIsNone(pat.search(text), pat.pattern)
                if env_key and len(env_key) >= 12:
                    self.assertNotIn(env_key, text)

    def test_demo_data_paths_are_tracked_but_env_stays_ignored(self):
        def ignored(path):
            return subprocess.run(["git", "check-ignore", "-q", path], cwd=ROOT).returncode == 0
        self.assertTrue(ignored("server/.env"))
        self.assertTrue(ignored("server/.data/demo/record/events.jsonl"))
        self.assertTrue(ignored("ingest/yt_x.json"))
        for p in ("samples/demo/record/events.jsonl", "samples/demo/notes/x/y.md", "samples/demo/ingest/yt_x.json"):
            self.assertFalse(ignored(p), p)


class NotesToolHelpers(unittest.TestCase):
    def test_model_config_requires_real_configuration(self):
        with self.assertRaises(nfi.ModelError) as ctx:
            nfi.model_config({})
        self.assertIn("ASSISTANT_API_KEY", str(ctx.exception))
        cfg = nfi.model_config({"ASSISTANT_PROVIDER": "openai-compatible", "ASSISTANT_BASE_URL": "https://x/v1/",
                                "ASSISTANT_MODEL": "m", "ASSISTANT_API_KEY": "k"})
        self.assertEqual(cfg["base"], "https://x/v1")

    def test_dsl_matches_frontend_whitelist(self):
        self.assertAlmostEqual(nfi.dsl_eval("1/(1+exp(-(w*x+b)))", {"w": 1, "b": 0, "x": 0}), 0.5)
        self.assertEqual(nfi.dsl_eval("2^3 + max(1, 4)", {}), 12)
        for bad in ("__import__('os')", "x.real", "foo(x)", "x ? 1 : 2"):
            with self.assertRaises((ValueError, SyntaxError)):
                nfi.dsl_eval(bad, {"x": 1})

    def test_variation_check_and_states_cleanup(self):
        block = {"shape": "variation", "domain": "function",
                 "inputs": [{"name": "p", "label": "胜率", "min": 0, "max": 1, "step": 0.01, "default": 0.6}],
                 "x": {"label": "f", "range": [0, 1], "cursor": 0.2},
                 "series": [{"id": "g", "label": "增长率", "expr": "p*ln(1+x)+(1-p)*ln(1-x)"}],
                 "states": [{"when": "x > 2*p-1", "text": "超过凯利"}, {"when": "x and p", "text": "坏条件"}]}
        self.assertIsNone(nfi.check_variation(block))
        self.assertEqual(nfi.clean_states(block), 1)
        self.assertEqual(block["states"], [{"when": "x > 2*p-1", "text": "超过凯利"}])
        self.assertIn("inputs", nfi.check_variation({**block, "inputs": []}))
        self.assertIn("不合法", nfi.check_variation({**block, "series": [{"id": "g", "label": "g", "expr": "sin(x)"}]}))

    def test_link_repairs(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "02-概念卡").mkdir()
            (root / "02-概念卡" / "梯度下降.md").write_text("---\ntitle: 梯度下降\n---\n# 梯度下降\n", encoding="utf-8")
            (root / "00-Home.md").write_text(
                "**一句话总结**：==看懂神经网络==\n"
                "[[梯度 下降]] [[不存在\\|别名]] [1:00](https://www.youtube.com/watch?v=aircAruvnKt&t=60s) "
                "[9:99](https://www.youtube.com/watch?v=aircAruvnKk&t=9999s) "
                "[x](https://www.youtube.com/watch?v=zzzzzzzzzzz&t=1s)\n", encoding="utf-8")
            vfix = nfi.repair_video_links(root, [{"id": "aircAruvnKk", "duration_sec": 1120}])
            afix = nfi.normalize_home_abstract(root)
            lfix = nfi.repair_links(root)
            text = (root / "00-Home.md").read_text(encoding="utf-8")
            self.assertIn("> [!abstract] 一句话总结\n> 看懂神经网络", text)
            self.assertIn("[1:00](https://www.youtube.com/watch?v=aircAruvnKk&t=60s)", text)
            self.assertNotIn("t=9999s", text)
            self.assertNotIn("zzzzzzzzzzz", text)
            self.assertIn("[[梯度下降]]", text)
            self.assertIn("别名", text)
            self.assertNotIn("[[不存在", text)
            self.assertEqual(nfi.count_broken(root), 0)
            self.assertEqual({f["action"] for f in vfix}, {"correct", "unknown", "unlink", "unlink_out_of_range"})
            self.assertEqual(len(afix), 2)
            self.assertEqual({f["action"] for f in lfix}, {"relink", "unlink"})


if __name__ == "__main__":
    unittest.main()
