# -*- coding: utf-8 -*-
"""归类 CLI：learning.organize/0.1 请求 → 任意 Organizer 的响应。

用法：
    python tools/learning/organize.py --request <request.json>
        --organizer null|folder|pkg.module:Attr --out <response.json>

输出经 organizers.run_organizer 校验：非法条目丢弃并写 warnings，
被拒绝过的 (subject, goalId) 组合强制过滤。零第三方依赖。
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from organizers import load_organizer, run_organizer  # noqa: E402


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Organizer 响应生成（learning.organize/0.1）")
    ap.add_argument("--request", required=True, help="请求 JSON 路径")
    ap.add_argument("--organizer", default="null",
                    help="null | folder | pkg.module:Attr（默认 null）")
    ap.add_argument("--out", required=True, help="响应输出 JSON 路径")
    args = ap.parse_args(argv)

    request_path = Path(args.request)
    try:
        request = json.loads(request_path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        print("错误：无法读取请求 %s：%s" % (request_path, exc), file=sys.stderr)
        return 1
    if not isinstance(request, dict):
        print("错误：请求必须是 JSON 对象", file=sys.stderr)
        return 1

    try:
        organizer = load_organizer(args.organizer)
    except Exception as exc:
        print("错误：无法加载 organizer %r：%s" % (args.organizer, exc),
              file=sys.stderr)
        return 1

    try:
        response = run_organizer(organizer, request)
    except Exception as exc:
        print("错误：organizer 执行失败：%s" % exc, file=sys.stderr)
        return 1

    out_path = Path(args.out)
    if out_path.parent and str(out_path.parent):
        out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(
        json.dumps(response, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8")
    print("organizer=%s 归属 %d 条，目标提议 %d 条，想法挂载 %d 条，警告 %d 条"
          % (response["organizer"]["name"], len(response["assignments"]),
             len(response["goalProposals"]), len(response["ideaAttachments"]),
             len(response["warnings"])))
    print("输出：%s" % out_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
