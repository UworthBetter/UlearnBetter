# Sprint 2 integrated delivery

The compiler, record backend, views, Agent bar, and star dive are integrated
on `codex/s2-integration`. The no-model acceptance scripts 1–7 pass with
compiled synthetic notes and the real local record API. Nothing in this
delivery is merged to main or pushed.

## Branch, base, and commits

The branch starts from local main `1fa4e0e`. C0 remains
`98562d4b871d34e0459cb1d9ad7dee17b88a1641`; there is no C0 commit on main.
Main still points to `1fa4e0e`, as requested by the owner.
The implementation and integration fixes are committed at
`f3d624f2a18118e524c2acd26198bf03b66ae855`; this report follows in a docs commit.

The deliveries were merged in the required order without rewriting history:

| Delivery | Source commit | Merge commit |
| --- | --- | --- |
| `codex/s2-notes` (Zcode) | `70ade721f278b3e892635a550cef31893992fe41` | `8b75b07` |
| `origin/codex/s2-backend` (Claude) | `2f64913bb074b168698ab863014925155b0413b0` | `edceeec` |
| `codex/s2-ui` (Grok) | `6157c728ffcc38fb25a925fe6da056f7a04ed9dd` | `11af2dd` |

No merge conflicts occurred. Each source branch stays intact.

## Changes by directory

The integrated delivery includes the following changes:

- `tools/learning`, `schemas/learning`, `samples/organize-eval`: stable IDs,
  manifests, read-only orphan reports, organizers, and synthetic evaluation.
- `server/src/record`: local decision storage, organizer implementations,
  overlay, deterministic mastery/today/stats/panorama, and record HTTP routes.
- `concept-graph/src/views`, `assistant/ui`: today, statistics, library/detail,
  adjustment, panorama, recall/mastery components, and the persistent Agent bar.
- `concept-graph/src/record`, `shell`, `star-dive`, `Root.tsx`: C0 client/types,
  routing, shared scene context, HTTP topic loading, overlay presentation,
  durable event outbox, checklist restoration, and recall submission.
- `schemas/record`, `samples/record`, `tests`, `.github`, `docs`: executable
  contracts, synthetic fixtures, regression checks, CI, and delivery records.

## Integration fixes

C0.1 permits a null manifest importanceHint when evidence is absent. The
compiler now blocks publishing any schema-invalid manifest. The smallest
visual star size is a neutral display fallback, not a generated importance
judgment.

C0.2 adds optional TopicOverlay ideas and Panorama relations. Effective
attachments and reflection text appear in “我的思考” without changing compiled
learn content. Compiled or explicitly confirmed relations render solid.
Unconfirmed candidates render dashed. Rejected candidates are not regenerated
from labels in the layout or adjustment sheet.

The HTTP client consistently sends the browser IANA timezone. Source markers
observe every response; HTTP failures never silently switch to mock.
Shell context survives replacement of the CS scene by a record topic. Shared
plans/statistics remain available when a view reports its local selection.
Record writes refresh views and the pending indicator. The shell owns the
332px panorama rail variable shared with the Agent bar.

Other fixes cover saving changed membership on an already organized item,
reporting write failures, using the organizer log for its displayed identity,
disabling video reorganization, and naming the idea selector accessibly.
The concept menu explicitly says “改所属资料归属”: membership is changed at
the item/topic level.

Procedure nodes record visits and checklist events, but do not emit invalid
concept-only recall events. Queued writes preserve UUIDs across retries.
Scene teardown preserves the shell's record context. Windows boundary tests
use directory junctions, retaining the original escape assertion.

CORS now honors ASSISTANT_ALLOWED_ORIGINS even with no model provider and
allows PATCH preflights. This fixed a real browser write rejection discovered
on the separate acceptance port.

## Start and inspect

A local acceptance instance is running at `http://127.0.0.1:5184/#/today`.
It uses three synthetic compiled topics, real record storage, folder organizing,
and no configured model. The model-unavailable indicator is expected.

The temporary acceptance directory is:
`C:/Users/admin/AppData/Local/Temp/ulearnbetter-s2-accept-kh5sbdy_`.
It contains the disposable note copies, compiled artifacts, record files, and
`acceptance-api.json`. It is outside the repository and is not committed.

To restart the same data, run in `server` (PowerShell):

