# Owner rulings

## 2026-11-11 — Unused code goes, not urgent but wanted

From Joel's triage of the 2026-11-11 ponytail audit of pi-omlx, on findings 7, 8 and 9, which he grouped into one card:

> "Sending those extra attributes luckily doesn't impact pi but at some point they could if pi potentially names a new key something the same."

Decided: the unused catalog metadata, debug-only code, dead branches and unused pieces go in one change, "Delete unused catalog metadata, debug code and dead branches". The card's acceptance criteria are his request: each listed piece is deleted or moved after a whole-tree grep including tests and scripts confirms no other reader; `npm run check` passes, and `/model` shows the same models with the same limits and thinking flags as before. Out of scope: the restructure Joel plans to lead after these cards.

## 2026-11-12 — Run this card

After PR #11 was ready, Janet asked "Do I squash-merge it and open the dead-code card?" Joel: "You do, conductor!"

Decided: this card runs now.

## Carried from earlier changes, still binding

> "#2 is a must address. Tests never mutate operating functionality." (archived `2026-11-11-isolate-the-suite-from-the-agent-directory/owner-rulings.md`)

> "I noticed that there is implementation in files like @src/auth-storage.ts that's solely for testing, e.g. `_setAuthPathForTesting`. For me this is a smell and if we're taking this as our own, I don't want those smells. That's gross. Let's address it." (archived `2026-11-12-remove-test-only-seams/owner-rulings.md`)

## 2026-11-12 — The singleton guard goes

Asked "Chidi measured a dual install under pi 1.5.2: a global package plus a different project-local copy runs the factory twice in one process. The same directory, or a symlink to it, is deduped by pi and loads once. Your setup has one install. Should a second copy be skipped silently, as today, or run like any other pi extension?", Joel chose "Delete the guard (Recommended)", described as: "Delete the singleton guard, its key and the shutdown clear. A second copy runs like any pi extension: the last one loaded wins the omlx registration, and you'd see two polls and possibly two warnings. That's a visible symptom of a config mistake nobody has made. Michael's lean."

Decided: the singleton guard in `index.ts`, its `Symbol.for("pi-omlx/loaded")` key and the `session_shutdown` clear are deleted. A second copy of the extension in one process runs like any other pi extension.
