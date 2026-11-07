# -*- coding: utf-8 -*-
"""归类评测：评测集 + 任意 Organizer 响应 → 指标报告（json + md）。

输入评测集目录（goals.json / items.json / labels.json，见
samples/organize-eval/README.md）与一份 learning.organize/0.1 响应 JSON，
输出：

- 精确匹配准确率（归属集合完全一致）；
- 宏平均查准率 / 查全率（逐条目标级的交集比）；
- 多归属召回（期望 ≥2 个目标的条目是否全部召回）；
- 未归属判断（期望未归属的条目是否保持未归属、期望有归属的条目
  是否被错误留空）；
- 想法违规（idea 条目不应得到目标归属）；
- 待确认比例（confidence < 阈值，默认 0.85，即自动接受线以下）；
- 被拒组合违规（若评测目录带 request.json，响应不得包含其
  decisions.rejected 里的组合）；
- 响应若带 `usage`（calls / tokens / latencyMs）则原样转出。

用法：
    python tools/learning/organize_eval.py --eval <目录> --response <json>
        [--threshold 0.85] [--out <前缀>] [--report both|json|md]
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Dict, List, Optional

sys.path.insert(0, str(Path(__file__).resolve().parent))


def load_eval_dir(eval_dir: Path) -> dict:
    missing = [n for n in ("goals.json", "items.json", "labels.json")
               if not (eval_dir / n).exists()]
    if missing:
        raise FileNotFoundError(
            "评测集缺少 %s（目录 %s）" % ("、".join(missing), eval_dir))
    read = lambda n: json.loads(  # noqa: E731
        (eval_dir / n).read_text(encoding="utf-8"))
    return {"goals": read("goals.json"), "items": read("items.json"),
            "labels": read("labels.json"),
            "request": read("request.json")
            if (eval_dir / "request.json").exists() else None}


def evaluate(eval_set: dict, response: dict,
             threshold: float = 0.85) -> dict:
    items_by_subject: Dict[str, dict] = {i["subject"]: i
                                         for i in eval_set["items"]}
    produced: Dict[str, set] = {}
    assignment_count = 0
    pending_count = 0
    for a in response.get("assignments", []) or []:
        subject, goal_id = a.get("subject"), a.get("goalId")
        if goal_id is None:
            continue
        assignment_count += 1
        if not isinstance(a.get("confidence"), (int, float)) \
                or a["confidence"] < threshold:
            pending_count += 1
        produced.setdefault(subject, set()).add(goal_id)

    exact = 0
    prec_sum = prec_n = 0
    rec_sum = rec_n = 0
    multi_total = multi_hit = 0
    unassigned_total = unassigned_correct = 0
    wrongly_unassigned = 0
    idea_violations = 0
    rows = []
    for label in eval_set["labels"]:
        subject = label.get("subject")
        kind = items_by_subject.get(subject, {}).get("kind")
        expected = set(label.get("goalIds", []) or [])
        got = produced.get(subject, set())
        if kind == "idea":
            if got:
                idea_violations += 1
                rows.append({"subject": subject, "kind": kind,
                             "expected": [], "got": sorted(got),
                             "exact": False, "note": "想法不应有目标归属"})
            else:
                rows.append({"subject": subject, "kind": kind,
                             "expected": [], "got": [], "exact": True,
                             "note": ""})
            continue
        is_exact = expected == got
        exact += 1 if is_exact else 0
        inter = expected & got
        if got:
            prec_sum += len(inter) / len(got)
            prec_n += 1
        if expected:
            rec_sum += len(inter) / len(expected)
            rec_n += 1
        if len(expected) >= 2:
            multi_total += 1
            if expected <= got:
                multi_hit += 1
        if not expected:
            unassigned_total += 1
            if not got:
                unassigned_correct += 1
        elif not got:
            wrongly_unassigned += 1
        rows.append({
            "subject": subject, "kind": kind,
            "expected": sorted(expected), "got": sorted(got),
            "exact": is_exact,
            "note": label.get("note") or "",
        })

    rejected_violations = []
    request = eval_set.get("request")
    if request:
        rejected = {(r.get("subject"), r.get("goalId"))
                    for r in (request.get("decisions") or {})
                    .get("rejected", []) or []}
        for a in response.get("assignments", []) or []:
            key = (a.get("subject"), a.get("goalId"))
            if key in rejected:
                rejected_violations.append("%s → %s" % key)

    n_assignable = sum(1 for r in rows if r["kind"] != "idea")
    metrics = {
        "schema": "learning.organize.eval/0.1",
        "labeledSubjects": len(rows),
        "assignableSubjects": n_assignable,
        "exactAccuracy": _ratio(exact, n_assignable),
        "macroPrecision": (prec_sum / prec_n) if prec_n else None,
        "macroRecall": (rec_sum / rec_n) if rec_n else None,
        "multiAssignment": {
            "total": multi_total,
            "recalled": multi_hit,
            "recall": _ratio(multi_hit, multi_total),
        },
        "unassigned": {
            "expectedNone": unassigned_total,
            "keptNone": unassigned_correct,
            "accuracy": _ratio(unassigned_correct, unassigned_total),
            "wronglyUnassigned": wrongly_unassigned,
        },
        "ideaViolations": idea_violations,
        "assignments": assignment_count,
        "pendingRatio": _ratio(pending_count, assignment_count),
        "pendingThreshold": threshold,
        "rejectedViolations": rejected_violations,
        "organizer": response.get("organizer"),
        "usage": response.get("usage")
        if isinstance(response.get("usage"), dict) else None,
        "rows": rows,
    }
    return metrics


def _ratio(hit: int, total: int) -> Optional[float]:
    return round(hit / total, 4) if total else None


def render_markdown(m: dict) -> str:
    lines = []
    ap = lines.append
    ap("# 归类评测报告")
    ap("")
    org = m.get("organizer") or {}
    ap("- organizer：`%s`（version=%s，mock=%s）"
       % (org.get("name"), org.get("version"), org.get("mock")))
    ap("- 标注条目 %d（可归属 %d，想法 %d）；响应归属 %d 条，"
       "待确认比例 %s（阈值 %s）"
       % (m["labeledSubjects"], m["assignableSubjects"],
          m["labeledSubjects"] - m["assignableSubjects"],
          m["assignments"],
          _fmt(m["pendingRatio"]), m["pendingThreshold"]))
    ap("- 精确匹配准确率 %s · 宏查准 %s · 宏查全 %s"
       % (_fmt(m["exactAccuracy"]), _fmt(m["macroPrecision"]),
          _fmt(m["macroRecall"])))
    ap("- 多归属召回 %s（%d/%d）· 未归属判断 %s（%d/%d，错留空 %d）· "
       "想法违规 %d"
       % (_fmt(m["multiAssignment"]["recall"]),
          m["multiAssignment"]["recalled"], m["multiAssignment"]["total"],
          _fmt(m["unassigned"]["accuracy"]),
          m["unassigned"]["keptNone"], m["unassigned"]["expectedNone"],
          m["unassigned"]["wronglyUnassigned"], m["ideaViolations"]))
    if m["rejectedViolations"]:
        ap("- **被拒组合违规 %d 条**：%s"
           % (len(m["rejectedViolations"]), "；".join(m["rejectedViolations"])))
    else:
        ap("- 被拒组合违规：0")
    usage = m.get("usage")
    if usage:
        ap("- 用量：calls=%s tokens=%s latencyMs=%s"
           % (usage.get("calls"), usage.get("tokens"),
              usage.get("latencyMs")))
    ap("")
    ap("| subject | kind | 期望 | 得到 | 精确 |")
    ap("| --- | --- | --- | --- | --- |")
    for r in m["rows"]:
        ap("| `%s` | %s | %s | %s | %s |"
           % (r["subject"], r["kind"],
              "、".join(r["expected"]) or "∅",
              "、".join(r["got"]) or "∅",
              "✓" if r["exact"] else "✗"))
    return "\n".join(lines) + "\n"


def _fmt(v) -> str:
    if v is None:
        return "n/a"
    return "%.4f" % v if isinstance(v, float) else str(v)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Organizer 响应评测")
    ap.add_argument("--eval", required=True, help="评测集目录（含 goals/items/labels.json）")
    ap.add_argument("--response", required=True, help="organize 响应 JSON 路径")
    ap.add_argument("--threshold", type=float, default=0.85,
                    help="待确认阈值（默认 0.85，自动接受线）")
    ap.add_argument("--out", default=None,
                    help="报告输出前缀（写 <out>.json 与 <out>.md；缺省打印 JSON）")
    ap.add_argument("--report", default="both", choices=["json", "md", "both"])
    args = ap.parse_args(argv)

    try:
        eval_set = load_eval_dir(Path(args.eval).resolve())
    except (OSError, ValueError) as exc:
        print("错误：无法读取评测集：%s" % exc, file=sys.stderr)
        return 1
    try:
        response = json.loads(Path(args.response).read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        print("错误：无法读取响应 %s：%s" % (args.response, exc), file=sys.stderr)
        return 1
    if not isinstance(response, dict):
        print("错误：响应必须是 JSON 对象", file=sys.stderr)
        return 1

    metrics = evaluate(eval_set, response, threshold=args.threshold)

    if not args.out:
        print(json.dumps(metrics, ensure_ascii=False, indent=2))
        return 0
    out = Path(args.out)
    if args.report in ("json", "both"):
        out.with_suffix(".json").write_text(
            json.dumps(metrics, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8")
    if args.report in ("md", "both"):
        out.with_suffix(".md").write_text(render_markdown(metrics),
                                          encoding="utf-8")
    print("评测完成：精确匹配 %s，多归属召回 %s（详见 %s.json/.md）"
          % (_fmt(metrics["exactAccuracy"]),
             _fmt(metrics["multiAssignment"]["recall"]), out))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