```powershell
$stage = 'C:/Users/admin/AppData/Local/Temp/ulearnbetter-s2-accept-kh5sbdy_'
$env:RECORD_LEARN_DIR = Join-Path $stage 'learn'
$env:RECORD_DATA_DIR = Join-Path $stage 'record'
$env:RECORD_ORGANIZER = 'folder'
$env:ASSISTANT_ALLOWED_ORIGINS = 'http://127.0.0.1:5184'
$env:PORT = '4012'
npm start
```

Run separately in `concept-graph`:

```powershell
$env:ASSISTANT_BACKEND_URL = 'http://127.0.0.1:4012'
npm run dev -- --host 127.0.0.1 --port 5184 --strictPort
```

Use free ports or stop the already running acceptance instances first. Fresh
installations use `npm ci` in both package directories. For other note sets,
compile with notes_compile.py, then place `<topicId>.learn.json` and
`<topicId>.manifest.json` as `learn.json` and `manifest.json` under
`RECORD_LEARN_DIR/<topicId>/`. Keep note inputs and record files outside git.

`?record=mock#/dev/views` or `#/dev/views` provides the synthetic UI preview.
Explicit `?record=mock` uses the memory client; full reload resets those mock
writes. Normal routes use HTTP. The earlier 5174 frontend remains a separate
preview process; 5184 is the integrated acceptance instance.

## Checks

All applicable checks pass on the final implementation:

| Check | Result |
| --- | --- |
| `cd concept-graph; npm run build` | Pass |
| `cd concept-graph; npm run lint` | Pass |
| `node --experimental-strip-types --test tests/assistant-context.test.mjs tests/assistant-interaction.test.mjs tests/learn-adapter.test.mjs tests/record-*.test.mjs tests/ui-*.test.mjs` | 36 passed, 0 failed |
| `python -m unittest discover -s tests` | 102 passed, 0 failed |
| `cd server; npm test` | 69 passed, 0 failed |
| Folder organizer conformance fixture | Exact match to folder.expected.json |
| Compiled manifest validation | All three generated manifests valid |
| `git diff --check` | Pass |

After Zcode: build/lint, Node 23, Python 101, backend 24 passed.
After Claude: build/lint, Node 23, Python 101 passed; backend passed 66 after
fixing Windows symlink test portability. After Grok: build/lint and Node 32
passed; final checks above include all integration repairs and added coverage.

CI runs record and UI tests, validates generated manifests, and checks the
folder organizer fixture explicitly. No new dependencies were needed for
integration repairs; Claude's declared packages were restored from its lockfile.

## Acceptance scripts 1–7

The following results use synthetic source notes compiled by the real Python
compiler and actual local HTTP requests. The browser ran headless Chrome at
1440×900. No record responses were intercepted or replaced by a mock server.

| Script | Result and evidence |
| --- | --- |
| 1 | Pass: 3 compiled topics scanned; library shows identity/pipeline/membership; folder label says no model called |
| 2 | Pass: shared membership survived two recompilations; UI changed membership on an organized item and it survived reload and another published recompilation; deleted renamed concept appears orphaned in compiler report and library |
| 3 | Pass: a persisted copy of the real store was reopened with null and then folder organizers; reorganization preserved the user-confirmed membership |
| 4 | Pass: API and browser each completed recalls on 3 stars; API mastery and panorama showed recalled levels, stats reflected the events, and today entries retained factual why fields |
| 5 | Pass: Agent bar saved an idea; library displayed pending; user selected a concept and attached it; item became done and the thought card appeared in dive; pending count refreshed |
| 6 | Pass: Agent video input requested confirmation; after clicking Join, library displayed queued and “本轮不自动解析”, without invented identity content |
| 7 | Pass: a checklist survived a service reopen and full browser reload; original repository sample note SHA-256 values remained unchanged |

Additional browser checks verified that rejected relations stay absent after
reload, Esc closes the adjustment layer, the statistics layer and panorama
load, and the goal breadcrumb survives CS-to-record scene replacement.
Successful final browser runs reported no page runtime errors.

Screenshots are local and ignored in `.playwright-mcp/`:

- `s2-real-library.png`
- `s2-real-checklist.png`
- `s2-real-thought.png`
- `s2-real-final-dive.png`
- `s2-real-panorama.png`
- `s2-real-stats.png`
- `s2-real-adjust.png`

## Repository hygiene

Temporary acceptance files and screenshots are not part of the commit. No
user's note library, transcripts, chat logs, local configuration, or keys are
committed. Main and remote branches are unchanged by this integration run.
