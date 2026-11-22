# 0002 The credential resolution runs in Pi's hooks

**Status:** Accepted

## Context

Pi's provider contract now carries an API-key login with hooks Pi calls at the moments that matter: `check` answers whether the provider is configured, and `resolve` answers with the credential a request uses. Both receive the stored credential and the environment, so Pi's answer is readable where the decision is made.

ADR 0001 was written against the opposite fact. It said Pi's answer was not readable at those moments, so the extension kept its own resolution as a deliberate copy of Pi's order, with a comment naming the mirror and a test per case to catch drift. That premise is gone, and with it the reason to keep a second copy of an order Pi now applies on our behalf.

Two of ADR 0001's other premises went too. Pi merges a legacy registration over the previous one, which made a keyless registration able to inherit a key; a native provider is registered once and its models are published instead. And a stored credential of the old OAuth shape is no longer a credential Pi will read for a provider with no OAuth handler.

## Decision

The base URL, the API key and keyless-ness are resolved inside the provider's own `check` and `resolve` hooks, from the credential Pi supplies or, only when Pi supplies none, from the environment. That is the order ADR 0001 fixed, carried forward unchanged: a saved login wins, the environment applies only when nothing is saved, and a keyless server is reached by a login with an empty key rather than by an environment variable.

`check` answers only whether the provider is configured, because Pi's contract makes it side-effect free. `resolve` answers with the credential a request carries, and the catalog refresh and chat requests both take their URL and key from that one answer, so neither can address a different server. A stored credential with no key resolves to a placeholder bearer.

## Consequences

The extension holds no copy of Pi's order, so a Pi upgrade can no longer make the two disagree. The hooks are the order; the tests pin the answer this provider gives inside them. The mirror comment and the test-per-case drift guard went with the copy.

A saved login of the old OAuth shape stops working. Pi reports a provider with no OAuth handler as unconfigured, so the extension resolves nothing from that entry, never reads it as a login and never rewrites it; the user runs `/logout` and then `/login`, and the new login overwrites the entry. The replacement needs no migration code: a login asks for a base URL and an optional key, and Pi stores what it returns.

ADR 0001's rule that a keyless registration first clears the previous one no longer applies. The provider is registered once and publishes its models, so keyless-ness is a property of one resolution rather than of a registration shape.

A keyless login puts `Authorization: Bearer local` on the wire. A placeholder is what keeps the OpenAI-completions client from throwing on an empty key, Pi's own keyless provider sends the same one, and a server running with `skip_api_key_verification` on a loopback bind ignores it.

Env-only keyless stays unsupported, as ADR 0001 left it: with nothing saved, a base URL and no key configures nothing.
