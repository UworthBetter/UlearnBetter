# Task: whole-app page/UI design (owner: "现在主要的是做页面UI设计，我们现在只有一个页面")
Context: read POSITIONING.md (v2) and the current app on main (concept-graph/, the star-dive view is the only real page). Owner preferences (must follow):
- Extreme minimalism; agent input is the single entry point, fixed at bottom; rejects chat-box-centered "traditional agent tool" layouts; cards are OK.
- Product = learning-record organizing + new note-learning experience. User drops content in; agent organizes. Results adjustable but not required.
- Feature roles: star map = visualization of agent's organizing results; 总控台 = goals, progress, today's study; assistant = Q&A + "我已经帮你归类好了，要调整吗？"; notes menu = correction layer.
- Keep the existing star-dive look (dark, glass cards) as the visual language.
Deliver in /workspace/ulearn-ui/:
1. UI_PLAN.md (Chinese): information architecture (how few pages/views, how they connect), each page's purpose and layout, the empty/first-run state, navigation without clutter.
2. A clickable static HTML prototype (prototype.html, self-contained, open by double-click) covering: home/总控台, star map entry, adjust-classification flow, notes correction layer, bottom agent bar. Use realistic sample data from _notes_input notes (双均线交易系统, 趋势交易全攻略, AI量化交易系统), mark sample data as sample.
3. Screenshots of each screen (desktop 1440x900) via headless browser into /workspace/ulearn-ui/shots/.
Do not modify the app repo code, no commit, no push.

## Owner feedback on v1 prototype (2026-11-07, verbatim): 「不错的，但是没有个人学习统计，没有智能体整理学习资料，归类，给出个人学习全景图」
Update prototype.html + UI_PLAN.md (keep what works, stay minimal, no new clutter):
1. 个人学习统计: personal learning stats (time studied, concepts learned/mastered, recall accuracy, streak/heatmap, per-goal progress over time). Decide where it lives without adding page sprawl.
2. 智能体整理学习资料+归类 made visible: a materials inbox/library showing every dropped-in item (video/article/course file/idea), what the agent identified it as, which goal it was assigned to, extracted concepts, status (organizing/done/needs confirm), with the adjust flow.
3. 个人学习全景图: a personal learning panorama — one view of all goals → topics → concepts, mastery, links, gaps, and what's next; star map can be its zoomed-in layer.
Same sample-data labeling rules. No screenshots needed. No app code changes, no commit, no push.
