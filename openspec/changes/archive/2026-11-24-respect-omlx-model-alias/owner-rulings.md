# Owner Rulings

- 2026-11-22 — Initial bug report / desired behavior:
  > "models in omlx can be given an alias. if one is present it's likely how the user prefers to refer to the model. using the alias in a /model call or in settings as the default model does not respect the alias as an override of the actual model name."

- 2026-11-22 — Ruling on `michael-orientation.md` §4 (how an alias overrides the folder name and what happens to the folder name):
  > "option 1"
  Selected Option 1 from `michael-orientation.md` §4: when a model has a non-empty alias, register the alias as the model's registered `id` in Pi, and keep the raw folder name as the fallback display label (`name`) when OMLX does not define a separate display name (`display_name`). No dual registration / virtual model entries; existing defaults or sessions saved under the raw folder name miss once after refresh. (Note: the initial gloss stated selecting the alias in `/model` updates the saved default; corrected below after R1.)

- 2026-11-22 — Correction and confirmation on Michael's `R1` (recovery path for a broken folder-name default):
  In Pi, `/model <alias>` and pressing Enter in `/model` switch only the current session (`persist: false`); only highlighting the alias row in `/model` and pressing `Ctrl+S` (set as default) or editing `settings.json` saves `defaultModel`. Until then, every start misses a folder-name default and silently opens on Claude Opus. Presented with keeping Option 1 with the `Ctrl+S` / `settings.json` recovery and no new warning, adding a startup warning, or switching to Option 3, Joel confirmed:
  > "Most definitely Option 1"

- 2026-11-23 — Ruling on the Stage 5 readiness cap (5 rounds spent; only round 5 ran the full three-lens panel and came back clean, so no two consecutive clean rounds existed). Presented with running one more full three-lens round or accepting `tasks.md` as it stands, Joel chose the extra round:
  > "1"

- 2026-11-23 — Ruling on the skipped red/green proof (the 2026-11-08 standing ruling, "Before drafting tasks, run every check a task relies on and show it go red and green", was not run before `tasks.md` was drafted). Presented with running Derek's red/green proof now (gaps go through Michael, get patched, and get one more readiness round) or waiving it for this change, Joel chose to run it:
  > "1"
