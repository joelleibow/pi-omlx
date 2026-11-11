# Council — neil, pass 3

Run `2396fd37-f3e0-40d3-a0cc-fda7cca12ed9`.

## Responses

- **P1** — accept. Michael verified git grep -ni matches all 22 old-name lines plus package.json's 'picker' keyword and pickerDebug, with no false positives in package-lock.json. Because Symbol.for('pi-omlx/loaded') is process-local and unpersisted (trap b), pinning its exact string in specs/ fails the deletion test once index.ts exports the symbol for test/index.test.ts. Keeping Package Name Is pi-omlx (with npm pack --dry-run) plus (1) the non-Markdown case-insensitive git grep check outside openspec/ and (2) the scripts dead-probe removal requirement covers every code change with minimal spec surface. (michael-orientation.md §1, trap b, trap c; research-eleanor.md (Old name occurrences, Addendum 1); specs/package-identity/spec.md)
- **P2** — reject. First, 'a task only Joel can observe' in PL7 is for effects code tests cannot observe (like Joel's R3 settings.json edit), not for extension registration: auth.json on this machine has no omlx entry today (michael-orientation.md §1), so P2 manufactures manual live-server login/session toil for Joel to verify pi's own host runtime (which PL7/Implementation Gate forbid testing as library behavior). Second, specs/provider-access/spec.md explicitly requires 'The extension SHALL register its provider under the id omlx'; testing only auth-storage leaves vitest green if index.ts/src/provider.ts registers 'pi-omlx' while PROVIDER_KEY stays 'omlx', breaking /login omlx and omlx/<modelId>. Keep two automated extension-boundary scenarios (provider registration id 'omlx' in test/index.test.ts and credential key 'omlx' in test/auth-storage.test.ts) and drop the pi-host manual scenarios. (specs/provider-access/spec.md; michael-orientation.md §1; research-chidi.md Q1.5, Q2.1-Q2.5; michael-the-architect.md (PL4, PL7, Implementation gate))

## Recommendation changed

Yes: Moved on P1 only: michael-orientation.md trap b (the singleton symbol is process-local and unpersisted) and §1 (case-insensitive git grep hits every mapped old-name/picker token with zero false positives) justify replacing separate keyword/singleton/helper spec clauses with the single non-Markdown git grep requirement alongside existing Package Name Is pi-omlx and the scripts dead-probe requirement. Held firm against P2.

## Out of scope findings

None
