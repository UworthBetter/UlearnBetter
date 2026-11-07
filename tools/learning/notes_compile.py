# -*- coding: utf-8 -*-
"""笔记转换 CLI：输入主题目录 → learning.learn/0.1 + 校验报告。

用法：
    python tools/learning/notes_compile.py <主题目录> --out <输出目录>
        [--extractor null|annotated|pkg.module:Attr] [--now ISO时间]
        [--cache-file <路径>] [--report json|md|both] [--schema-file <路径>]

- 输出目录不得位于输入主题目录内（转换不写回输入笔记，运行后校验快照）；
- 重复运行走增量缓存：依赖文件哈希 + 编译器版本 + 抽取器一致时复用概念；
- 未配置 LLM 时使用默认 null 抽取器，基本转换不受密钥阻塞。
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from compiler import compile_topic, merge_cache  # noqa: E402
from extractors import load_extractor  # noqa: E402
from reporting import render_markdown  # noqa: E402
from topic import sha1_text  # noqa: E402


def snapshot(root: Path) -> dict:
    return {p.relative_to(root).as_posix(): sha1_text(p.read_text(encoding="utf-8-sig"))
            for p in sorted(root.rglob("*.md"))}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Obsidian 笔记 → learning.learn/0.1")
    ap.add_argument("topic_dir", help="主题目录（例如 .../双均线交易系统）")
    ap.add_argument("--out", required=True, help="输出目录（不得在主题目录内）")
    ap.add_argument("--extractor", default="null",
                    help="null | annotated | pkg.module:Attr（默认 null，不调用模型）")
    ap.add_argument("--now", default=None, help="generated.at（ISO 时间，测试用）")
    ap.add_argument("--cache-file", default=None, help="缓存文件路径（默认 <out>/learn-cache.json）")
    ap.add_argument("--report", default="both", choices=["json", "md", "both"])
    ap.add_argument("--schema-file", default=None,
                    help="可选：用 jsonschema（若已安装）额外校验输出")
    args = ap.parse_args(argv)

    topic_dir = Path(args.topic_dir).resolve()
    out_dir = Path(args.out).resolve()
    if not topic_dir.is_dir():
        print("错误：主题目录不存在 %s" % topic_dir, file=sys.stderr)
        return 1
    try:
        out_dir.relative_to(topic_dir)
        print("错误：输出目录不得位于输入主题目录内（不写回输入笔记）", file=sys.stderr)
        return 1
    except ValueError:
        pass

    cache_file = Path(args.cache_file).resolve() if args.cache_file \
        else out_dir / "learn-cache.json"
    topic_id = topic_dir.name
    learn_path = out_dir / ("%s.learn.json" % topic_id)

    before = snapshot(topic_dir)

    previous = None
    if learn_path.exists():
        try:
            previous = json.loads(learn_path.read_text(encoding="utf-8"))
        except ValueError:
            print("警告：上一版 learn.json 解析失败，忽略增量缓存", file=sys.stderr)
            previous = None
    previous_cache = None
    if cache_file.exists() and previous is not None:
        try:
            previous_cache = json.loads(cache_file.read_text(encoding="utf-8"))
        except ValueError:
            previous_cache = None

    try:
        extractor = load_extractor(args.extractor)
    except Exception as exc:
        print("错误：无法加载抽取器 %r：%s" % (args.extractor, exc), file=sys.stderr)
        return 1

    result = compile_topic(topic_dir, extractor, now=args.now,
                           previous=previous, previous_cache=previous_cache)
    doc, report = result.doc, result.report

    if args.schema_file:
        report["schema_validation"] = _schema_check(doc, Path(args.schema_file))

    out_dir.mkdir(parents=True, exist_ok=True)
    learn_path.write_text(
        json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if args.report in ("json", "both"):
        (out_dir / ("%s.report.json" % topic_id)).write_text(
            json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if args.report in ("md", "both"):
        (out_dir / ("%s.report.md" % topic_id)).write_text(
            render_markdown(report), encoding="utf-8")
    cache_doc = merge_cache(previous_cache, result.cache)
    cache_file.write_text(
        json.dumps(cache_doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    after = snapshot(topic_dir)
    if after != before:
        print("错误：输入笔记在编译期间发生变化，中止（未验证输出）", file=sys.stderr)
        return 1

    s = report["stats"]
    print("主题 %s：概念 %d，块 %s，实操 %d 份，来源 %d，时间戳证据 %d" % (
        topic_id, s["concepts"],
        "/".join("%s=%d" % (k, v) for k, v in s["blocks_by_shape"].items() if v),
        s["procedures"], s["sources"], s["timestamp_evs"]))
    print("输出：%s" % learn_path)
    print("问题：%d 条（详见 report）" % len(report["issues"]))
    return 0


def _schema_check(doc: dict, schema_path: Path) -> dict:
    try:
        import jsonschema  # type: ignore
    except ImportError:
        return {"checked": False, "reason": "未安装 jsonschema，跳过（可选依赖）"}
    schema = json.loads(schema_path.read_text(encoding="utf-8"))
    validator = jsonschema.Draft7Validator(schema)
    errors = sorted(validator.iter_errors(doc), key=lambda e: list(e.path))
    return {
        "checked": True,
        "valid": not errors,
        "errors": ["%s: %s" % (list(e.path) or "<root>", e.message)
                   for e in errors[:50]],
    }


if __name__ == "__main__":
    raise SystemExit(main())
