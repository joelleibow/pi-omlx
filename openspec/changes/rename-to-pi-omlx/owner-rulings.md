# Owner rulings

## 2026-11-11 — The package is pi-omlx

> "I'm going to start treating this repo as our own project. To start, I want to rename it to pi-omlx since that's really what it's doing, allowing access to omlx models through an omlx provider that you authenticate. It handles model aggregation from the omlx server once the provider is authenticated. Calling it "picker" feels incorrect."

Decided: the package is renamed from pi-omlx-picker to pi-omlx.

## 2026-11-11 — Where pi-omlx lives

Asked where the repository should live, Joel chose: "Standalone joelleibow/pi-omlx (Recommended)", the option described as "A new repo of yours that keeps upstream's history; origin points to it and PeachlifeAB becomes `upstream`."

Decided: the code lives in a standalone GitHub repository, joelleibow/pi-omlx, with PeachlifeAB/pi-omlx-picker kept as the `upstream` remote.

## 2026-11-11 — The clone directory and pi's packages entry

Asked who changes the `packages` path in `~/.pi/agent/settings.json` (a symlink to dotfiles `home/dot_pi/private_agent/settings.json`, which holds his uncommitted edits) when `~/Projects/pi-omlx-picker` becomes `~/Projects/pi-omlx`, Joel answered: "I'll edit it", the option described as "The change moves the directory and stops; pi won't load the package until you update the path."

Decided: the clone directory is renamed to `~/Projects/pi-omlx`; Joel edits the `packages` entry himself.

## 2026-11-11 — Repository visibility and the npm name (PL2)

Asked whether `joelleibow/pi-omlx` should be public, Joel answered: "#1 but I'm not ready to publish it just yet so let's keep it local for now. Maybe just do what we need to do to get it reserved and then we'll find our tie in the future to actually publish it." Asked which reading he meant, given that npm holds a name only through a published version, he chose "Public repo, claim npm name now", described as: "Make the GitHub repo public now. The npm name gets claimed now with the same do-nothing `0.0.0-alpha` stub, published by you. The real release comes later."

Decided: the GitHub repository becomes public. The npm name `pi-omlx` is claimed now with a do-nothing `0.0.0-alpha` stub, the way pi-jefferson claimed its name, and Joel publishes it himself. The real release is not part of this change.

## 2026-11-11 — LICENSE (PL2)

Asked whether LICENSE gains a copyright line for him, Joel chose: "Leave it as is (Recommended)".

Decided: LICENSE is unchanged.
