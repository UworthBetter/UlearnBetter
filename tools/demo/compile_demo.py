# -*- coding: utf-8 -*-
"""按 tools/demo/topics.json 把 samples/demo/notes 编译成 samples/demo/learn。

编译器就是项目的 tools/learning/notes_compile.py（--extractor annotated，
固定 --now 使结果可复现）。每个主题输出：
  samples/demo/learn/<id>/{learn.json, manifest.json}   记录层后端读取
  samples/demo/compile/<id>/{report.md, learn-ids.json} 编译报告与稳定 ID 映射
"""
from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEMO = ROOT / "samples" / "demo"


def load_topics() -> list:
    return json.loads((ROOT / "tools/demo/topics.json").read_text(encoding="utf-8"))["topics"]


def compile_topic(t: dict, out_dir: Path) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, str(ROOT / "tools/learning/notes_compile.py"),
         str(DEMO / "notes" / t["folder"] / t["name"]), "--out", str(out_dir),
         "--extractor", "annotated", "--now", t["compileAt"],
         "--schema-file", str(ROOT / "schemas/learning/learn.schema.json"), "--report", "both"],
        capture_output=True, text=True, encoding="utf-8")


def main() -> int:
    for t in load_topics():
        with tempfile.TemporaryDirectory(prefix="ub-demo-compile-") as tmp:
            res = compile_topic(t, Path(tmp))
            if res.returncode != 0:
                print(res.stdout + res.stderr, file=sys.stderr)
                return res.returncode
            print(res.stdout.splitlines()[0])
            learn = DEMO / "learn" / t["id"]
            rep = DEMO / "compile" / t["id"]
            for d in (learn, rep):
                shutil.rmtree(d, ignore_errors=True)
                d.mkdir(parents=True)
            shutil.copy(Path(tmp) / f"{t['id']}.learn.json", learn / "learn.json")
            shutil.copy(Path(tmp) / f"{t['id']}.manifest.json", learn / "manifest.json")
            shutil.copy(Path(tmp) / f"{t['id']}.report.md", rep / "report.md")
            shutil.copy(Path(tmp) / "learn-ids.json", rep / "learn-ids.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
