# Follow-up: design the GENERIC template (owner's clarification)
Owner's words (translated): "Our app can configure an LLM API and generate notes with the same workflow (the note skill). Then we need ONE generic template, and from it build visualization + interactive learning for every set of notes. The hard part is how to make one generic template for notes of totally different content."

So: drop the two open questions in PLAN_NOTES_VIZ.md — no Windows vault sync (the app generates notes itself via the configured LLM API), no hand-written pilot cards (everything is generated).

Think hard about the generic template. Starting idea to challenge/improve, not to accept blindly:
- Design by knowledge SHAPE, not subject: definition, process, comparison, variation (param/time series), operation checklist, recall. Each shape = one fixed renderer.
- The note skill's generation step outputs a structured intermediate format alongside the markdown: each concept tagged with a shape and filled JSON for that shape. The UI only reads this format.
- Validation + fallback: invalid/missing data -> definition card + source clip, so any content renders.

Deliver GENERIC_TEMPLATE.md (Chinese):
1. Is the shape list complete and non-overlapping? Rules the LLM uses to pick a shape; ambiguous cases.
2. The intermediate format (schema), and how the note skill/prompt must change to emit it; how it stays grounded in the video/notes.
3. How the whole-topic layer is generic too (star map layout, relations, learning path), not just per-concept cards.
4. Stress test on paper against three very different note sets: _notes_input/notes 双均线交易系统 (finance), AI量化交易系统 (AI tools), and one university course (make up a realistic sample, e.g. linear algebra or microeconomics, clearly marked as a hypothetical example). Show concrete JSON for 2-3 concepts each, and list where the template breaks.
5. Update PLAN_NOTES_VIZ.md phases accordingly.
Planning only: no code changes, no commit, no push.
