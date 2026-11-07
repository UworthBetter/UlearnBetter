# -*- coding: utf-8 -*-
"""Organizer 与评测工具测试：null 为空；folder 对 golden 文件；拒绝过滤；
非法注入输出被丢弃；评测工具对构造响应算出预期指标。"""
import contextlib
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "tools" / "learning"))

import organize  # noqa: E402
import organize_eval  # noqa: E402
from organizers import (FolderOrganizer, NullOrganizer, load_organizer,
                        run_organizer)  # noqa: E402

GOLDEN_DIR = REPO / "samples" / "record" / "organize"
EVAL_DIR = REPO / "samples" / "organize-eval"

REQUEST = {
    "schema": "learning.organize/0.1",
    "items": [
        {"subject": "item:a", "kind": "notes", "title": "甲",
         "about": None, "folderHint": " 目录一 ", "conceptLabels": []},
        {"subject": "item:b", "kind": "idea", "title": "想法",
         "about": None, "folderHint": "目录一", "conceptLabels": []},
    ],
    "goals": [
        {"id": "g1", "title": "目标一", "intent": None, "folders": ["目录一"]},
        {"id": "g2", "title": "目标二", "intent": None, "folders": []},
    ],
    "decisions": {"accepted": [], "rejected": []},
    "options": {"allowGoalProposals": True},
}


class OrganizerTests(unittest.TestCase):
    def test_null_produces_nothing(self):
        resp = run_organizer(NullOrganizer(), REQUEST)
        self.assertEqual(resp["assignments"], [])
        self.assertEqual(resp["goalProposals"], [])
        self.assertEqual(resp["ideaAttachments"], [])
        self.assertEqual(resp["warnings"], [])
        self.assertEqual(resp["organizer"]["name"], "null")
        self.assertFalse(resp["organizer"]["mock"])

    def test_folder_matches_golden_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "resp.json"
            with contextlib.redirect_stdout(io.StringIO()):
                rc = organize.main(["--request", str(GOLDEN_DIR / "request.json"),
                                    "--organizer", "folder", "--out", str(out)])
            self.assertEqual(rc, 0)
            got = json.loads(out.read_text(encoding="utf-8"))
        want = json.loads(
            (GOLDEN_DIR / "folder.expected.json").read_text(encoding="utf-8"))
        self.assertEqual(got, want, "folder 输出必须等于 golden 文件")

    def test_folder_rule_and_rejected_filtered(self):
        req = json.loads(json.dumps(REQUEST))
        req["decisions"]["rejected"] = [{"subject": "item:a", "goalId": "g1"}]
        resp = run_organizer(FolderOrganizer(), req)
        self.assertEqual(resp["assignments"], [],
                         "已被拒绝的组合必须过滤，不产生新提议")

        resp2 = run_organizer(FolderOrganizer(), REQUEST)
        self.assertEqual(len(resp2["assignments"]), 1)
        a = resp2["assignments"][0]
        self.assertEqual(a["subject"], "item:a")
        self.assertEqual(a["goalId"], "g1")
        self.assertEqual(a["confidence"], 0.9)
        self.assertEqual(a["reason"], "目录名「 目录一 」与目标「目标一」对应")

    def test_folder_matches_goal_title_too(self):
        req = json.loads(json.dumps(REQUEST))
        req["items"][0]["folderHint"] = "目标二"
        resp = run_organizer(FolderOrganizer(), req)
        self.assertEqual(resp["assignments"][0]["goalId"], "g2",
                         "folderHint 与目标 title 相同也算匹配")

    def test_folder_ignores_ideas_and_unmatched(self):
        resp = run_organizer(FolderOrganizer(), REQUEST)
        subjects = {a["subject"] for a in resp["assignments"]}
        self.assertNotIn("item:b", subjects, "想法不处理")

    def test_load_organizer_injection(self):
        with tempfile.TemporaryDirectory() as tmp:
            mod = Path(tmp) / "badorg.py"
            mod.write_text(
                "# -*- coding: utf-8 -*-\n"
                "class Bad:\n"
                "    name = 'bad'\n"
                "    version = '9.9'\n"
                "    def organize(self, request):\n"
                "        return {'schema': 'learning.organize/0.1',\n"
                "                'organizer': {'kind': 'component', 'name': 'bad',\n"
                "                              'version': '9.9', 'model': None,\n"
                "                              'promptVersion': None, 'mock': False},\n"
                "                'assignments': [\n"
                "                    {'subject': 'item:a', 'goalId': 'g1',\n"
                "                     'confidence': 2, 'reason': '越界',\n"
                "                     'evidence': []},\n"
                "                    {'subject': 'item:nope', 'goalId': 'g1',\n"
                "                     'confidence': 0.5, 'reason': '未知 subject',\n"
                "                     'evidence': []},\n"
                "                    {'subject': 'item:a', 'goalId': 'g2',\n"
                "                     'confidence': 0.5, 'reason': '还行',\n"
                "                     'evidence': [{'sourceId': 'note:x'}]}],\n"
                "                'goalProposals': [{'title': '', 'intent': None,\n"
                "                                   'reason': 'x', 'fromSubjects': []}],\n"
                "                'ideaAttachments': [\n"
                "                    {'subject': 'item:a', 'conceptRef': 'concept:t/c',\n"
                "                     'confidence': 0.9, 'reason': '不是想法'}],\n"
                "                'warnings': []}\n",
                encoding="utf-8")
            sys.path.insert(0, tmp)
            try:
                org = load_organizer("badorg:Bad")
                resp = run_organizer(org, REQUEST)
            finally:
                sys.path.remove(tmp)
        self.assertEqual(len(resp["assignments"]), 1,
                         "非法条目丢弃，只留合法的 item:a → g2")
        self.assertEqual(resp["assignments"][0]["subject"], "item:a")
        self.assertEqual(resp["goalProposals"], [], "空标题提议丢弃")
        self.assertEqual(resp["ideaAttachments"], [],
                         "非想法资料的挂载丢弃")
        self.assertTrue(any("confidence" in w or "未知" in w or "不是想法" in w
                            or "标题" in w for w in resp["warnings"]),
                        "丢弃要写 warnings：%r" % resp["warnings"])

    def test_rejected_backstop_for_third_party(self):
        class Leaky:
            name = "leaky"
            version = "0.1"

            def organize(self, request):
                return {"organizer": {"kind": "component", "name": "leaky",
                                      "version": "0.1", "model": None,
                                      "promptVersion": None, "mock": False},
                        "assignments": [
                            {"subject": "item:a", "goalId": "g1",
                             "confidence": 0.9, "reason": "漏过滤",
                             "evidence": []}]}

        req = json.loads(json.dumps(REQUEST))
        req["decisions"]["rejected"] = [{"subject": "item:a", "goalId": "g1"}]
        resp = run_organizer(Leaky(), req)
        self.assertEqual(resp["assignments"], [], "兜底过滤被拒组合")
        self.assertTrue(any("拒绝" in w for w in resp["warnings"]))

    def test_sample_flag_propagated(self):
        req = json.loads(json.dumps(REQUEST))
        req["sample"] = True
        resp = run_organizer(NullOrganizer(), req)
        self.assertIs(resp["sample"], True)


