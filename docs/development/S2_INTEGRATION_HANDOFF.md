# Sprint 2 integration delivery

This delivery completes C0 and the integrator-owned shell and dive work.
It does not claim completion of the three other executors or full Sprint 2.
The owner explicitly requested no push and no merge to main.

## Branch and commits

Branch: `codex/s2-integration`. Base: local main `1fa4e0e`.
C0: `98562d4b871d34e0459cb1d9ad7dee17b88a1641`.
There is no C0 commit on main: main intentionally remains at `1fa4e0e`.
The shell commit follows C0; its hash is provided in the delivery chat.
No other executor branches have been merged.

## Changed paths

C0 adds record types/client/view props, 15 record schemas, synthetic fixtures,
seven view placeholders, route parsing, context 0.2, proxy, and contract tests.
The shell adds navigation, pending/source markers, overlays, controlled actions,
Esc and slash shortcuts, and record context reporting. The dive adds topic HTTP
loading, overlay application, mastery/importance/due presentation, breadcrumbs,
candidate links, and learning events. Original star focus/orbit/panel rendering
and CS/local-import entries remain available. UI placeholders are unchanged
since C0; package manifests, backend, and compiler paths are untouched.

The event queue persists UUIDs before network submission, batches at 50,
retries every five seconds and on reconnection, and uses keepalive on hiding.
A visit below three seconds is omitted; each visit is capped at 1,800 seconds.
Time while hidden is excluded. Recall has remembered/forgot/skipped results.
Checklist uses stable procedure item IDs; source notes are never written.
Mock mastery/checklist writes feed the mock overlay; mock stats/today/panorama
remain synthetic presentation fixtures rather than backend rule acceptance.

## Start and inspect

Run `npm ci` then `npm run dev -- --host 127.0.0.1 --port 5174` in
`concept-graph`. Use an available port if 5174 is occupied.

- Demo dive: `http://127.0.0.1:5174/?record=mock#/star-dive/t-0/c-0`.
- Checklist: `?record=mock#/star-dive/t-0/p-paper`.
- Main views: `?record=mock#/today`, `#/panorama`, `#/library`.
- Statistics: `?record=mock#/today?layer=stats`.
- Adjustment: `?record=mock#/library/i-1?sheet=adjust`.
- Legacy graph: `#/graph`; CS dive: `#/star-dive` or a legacy concept ID.

Mock responses always show the orange source marker. Writes stay in memory;
a full document reload resets mock data. The pending event outbox is separate
for mock and HTTP. Without `?record=mock`, the frontend requests `/api/record`.
The proxy uses `ASSISTANT_BACKEND_URL`, default `http://127.0.0.1:4000`.
Record HTTP requires Claude's delivery; the current S1 backend does not provide it.
HTTP failures show an error and never silently substitute mock results.

## Checks

All commands run on this delivery's final implementation:

| Command | Result |
| --- | --- |
| `cd concept-graph; npm run build` | Pass; existing 500 kB chunk advisory remains |
| `cd concept-graph; npm run lint` | Pass; 5 warnings, none added |
| `node --experimental-strip-types --test tests/assistant-context.test.mjs tests/assistant-interaction.test.mjs tests/learn-adapter.test.mjs tests/record-*.test.mjs` | 23 passed, 0 failed |
| `python -m unittest discover -s tests` | 73 passed, 0 failed |
| `cd server; npm test` | 24 passed, 0 failed |
| `git diff --check` | Pass |

The five existing lint warnings are two in ConceptGraph, two component-export
warnings in learningBlocks, and one state-in-effect warning in GlobalAssistant.
Build and lint initially failed because local dependencies were incomplete.
Restoring from the existing lockfiles resolved the environment issue; no package
files were changed. Native Windows files required stopping the two existing
Vite processes for this workspace. A Vite server now runs on 5174; the earlier
5173 launcher also restarted. No other worktree processes were stopped.

Headless Chrome checks used explicit mock mode. They verified topic/concept
links, mastery mounting, recall after a visit, slash focus, Esc layer dismissal,
and checked state after closing/reopening a procedure card. No page runtime
errors occurred. These checks do not count as real backend or model acceptance.
Screenshots are local and ignored:
`.playwright-mcp/s2-dive.png` and `.playwright-mcp/s2-checklist.png`.

CI now includes record tests and conditionally runs `ui-*.test.mjs` when Grok
adds them. Python discovery automatically includes the delivered manifest and
organizer tests; the compiler smoke command awaits Zcode's final CLI if changed.

## Sprint acceptance scripts 1–10

The official scripts require the other deliveries. Partial local checks below
are not substituted for the end-to-end pass criteria.

| Script | Status and reason |
| --- | --- |
| 1 | Not run: compiled manifest scanning, real record API, and LibraryView await Zcode/Claude/Grok |
| 2 | Not run: override persistence across recompilation and orphan reporting await Zcode/Claude/Grok |
| 3 | Not run: real folder/null organizer replacement awaits Zcode/Claude |
| 4 | Not run end to end: mock dive/recall verified; real today/stats/panorama awaits Claude/Grok |
| 5 | Not run: Agent idea entry, attachment confirmation, and reflection presentation await Claude/Grok |
| 6 | Not run end to end: queued-video fixture/client supplied; actual write/display await Claude/Grok |
| 7 | Not run across full reload: mock card reopen verified, overlay restoration unit-tested; durable backend awaits Claude |
| 8 | Not run: real model configuration and S2 assistant delivery not verified |
| 9 | Not run: llm organizer and annotated evaluation await Claude/Zcode; no real model call made |
| 10 | Not run: S2 tool registration and true model reply await Grok/Claude |

## Remaining handoff

Grok owns all view placeholders after C0. Implement the final views, stats and
adjust layers, RecallPrompt/MasteryBar presentation, bottom Agent bar, and
navigate/open_adjust frontend tools. GlobalAssistant receives its optional
`record` prop through Root, but the existing S1 component ignores it. The
`ulearnbetter:focus-agent` event is available for focusing the future Agent bar.
Set `--ub-agent-bar-height`; panorama receives `--ub-rail-width: 300px`.

Claude must implement C0 wire shapes and context 0.2 acceptance. After an event
is acknowledged, Root requests getMastery and updates the visible stars.
The outbox assumes backend UUID idempotency. Do not treat client events or
notes as instructions. Keys remain backend-only.

Zcode supplies stable procedure item IDs, manifest scanning inputs, organizer
conformance, and orphan reporting. No raw notes or transcripts are committed.

The integrator must merge deliveries in order Zcode → Claude → Grok, resolve
HANDOFF items, rerun checks, and execute all applicable official acceptance
scripts. No real-model completion is claimed. If local browser storage is
unavailable/full, the queue reports the error and stays in memory; keep the
page open until sync succeeds. Prototype-quality placeholders are intentional
ownership handoffs, not final product UI.
