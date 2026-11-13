# Council pass 3: matt (council-matt, run 82f1a051-e2ae-40ca-bd0c-686afb0e62de)

## C2: owner-decision

**The evidence no longer decides this.** It comes down to one product choice: should a login save while oMLX is unreachable? My pick is that it should, with no probe. Removing the probe is a behaviour change and must be named as one, because `test/oauth-login.test.ts` changes.

The arguments, one by one:

- **(g) is now answered.** After a login, pi refreshes straight away and shows its own failure warning in the TUI (ebf305b8 Q2, Q3). On later starts, the configured-but-empty `session_start` warning agreed in C1 names the fallback. So a mistyped URL is never silent. That was the main reason I gave for probing, and it no longer holds.
- **(e) still holds, but it does not decide.** Today's test pins a validating login, and no ruling removes it. So dropping the probe is Joel's choice, not something the design can do silently.
- **(b) holds.** Today's login fetched to register the catalog under a premise that is false on 1.5.2 (trap ii). It was not there to validate. The test pins a side effect of that premise.
- **(f) is weak.** llama's validation is one provider's choice, not a pi contract. Q1 shows no platform rule requiring it.
- **(a) is real but minor.** With a probe, "A failed refresh keeps the credential" can only happen when the server fails between the login and the refresh. It can still be tested, but the spec reads more naturally without a probe.
- **(c) I reject as stated.** A probe could call the same pure function `resolve` uses on the credential it is about to return, so it would not open a second resolution path. It is still an extra request whose only consumer is the login's own failure.
- **(h) I accept.** A validation that publishes nothing is consistent with the spec.

The cost of my pick is that a typo is stored until the user runs `/login` again, which overwrites the entry (Q5).

Sources: research-chidi.md addendum ebf305b8 Q2, Q3; research-chidi.md Q1, Q2, Q5; michael-orientation.md trap ii; research-eleanor.md Tests (test/oauth-login.test.ts); specs/native-login/spec.md 'The Login Leaves The Catalog To Pi'

## Recommendation changed: True

My pick moves from probing to not probing. What moved it: the empty-catalog `session_start` warning agreed in C1, together with pi's immediate warning after login (ebf305b8 Q3). Those two remove the silent failure that was my main argument for the probe.

## Out-of-scope findings

None
