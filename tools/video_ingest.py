#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""video_ingest.py — 学习系统 · 解析层（URL → 结构化 ingest JSON）

设计原则（对应蓝图 v1.1 §3.1/§5）：
1. 解析与理解分离：本工具是确定性编排（yt-dlp + 字幕解析 + 可选 ASR），
   不调用任何 LLM；建库 Agent 只消费本工具产出的 JSON。
2. 站在开源组件上：yt-dlp（解析/字幕）、faster-whisper（ASR 兜底）均为外部依赖，
   本脚本只做"选轨 → 下载 → 归一化 → 校验 → 落 JSON"。
3. 官方优先、可重跑：元数据/章节取官方；字幕手创 > 自动 > ASR；全流程可缓存重放。

用法：
  python tools/video_ingest.py <URL> [-o out.json] [--proxy URL]
      [--cookies-from-browser chrome] [--sub-langs zh-Hans,zh,en]
      [--asr] [--asr-model small]
"""
from __future__ import annotations

import argparse
import bisect
import datetime as dt
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import unicodedata
from pathlib import Path

TOOL_VERSION = "0.1.0"
SCHEMA = "learning.vault.ingest/0.1"

PLATFORMS = [
    ("youtube", r"youtube\.com|youtu\.be"),
    ("bilibili", r"bilibili\.com|b23\.tv"),
    ("douyin", r"douyin\.com"),
    ("tiktok", r"tiktok\.com"),
    ("vimeo", r"vimeo\.com"),
    ("twitter", r"twitter\.com|x\.com"),
]
LANG_PREF = ["zh-Hans", "zh-CN", "zh", "zh-Hant", "zh-TW", "en"]
DEFAULT_SUB_LANGS = "zh-Hans,zh,en"  # 语言过多会触发 YouTube timedtext 429
YTDL_BASE = ["--js-runtimes", "node", "--remote-components", "ejs:github"]  # 新版 yt-dlp 解析 YouTube 需要 JS 运行时；本机有 Node
SUB_EXTS = ["vtt", "json3", "srt", "srv3", "srv2", "srv1", "srv0", "best"]

TS_LINE = re.compile(
    r"(\d{1,2}):(\d{2}):(\d{2})[.,](\d{1,3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[.,](\d{1,3})")
TAG = re.compile(r"<[^>]+>")
DESC_CHAPTER = re.compile(
    r"^\s*[\(\[【]?\s*((?:\d{1,2}:)?\d{1,2}:\d{2})\s*[\)\]】]?\s*[-–—·|:：]?\s*(\S.+?)\s*$")
NOISE = re.compile(r"^[\[\(（【\s]*(music|音乐|掌声|笑声|applause|sfx)?[\]\)）】\s]*$", re.I)
ENTITIES = (("&amp;", "&"), ("&lt;", "<"), ("&gt;", ">"), ("&quot;", '"'), ("&#39;", "'"), ("&nbsp;", " "))


def detect_platform(url: str) -> str:
    for name, pat in PLATFORMS:
        if re.search(pat, url):
            return name
    return "generic"


def run_ytdlp(args: list[str]) -> str:
    p = subprocess.run(["yt-dlp", *YTDL_BASE, *args], capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    if p.returncode != 0:
        raise RuntimeError((p.stderr or p.stdout).strip()[:900])
    return p.stdout


def download_subs(url: str, extra: list[str], langs: list[str], workdir: str,
                  platform: str = "generic", orig_lang: str | None = None) -> list[Path]:
    """字幕下载一律交给 yt-dlp，落到临时目录再解析。
    降级链：默认客户端全量语言 → android 客户端全量语言 → android 只取原语言。
    （YouTube 翻译字幕接口限流最狠，原语言 ASR 字幕通常能过；--ignore-errors 保证单轨失败不拖垮其余。）"""
    attempts: list[tuple[str | None, list[str]]] = [(None, langs)]
    if platform == "youtube":
        attempts.append(("youtube:player_client=android", langs))
        if orig_lang:
            attempts.append(("youtube:player_client=android", [orig_lang]))
    last_err: RuntimeError | None = None
    for ea, ls in attempts:
        try:
            run_ytdlp(["--skip-download", "--no-playlist", "--write-subs", "--write-auto-subs",
                       "--ignore-errors", "--sub-langs", ",".join(ls),
                       "--sub-format", "vtt/json3/srt/best", "--retries", "3",
                       "-o", os.path.join(workdir, "sub.%(ext)s"),
                       *(["--extractor-args", ea] if ea else []), *extra, url])
            last_err = None
            break
        except RuntimeError as e:
            last_err = e
            time.sleep(2)
    if last_err:
        print(f"[warn] 字幕下载失败，继续用已取到的内容：{last_err}", file=sys.stderr)
    return sorted(Path(workdir).glob("sub.*"))


# ---------- 字幕选轨 ----------

def pick_track(trackdict: dict, langs_pref: list[str]) -> dict | None:
    if not trackdict:
        return None
    langs = list(trackdict.keys())
    ordered = [l for l in langs_pref if l in trackdict] + [l for l in langs if l not in langs_pref]
    for lang in ordered:
        tracks = sorted(trackdict[lang], key=lambda t: SUB_EXTS.index(t["ext"]) if t.get("ext") in SUB_EXTS else 99)
        if tracks:
            return {"lang": lang, "ext": tracks[0].get("ext", "best"), "url": tracks[0]["url"]}
    return None


# ---------- 字幕解析（vtt / srt / json3 / bili-json 归一化） ----------

def _ts(h, m, s, ms) -> float:
    return int(h) * 3600 + int(m) * 60 + int(s) + int(ms.ljust(3, "0")) / 1000


def parse_timed_text(text: str) -> list[dict]:
    """vtt/srt 共用：按 cue 块解析。
    滚动字幕去重（YouTube 自动字幕特有）：仅当新 cue 与上一条 cue 在时间上重叠、
    且上一条完整文本的后缀 == 新 cue 的前缀（≥10 字符）时只保留增量，
    避免误伤正常的重复台词。"""
    segs: list[dict] = []
    carry = ""  # 上一条 cue 的完整文本
    for block in re.split(r"\n\s*\n", text):
        lines = [l.strip() for l in block.splitlines() if l.strip()]
        tsi = next((i for i, l in enumerate(lines) if TS_LINE.search(l)), None)
        if tsi is None:
            continue
        m = TS_LINE.search(lines[tsi])
        start, end = _ts(*m.groups()[:4]), _ts(*m.groups()[4:])
        body = " ".join(lines[tsi + 1:])
        body = TAG.sub("", body)
        for a, b in ENTITIES:
            body = body.replace(a, b)
        body = re.sub(r"\s+", " ", body).strip()
        if not body or NOISE.match(body):
            continue
        rolling = bool(segs) and start < segs[-1]["end"]
        if rolling and body == carry:            # 完全重复 → 仅延长
            segs[-1]["end"] = max(segs[-1]["end"], end)
            carry = body
            continue
        delta = body
        if rolling and carry:
            max_k = min(len(carry), len(body) - 1, 160)
            for k in range(max_k, 9, -1):        # 后缀==前缀的滚动重叠
                if carry.endswith(body[:k]):
                    delta = body[k:].strip()
                    break
        if delta:
            segs.append({"start": round(start, 3), "end": round(end, 3), "text": delta})
        elif segs:                               # 无增量 → 延长上一段
            segs[-1]["end"] = max(segs[-1]["end"], end)
        carry = body
    return segs


def parse_json3(text: str) -> list[dict]:
    data = json.loads(text)
    segs = []
    for ev in data.get("events", []):
        if "segs" not in ev:
            continue
        body = re.sub(r"\s+", " ", "".join(s.get("utf8", "") for s in ev["segs"])).strip()
        if not body:
            continue
        segs.append({"start": ev.get("tStartMs", 0) / 1000,
                     "end": (ev.get("tStartMs", 0) + ev.get("dDurationMs", 0)) / 1000,
                     "text": body})
    return segs


def parse_bili_json(text: str) -> list[dict]:
    segs = []
    for it in json.loads(text).get("body", []):
        body = str(it.get("content", "")).strip()
        if body:
            segs.append({"start": float(it.get("from", 0)), "end": float(it.get("to", 0)),
                         "text": body})
    return segs


def parse_subtitle(text: str) -> list[dict]:
    s = text.lstrip()
    if s.startswith("{"):
        try:
            data = json.loads(s)
            return parse_bili_json(s) if isinstance(data, dict) and "body" in data else parse_json3(s)
        except json.JSONDecodeError:
            pass
    return parse_timed_text(s)


# ---------- 章节 ----------

def hms2sec(ts: str) -> int:
    parts = [int(x) for x in ts.split(":")]
    while len(parts) < 3:
        parts.insert(0, 0)
    return parts[0] * 3600 + parts[1] * 60 + parts[2]


def chapters_from(meta: dict) -> list[dict]:
    chs = meta.get("chapters") or []
    if chs:
        return [{"start": float(c["start_time"]), "end": float(c.get("end_time") or 0),
                 "title": (c.get("title") or "").strip(), "origin": "official"} for c in chs]
    out = []
    for line in (meta.get("description") or "").splitlines():
        m = DESC_CHAPTER.match(line)
        if m:
            out.append({"start": float(hms2sec(m.group(1))), "end": 0.0,
                        "title": m.group(2).strip(), "origin": "description"})
    dur = float(meta.get("duration") or 0)
    for i, c in enumerate(out):
        c["end"] = out[i + 1]["start"] if i + 1 < len(out) else dur
    return out


# ---------- 章节真伪校验（对应技能"先验证再动笔"） ----------

def _norm(s: str) -> str:
    s = unicodedata.normalize("NFKC", s or "").lower()
    return re.sub(r"[\W_]+", "", s, flags=re.UNICODE)


def _grams(s: str) -> set[str]:
    return {s[i:i + 4] for i in range(max(0, len(s) - 3))} or ({s} if s else set())


def verify_chapters(chapters: list[dict], segs: list[dict]) -> dict:
    if not chapters or not segs:
        return {"chapters_total": len(chapters), "chapters_matched": 0,
                "per_chapter": [], "trusted": False}
    starts = [s["start"] for s in segs]
    texts = [s["text"] for s in segs]
    per = []
    for c in chapters:
        lo = bisect.bisect_left(starts, c["start"] - 30)
        hi = bisect.bisect_right(starts, c["start"] + 180)
        window = _norm("".join(texts[lo:hi]))
        per.append(bool(_grams(_norm(c["title"])) & _grams(window)))
    matched = sum(per)
    trusted = matched >= 3 or (0 < len(chapters) <= 2 and matched == len(chapters))
    return {"chapters_total": len(chapters), "chapters_matched": matched,
            "per_chapter": per, "trusted": trusted}


# ---------- ASR 兜底 ----------

def asr_fallback(url: str, extra: list[str], model: str, workdir: str):
    print("[asr] 无可用字幕，回退本地语音识别（首次运行需下载模型）…", file=sys.stderr)
    run_ytdlp(["-x", "--audio-format", "m4a", "--audio-quality", "5", "--no-playlist",
               "-o", os.path.join(workdir, "audio.%(ext)s"), *extra, url])
    files = list(Path(workdir).glob("audio.*"))
    if not files:
        raise RuntimeError("音频下载失败")
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        raise RuntimeError("未安装 faster-whisper，请先：pip install faster-whisper")
    m = WhisperModel(model, device="cpu", compute_type="int8")
    segments, info = m.transcribe(str(files[0]), vad_filter=True)
    segs = [{"start": round(s.start, 3), "end": round(s.end, 3), "text": s.text.strip()}
            for s in segments if s.text.strip()]
    return segs, info.language


# ---------- 主流程 ----------

def main() -> None:
    ap = argparse.ArgumentParser(description="学习系统解析层：URL → 结构化 ingest JSON")
    ap.add_argument("url")
    ap.add_argument("-o", "--out", help="输出 JSON 路径，默认 ./ingest/<platform>_<id>.json")
    ap.add_argument("--proxy", help="如 http://127.0.0.1:7890")
    ap.add_argument("--cookies-from-browser", dest="cookies",
                    help="浏览器 cookie（B站 AI 字幕 / 会员内容需要）")
    ap.add_argument("--sub-langs", dest="sub_langs", default=DEFAULT_SUB_LANGS)
    ap.add_argument("--asr", action="store_true", help="无字幕时回退本地 ASR（需 faster-whisper）")
    ap.add_argument("--asr-model", dest="asr_model", default="small")
    a = ap.parse_args()

    if a.proxy:
        for k in ("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"):
            os.environ[k] = a.proxy
    extra = []
    if a.proxy:
        extra += ["--proxy", a.proxy]
    if a.cookies:
        extra += ["--cookies-from-browser", a.cookies]

    meta = json.loads(run_ytdlp(
        ["--skip-download", "--no-playlist", "--dump-single-json", *extra, a.url]))

    langs = a.sub_langs.split(",")
    manual = pick_track(meta.get("subtitle") or {}, langs)
    auto = pick_track(meta.get("automatic_captions") or {}, langs)

    segs: list[dict] = []
    track: dict | None = None
    source: str | None = None
    workdir = tempfile.mkdtemp(prefix="ingest_")
    try:
        if manual or auto:
            orig = next((k[:-5] for k in (meta.get("automatic_captions") or {})
                         if k.endswith("-orig")), None)
            parsed: dict[str, list[dict]] = {}
            for f in download_subs(a.url, extra, langs, workdir,
                                   detect_platform(a.url), orig):
                lang = f.stem.split(".", 1)[1] if "." in f.stem else f.stem
                s = parse_subtitle(f.read_text(encoding="utf-8", errors="replace"))
                if s:
                    parsed.setdefault(lang, s)
            if parsed:
                base = lambda x: x.split("-")[0]  # en-orig → en
                pref = [base(l) for l in langs] + ([base(orig)] if orig else [])
                lang = next((k for p in pref for k in parsed if base(k) == p),
                            next(iter(parsed)))
                segs = parsed[lang]
                track, source = {"lang": lang}, ("manual" if manual else "auto")
        if not track and a.asr:
            segs, alang = asr_fallback(a.url, extra, a.asr_model, workdir)
            track, source = {"lang": alang}, "asr"
    finally:
        shutil.rmtree(workdir, ignore_errors=True)

    chapters = chapters_from(meta)
    flags = verify_chapters(chapters, segs)
    notes = []
    if source == "auto":
        notes.append("自动字幕（平台 ASR 生成），可能含识别错误；与官方章节矛盾时按规则弃用")
    if source == "manual":
        notes.append("手创字幕，可信度最高")
    if not chapters:
        notes.append("无官方章节：目录结构与时间戳需从转写生成")
    if not source:
        notes.append("未取到转写：可重试加 --asr 或 --cookies-from-browser（B站 AI 字幕需登录）")

    result = {
        "schema": SCHEMA,
        "generated_at": dt.datetime.now().isoformat(timespec="seconds"),
        "tool": f"video_ingest {TOOL_VERSION}",
        "platform": detect_platform(a.url),
        "id": meta.get("id"),
        "url": meta.get("webpage_url") or a.url,
        "title": meta.get("title"),
        "channel": meta.get("uploader") or meta.get("channel"),
        "upload_date": meta.get("upload_date"),
        "duration_sec": meta.get("duration"),
        "description": meta.get("description"),
        "thumbnail": meta.get("thumbnail"),
        "chapters": chapters,
        "transcript": ({"source": source, "lang": track["lang"],
                        "segment_count": len(segs), "segments": segs} if source else None),
        "quality_flags": {**flags, "transcript_source": source, "notes": notes},
    }

    out = Path(a.out) if a.out else Path("ingest") / f"{result['platform']}_{meta.get('id')}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")

    print(json.dumps({
        "输出": str(out),
        "标题": result["title"],
        "平台": result["platform"],
        "时长秒": result["duration_sec"],
        "转写": None if not source else {"来源": source, "语言": track["lang"], "段数": len(segs)},
        "章节": {"数": flags["chapters_total"], "互证命中": flags["chapters_matched"],
                "可信": flags["trusted"]},
        "提示": notes,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    try:
        main()
    except RuntimeError as e:
        print(f"[失败] {e}", file=sys.stderr)
        sys.exit(2)
    except FileNotFoundError as e:
        print(f"[失败] 依赖缺失：{e}（请确认 yt-dlp 已安装并在 PATH 中）", file=sys.stderr)
        sys.exit(3)
