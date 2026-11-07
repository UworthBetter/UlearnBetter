# -*- coding: utf-8 -*-
"""video_ingest 纯函数单元测试（不依赖网络与 yt-dlp）。"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))

import video_ingest as vi  # noqa: E402


class TestParseTimedText(unittest.TestCase):
    def test_vtt_rolling_dedupe(self):
        vtt = """WEBVTT

00:00:01.000 --> 00:00:04.000
hello world

00:00:02.000 --> 00:00:06.000
hello world again

00:00:04.000 --> 00:00:07.000
hello world again
"""
        segs = vi.parse_timed_text(vtt)
        texts = [s["text"] for s in segs]
        self.assertEqual(texts, ["hello world", "again"])
        self.assertEqual(segs[-1]["end"], 7.0)

    def test_srt_and_noise(self):
        srt = """1
00:00:01,000 --> 00:00:02,000
你好

2
00:00:02,000 --> 00:00:03,000
[Music]
"""
        segs = vi.parse_subtitle(srt)
        self.assertEqual([s["text"] for s in segs], ["你好"])
        self.assertEqual(segs[0]["start"], 1.0)

    def test_bili_json(self):
        data = '{"body": [{"from": 1.0, "to": 2.5, "content": "因子中性化"}, {"from": 2.5, "to": 4.0, "content": ""}]}'
        segs = vi.parse_subtitle(data)
        self.assertEqual(len(segs), 1)
        self.assertEqual(segs[0]["text"], "因子中性化")
        self.assertEqual(segs[0]["end"], 2.5)

    def test_json3(self):
        data = '{"events": [{"tStartMs": 1000, "dDurationMs": 2000, "segs": [{"utf8": "binary "}, {"utf8": "numbers"}]}, {"tStartMs": 3000, "segs": [{"utf8": "\\n"}]}]}'
        segs = vi.parse_subtitle(data)
        self.assertEqual([s["text"] for s in segs], ["binary numbers"])


class TestChapters(unittest.TestCase):
    def test_official(self):
        meta = {"chapters": [{"start_time": 0, "end_time": 33, "title": "Intro"},
                             {"start_time": 33, "end_time": 79, "title": "The Computer"}]}
        chs = vi.chapters_from(meta)
        self.assertEqual([c["title"] for c in chs], ["Intro", "The Computer"])
        self.assertTrue(all(c["origin"] == "official" for c in chs))

    def test_description_fallback(self):
        meta = {"duration": 200,
                "description": "前言\n0:00 Intro\n1:23 二进制与比特\n结尾"}
        chs = vi.chapters_from(meta)
        self.assertEqual(len(chs), 2)
        self.assertEqual(chs[0]["start"], 0.0)
        self.assertEqual(chs[1]["start"], 83.0)
        self.assertEqual(chs[1]["title"], "二进制与比特")
        self.assertEqual(chs[1]["end"], 200.0)

    def test_hms2sec(self):
        self.assertEqual(vi.hms2sec("1:23"), 83)
        self.assertEqual(vi.hms2sec("1:02:03"), 3723)


class TestVerify(unittest.TestCase):
    def test_trusted(self):
        chapters = [{"start": 0.0, "title": "binary numbers"},
                    {"start": 30.0, "title": "memory and caches"},
                    {"start": 60.0, "title": "the cpu instructions"}]
        segs = [{"start": 1.0, "text": "let us talk about binary numbers today"},
                {"start": 31.0, "text": "memory and caches keep data close"},
                {"start": 61.0, "text": "the cpu instructions set is a contract"}]
        flags = vi.verify_chapters(chapters, segs)
        self.assertTrue(flags["trusted"])
        self.assertEqual(flags["chapters_matched"], 3)

    def test_untrusted(self):
        chapters = [{"start": 0.0, "title": "完全不相关的章节甲"},
                    {"start": 30.0, "title": "完全不相关的章节乙"},
                    {"start": 60.0, "title": "完全不相关的章节丙"}]
        segs = [{"start": 1.0, "text": "这里是讲做的菜谱没有关系"}]
        flags = vi.verify_chapters(chapters, segs)
        self.assertFalse(flags["trusted"])
        self.assertEqual(flags["chapters_matched"], 0)


class TestPickTrack(unittest.TestCase):
    def test_lang_pref_and_ext(self):
        td = {"en": [{"ext": "srv3", "url": "a"}, {"ext": "vtt", "url": "b"}],
              "zh-Hans": [{"ext": "vtt", "url": "c"}]}
        track = vi.pick_track(td, ["zh-Hans", "en"])
        self.assertEqual(track["lang"], "zh-Hans")
        self.assertEqual(track["url"], "c")

    def test_fallback_order(self):
        td = {"fr": [{"ext": "vtt", "url": "x"}]}
        track = vi.pick_track(td, ["zh-Hans", "en"])
        self.assertEqual(track["lang"], "fr")


class TestPlatform(unittest.TestCase):
    def test_detect(self):
        self.assertEqual(vi.detect_platform("https://youtu.be/abc"), "youtube")
        self.assertEqual(vi.detect_platform("https://b23.tv/abc"), "bilibili")
        self.assertEqual(vi.detect_platform("https://example.com/v/1"), "generic")


if __name__ == "__main__":
    unittest.main()
