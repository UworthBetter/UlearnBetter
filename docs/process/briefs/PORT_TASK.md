Goal: integrate the "star map dive" prototype into this app's frontend as a 1:1 replica (pixel-for-pixel same visuals, layout, animations, interactions, copy, colors, fonts, behaviors).

Source prototype (read-only, do not edit it): /workspace/star-dive-proto/index.html and /workspace/star-dive-proto/data.json (+ MODULES.md if present). NOTE: another session is concurrently editing that prototype (adding a generic module system + param_demo). Port what's there now; when you finish, check mtimes again and sync any newer changes so the port matches the latest prototype.

Target: this repo's React + Vite + TypeScript app in concept-graph/. Add the star-dive as a view/route in that app (e.g. a new StarDive view or route), keeping the existing concept graph working. Load data from a JSON file in the app (copy data.json to concept-graph/src/data/star-dive.json or public/). Convert the prototype's logic into React components/hooks faithfully; it's OK to keep the canvas/SVG drawing code largely as-is inside a component if that's the most faithful way. No visual redesign.

Verification (required): build (npm install, npm run build) and serve; with headless chromium at 1440x900 take side-by-side screenshots of the prototype and the ported app in the same states (overview, a star opened, a card expanded, video clip card) to /workspace/UlearnBetter/port_shots/. Compare and fix differences until they match. Check no console errors.

Git: work on the current branch feat/star-dive-port. Commit locally with clear messages. Do NOT push and do not touch remotes. Don't commit node_modules, dist, or port_shots.
Print a short summary at the end: files added/changed, how to run, remaining differences if any.
