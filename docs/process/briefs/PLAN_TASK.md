# Task: plan "notes → interactive visual learning"
Product main line: parse video (existing tool in this repo) → generate notes with the user's note skill → turn notes into a strongly interactive visual interface (star-dive view already in concept-graph/src/star-dive).
Inputs: _notes_input/skill/ (youtube-obsidian-notes SKILL.md + templates), _notes_input/notes/ (real notes: 双均线交易系统, 趋势交易全攻略, AI量化交易系统, etc.: 课程笔记/概念卡/实操清单/术语表/时间戳).
Users learn many domains: university courses, finance, AI frontier tools; videos vary widely.
Deliver PLAN_NOTES_VIZ.md (in Chinese) covering:
1. How the existing video-parse tool in this repo connects to the note skill (find it in the repo, describe the real pipeline).
2. Mapping note structure → star map + card specs (concept cards→stars, timestamps→inline clips, checklists→steps, etc.); whether the graph should be generated from notes.
3. Generic module system review: ambiguities, gaps for finance (e.g. time-series/price overlay), university courses, AI tools; proposed small fixed template set + JSON schema changes.
4. Interaction & immersive learning flow, keeping extreme minimalism (agent input as single entry).
5. Phased implementation plan with a first pilot on 双均线交易系统 notes.
Planning only: do not modify code, do not commit, do not push.