class EvalToolTests(unittest.TestCase):
    def test_metrics_on_handwritten_response(self):
        eval_set = {
            "goals": [{"id": "g1", "title": "一", "intent": None, "folders": []},
                      {"id": "g2", "title": "二", "intent": None, "folders": []}],
            "items": [
                {"subject": "item:a", "kind": "notes", "title": "A",
                 "about": None, "folderHint": None, "conceptLabels": []},
                {"subject": "item:b", "kind": "notes", "title": "B",
                 "about": None, "folderHint": None, "conceptLabels": []},
                {"subject": "item:c", "kind": "idea", "title": "C",
                 "about": None, "folderHint": None, "conceptLabels": []},
            ],
            "labels": [
                {"subject": "item:a", "goalIds": ["g1", "g2"], "note": None},
                {"subject": "item:b", "goalIds": [], "note": None},
                {"subject": "item:c", "goalIds": [], "note": None},
            ],
            "request": None,
        }
        response = {
            "schema": "learning.organize/0.1",
            "organizer": {"kind": "component", "name": "hand", "version": "1",
                          "model": None, "promptVersion": None, "mock": False},
            "assignments": [
                {"subject": "item:a", "goalId": "g1", "confidence": 0.9,
                 "reason": "r", "evidence": []},
                {"subject": "item:b", "goalId": "g1", "confidence": 0.5,
                 "reason": "r", "evidence": []},
                {"subject": "item:c", "goalId": "g2", "confidence": 0.9,
                 "reason": "r", "evidence": []},
            ],
            "goalProposals": [], "ideaAttachments": [], "warnings": [],
            "usage": {"calls": 3, "tokens": 120, "latencyMs": 800},
        }
        m = organize_eval.evaluate(eval_set, response, threshold=0.85)
        self.assertEqual(m["labeledSubjects"], 3)
        self.assertEqual(m["assignableSubjects"], 2)
        self.assertEqual(m["exactAccuracy"], 0.0)      # a、b 都不精确
        self.assertEqual(m["macroPrecision"], 0.5)    # a: 1/1；b: 0/1
        self.assertEqual(m["macroRecall"], 0.5)       # a: 1/2
        self.assertEqual(m["multiAssignment"]["recall"], 0.0)
        self.assertEqual(m["unassigned"]["accuracy"], 0.0)  # b 被错配 g1
        self.assertEqual(m["unassigned"]["wronglyUnassigned"], 0)
        self.assertEqual(m["ideaViolations"], 1)      # idea 被配了 g2
        self.assertAlmostEqual(m["pendingRatio"], 1 / 3, places=4)
        self.assertEqual(m["usage"]["tokens"], 120)

    def test_eval_cli_on_sample_set_with_folder(self):
        with tempfile.TemporaryDirectory() as tmp:
            resp = Path(tmp) / "resp.json"
            with contextlib.redirect_stdout(io.StringIO()):
                rc = organize.main(["--request", str(EVAL_DIR / "request.json"),
                                    "--organizer", "folder", "--out", str(resp)])
                self.assertEqual(rc, 0)
                prefix = Path(tmp) / "report"
                rc = organize_eval.main(["--eval", str(EVAL_DIR),
                                         "--response", str(resp),
                                         "--out", str(prefix)])
            self.assertEqual(rc, 0)
            m = json.loads(prefix.with_suffix(".json").read_text(encoding="utf-8"))
            md = prefix.with_suffix(".md").read_text(encoding="utf-8")
        # folder 基线的已知局限：AI 量化交易系统只按目录匹配到量化一个目标
        self.assertEqual(m["exactAccuracy"], 0.75)
        self.assertEqual(m["macroPrecision"], 1.0)
        self.assertAlmostEqual(m["macroRecall"], 0.8333, places=4)
        self.assertEqual(m["multiAssignment"]["recall"], 0.0)
        self.assertEqual(m["unassigned"]["accuracy"], 1.0)
        self.assertEqual(m["ideaViolations"], 0)
        self.assertEqual(m["rejectedViolations"], [])
        self.assertIn("归类评测报告", md)
        self.assertIn("多归属召回", md)


if __name__ == "__main__":
    unittest.main()
