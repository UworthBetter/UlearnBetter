# -*- coding: utf-8 -*-
"""笔记转换 CLI：输入主题目录 → learning.learn/0.1 + manifest + 校验报告。

用法：
    python tools/learning/notes_compile.py <主题目录> --out <输出目录>
        [--extractor null|annotated|pkg.module:Attr] [--now ISO时间]
        [--cache-file <路径>] [--report json|md|both] [--schema-file <路径>]
        [--manifest-schema-file <路径>] [--ids <旧ID映射>]
        [--decisions <overrides.jsonl>]

- 输出目录不得位于输入主题目录内（转换不写回输入笔记，运行后校验快照）；
- 重复运行走增量缓存：依赖文件哈希 + 编译器版本 + 抽取器一致时复用概念；
- 稳定 ID 映射写在 `<out>/learn-ids.json`（绝不写回笔记），改目录名后用
  `--ids <旧映射>` 或同一输出目录仍保持原 ID；
- `--decisions` 只读评估 Override 是否落空（applied/orphaned/inherited），
  不修改 learn.json（叠加由后端完成）；
- 每次编译都输出 `<topicId>.manifest.json`（learning.manifest/0.1）；
  `--schema-file` 校验 learn.json，同时（若能定位到 manifest schema）
  校验 manifest；
- 未配置 LLM 时使用默认 null 抽取器，基本转换不受密钥阻塞。
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import ids as SID  # noqa: E402
from compiler import compile_topic, merge_cache  # noqa: E402
from decisions import evaluate_decisions, load_overrides  # noqa: E402
from extractors import load_extractor  # noqa: E402
from reporting import render_markdown  # noqa: E402
from topic import scan_topic, sha1_text  # noqa: E402


def snapshot(root: Path) -> dict:
    return {p.relative_to(root).as_posix(): sha1_text(p.read_text(encoding="utf-8-sig"))
            for p in sorted(root.rglob("*.md"))}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Obsidian 笔记 → learning.learn/0.1 + manifest")
    ap.add_argument("topic_dir", help="主题目录（例如 .../双均线交易系统）")
    ap.add_argument("--out", required=True, help="输出目录（不得在主题目录内）")
    ap.add_argument("--extractor", default="null",
                    help="null | annotated | pkg.module:Attr（默认 null，不调用模型）")
    ap.add_argument("--now", default=None, help="generated.at（ISO 时间，测试用）")
    ap.add_argument("--cache-file", default=None, help="缓存文件路径（默认 <out>/learn-cache.json）")
    ap.add_argument("--report", default="both", choices=["json", "md", "both"])
    ap.add_argument("--schema-file", default=None,
                    help="可选：用 jsonschema（若已安装）额外校验 learn.json")
    ap.add_argument("--manifest-schema-file", default=None,
                    help="可选：manifest 的 JSON Schema（默认在 --schema-file 同级"
                         " schemas/record/manifest.schema.json 里自动寻找）")
    ap.add_argument("--ids", default=None,
                    help="旧 ID 映射文件（默认 <out>/learn-ids.json；改目录名后指向旧映射）")
    ap.add_argument("--decisions", default=None,
                    help="Overrides JSONL（只读）：报告 applied/orphaned/inherited")
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
    if cache_file == topic_dir or topic_dir in cache_file.parents:
        print("错误：缓存文件不得位于输入主题目录内", file=sys.stderr)
        return 1
    ids_file = Path(args.ids).resolve() if args.ids else out_dir / "learn-ids.json"
    if ids_file == topic_dir or topic_dir in ids_file.parents:
        print("错误：ID 映射文件不得位于输入主题目录内", file=sys.stderr)
        return 1

    before = snapshot(topic_dir)

    # ---- 稳定主题 ID（决定输出文件名）：frontmatter > 映射 > 目录名 slug
    id_map_old = SID.load_ids(ids_file)
    probe = scan_topic(topic_dir)
    topic_id, _origin = SID.resolve_topic_id(probe, id_map_old)
    learn_path = out_dir / ("%s.learn.json" % topic_id)
    manifest_path = out_dir / ("%s.manifest.json" % topic_id)

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
                           previous=previous, previous_cache=previous_cache,
                           id_map=id_map_old)
    doc, report = result.doc, result.report

    if args.schema_file:
        learn_schema = Path(args.schema_file)
        report["schema_validation"] = _schema_check(doc, learn_schema)
        manifest_schema = _manifest_schema_path(args, learn_schema)
        if manifest_schema is not None:
            report["manifest_schema_validation"] = _schema_check(
                result.manifest, manifest_schema)
            if report["manifest_schema_validation"].get("valid") is False:
                print("错误：manifest 未通过 JSON Schema 校验，不发布产物", file=sys.stderr)
                return 1
        if report["schema_validation"].get("valid") is False:
            print("错误：输出未通过 JSON Schema 校验，不发布产物", file=sys.stderr)
            return 1

    if args.decisions:
        decisions_path = Path(args.decisions)
        try:
            overrides = load_overrides(decisions_path)
        except OSError as exc:
            print("错误：无法读取 --decisions 文件：%s" % exc, file=sys.stderr)
            return 1
        report["decisions"] = evaluate_decisions(overrides, doc, previous,
                                                 result.id_map)
        report["decisions"]["file"] = str(decisions_path)

    if snapshot(topic_dir) != before:
        print("错误：输入笔记在编译期间发生变化，不发布产物", file=sys.stderr)
        return 1

    out_dir.mkdir(parents=True, exist_ok=True)
    learn_path.write_text(
        json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    manifest_path.write_text(
        json.dumps(result.manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8")
    if args.report in ("json", "both"):
        (out_dir / ("%s.report.json" % topic_id)).write_text(
            json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if args.report in ("md", "both"):
        (out_dir / ("%s.report.md" % topic_id)).write_text(
            render_markdown(report), encoding="utf-8")
    cache_doc = merge_cache(previous_cache, result.cache)
    cache_file.parent.mkdir(parents=True, exist_ok=True)
    cache_file.write_text(
        json.dumps(cache_doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    SID.save_ids(out_dir / "learn-ids.json", result.id_map)

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
    print("输出：%s" % manifest_path)
    if "decisions" in report:
        st = report["decisions"]["statuses"]
        print("修正评估：applied=%d orphaned=%d inherited=%d（其余主题跳过 %d 条）"
              % (st["applied"], st["orphaned"], st["inherited"],
                 report["decisions"]["skippedOtherTopic"]))
    print("问题：%d 条（详见 report）" % len(report["issues"]))
    return 0


def _manifest_schema_path(args, learn_schema: Path):
    if args.manifest_schema_file:
        return Path(args.manifest_schema_file)
    if not args.schema_file:
        return None
    candidate = learn_schema.parent.parent / "record" / "manifest.schema.json"
    return candidate if candidate.exists() else None


def _schema_check(doc: dict, schema_path: Path) -> dict:
    try:
        import jsonschema  # type: ignore
    except ImportError:
        return {"checked": False, "reason": "未安装 jsonschema，跳过（可选依赖）"}
    schema = json.loads(schema_path.read_text(encoding="utf-8"))
    validator_cls = getattr(jsonschema, "Draft202012Validator", None) or \
        jsonschema.Draft7Validator
    if schema.get("$schema", "").startswith(
            "http://json-schema.org/draft-07"):
        validator_cls = jsonschema.Draft7Validator
    validator = validator_cls(schema)
    errors = sorted(validator.iter_errors(doc), key=lambda e: list(e.path))
    return {
        "checked": True,
        "valid": not errors,
        "errors": ["%s: %s" % (list(e.path) or "<root>", e.message)
                   for e in errors[:50]],
    }


if __name__ == "__main__":
    raise SystemExit(main())
