# Task: split Sprint 2 (implement the approved UI prototype) across 4 agents
Owner approved /workspace/ulearn-ui/prototype.html + UI_PLAN.md (今日 / 全景 / 资料, stats, panorama, materials organizing, bottom agent bar, adjust/correction layer) and POSITIONING.md v2. Owner: "让Claude分一下工，还是4个agent同时开工搞".
Follow the SAME structure as docs/development/SPRINT_01.md, AGENTS.md and docs/development/tasks/* on main: same 4 executors, branches and worktrees pattern:
- GPT/Codex: integrator, contracts, routing, shell, final integration (D:/haikesong2)
- Claude Code: server/** + tests/server/** (D:/haikesong2-worktrees/claude-backend)
- Grok Build: frontend UI components (D:/haikesong2-worktrees/grok-ui)
- Zcode: notes compiler / learning data (D:/haikesong2-worktrees/zcode-notes)
Write: docs/development/SPRINT_02.md (goals, boundaries, file ownership table with non-overlapping paths, contract changes the integrator must land FIRST so others can work in parallel, acceptance order), and docs/development/tasks/{CODEX_INTEGRATION,CLAUDE_BACKEND,GROK_UI,ZCODE_NOTES}_S2.md, each self-contained (read-first list, scope, exact files, interfaces/mock contracts to code against, tests, deliverable report format: commit/start/tests/unfinished, never merge or push). Include stats, materials inbox+organizer interface (reuse existing classifiers per POSITIONING §4), panorama, today plan, recall events, overrides layer.
Copy the prototype into docs/reference/ui-prototype-v2.html and UI_PLAN.md as docs/reference/UI_PLAN_v2.md.
Work on a new branch codex/sprint-02-plan from main; commit locally; do NOT push. Report commit hash and file list.
