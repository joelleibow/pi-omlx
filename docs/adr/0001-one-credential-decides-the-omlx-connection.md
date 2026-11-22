# 0001 One credential decides the OMLX connection

**Status:** Superseded by [0002](0002-the-credential-resolution-runs-in-pi-hooks.md)

## Context

Pi resolves a provider's credential itself: a stored credential first, a configured API key second, nothing else. An extension cannot ask which credential pi will use, and it cannot change pi's answer. The extension therefore keeps its own view of the same connection, and the two views can disagree.

They did. The extension preferred an exported API key over the saved login, while pi preferred the saved login, so an exported key could point the model list at one server and leave chat on another, or pair one key with another's server, and chat failed. Joel ruled the split a must-fix, and then ruled that the saved login wins.

Three forces bound the answer. A stored credential is readable from the extension and never writable; storing a login is pi's job. Pi merges a re-registration over the previous one and skips omitted fields, so a registration that leaves a field out inherits it. And the only route to a server that needs no key is a login whose key is empty, because pi will not treat an unauthenticated provider as configured with nothing stored.

## Decision

One credential decides the OMLX base URL, the API key and keyless-ness, for the model catalog and for the provider registration alike. It is the stored `omlx` credential when one exists, and `OMLX_BASE_URL` with `OMLX_API_KEY` only when none does.

The resolution is the extension's own, in one place under `src/`, because pi's answer is not readable at the moments that matter. It restates pi's order deliberately and carries a comment naming that mirror, to be re-checked when the pi version moves. `OMLX_BASE_URL` alone is not a configuration: with no key and no saved login the provider stays login-only. A keyless server is reached by logging in with an empty key. A registration that omits the key first clears the previous registration, so nothing is inherited.

Changing this record's mind means changing which credential wins, not where the code lives.

## Consequences

Both halves of the connection come from one credential, so the catalog and chat cannot address different servers or carry different keys.

A saved login now outranks the environment, so a key exported in a shell no longer reaches a shell that has a login saved, and `/logout` is how a key is used. The documentation's older promise that `OMLX_API_KEY` overrides a stored login is withdrawn, because it was never true for chat.

The extension's resolution is a copy of pi's and drifts when pi changes its order; the naming comment and a test per case are what catch that, and neither is a guarantee. A stored `api_key` whose key is a template or a command is interpolated by pi for requests and used verbatim for the catalog fetch, which predates this record and remains. Each keyless registration costs an extra pair of cache-only refreshes, measured as immaterial.
