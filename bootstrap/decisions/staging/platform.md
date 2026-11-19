## 2026-11-19: Production deploys only from main; staging only from a manual run

**Decision.** A merge to `main` deploys production, and nothing else does: a guard step fails the deploy job if the target is production for anything but a push to `main`. Staging changes only when the deploy workflow is run by hand on a chosen branch; pushing a branch deploys nothing. Agents start that manual run only when the owner asks for it in that session, then wait until it is live and say so.

**Reasoning.** When every push deployed staging, parallel sessions took turns overwriting it and it was unclear what the owner was testing. The owner wants to decide what is on staging; a guard step keeps a manual run from ever reaching production.

## 2026-11-19: Dev tools exist only in staging and fail closed

**Decision.** Dev routes and the dev panel are switched on by one runtime variable that is on only in the staging config, and a test pins it off in production; with it off, every dev route answers a plain 404 before any other check, at every layer. The panel's code is a separate chunk left out of the production build, and a build test checks production output has none of it. Dev tools are for the owner and admins only and fail closed when that cannot be checked.

**Reasoning.** Tools that set state for testing are dangerous in production. Checking first at each layer means the gate holds even if one layer is bypassed, and a build test proves production users never download the code.

## 2026-11-19: Large reworks run behind a staging-only flag

**Decision.** A large rework is built behind a runtime flag that is on in staging and pinned off in production by a test. Anything long-lived (a run, a period, a stored job) records which rules version it started under, and the client follows that stored version, not the flag. The flag is read only when something starts.

**Reasoning.** Storing the version at the start means a flag flip never changes work already under way, and old records still replay under their own rules. The rework can merge to `main` early without changing production.

## 2026-11-19: Destructive one-off operations are built inert

**Decision.** A destructive one-off (a data wipe, a bulk migration, a reset) merges with nothing in production able to call it, and staging gets a read-only dry run. The wipe refuses to run without proof that the backup step succeeded for the same data, and a test scans the source so no route, timer or tool can reach it unnoticed. The release that turns it on is a small, explicit wiring PR that must also change that test.

**Reasoning.** The owner wants to review such work on staging before it can touch real users. Making "back up first, then wipe" a property of the code, not of whoever triggers it, means a mistake in the trigger cannot lose data.
