# Direction and process

Priorities, how the owner and agents work, naming and tone.

<!-- Maintained with `node scripts/decisions.mjs`; see README.md. Newest first. -->

## 2026-11-19: Agents commit as the owner **[{{OWNER_NAME}}]**

ID: `2026-11-19-agents-commit-as-the-owner` · Status: current · Amends: `2026-11-19-squash-merges-only-the-pr-title`

**Decision.** Agents' commits are authored as the owner: a SessionStart hook sets the checkout's `user.name` and `user.email` to the owner's GitHub login and no-reply address (`owner.commitEmail` in `project.config.json`). Commit messages and PR descriptions carry no `Co-Authored-By:` or other trailers.

**Reasoning.** GitHub adds a `Co-authored-by:` line to a squash commit for every branch commit author other than the person merging and for every co-author trailer, and no setting turns that off. The owner wants the history on `main` to be the PR title and description only, and accepts that commits no longer show which were agent-made.

## 2026-11-19: Squash merges only; the PR title and description are the commit

ID: `2026-11-19-squash-merges-only-the-pr-title` · Status: current, amended by `2026-11-19-agents-commit-as-the-owner`

**Decision.** The repository allows only squash merges, and a squash takes the PR title as the commit title and the PR description as the commit body (`scripts/github-setup.mjs` sets both). So agents write the title and description as a commit message for history: what changed and why, as short as the change allows, with no test steps, check reports, review notes, generated-by footers or `Co-Authored-By:` trailers. Anything only needed before the merge goes to the owner in chat, or in a PR comment.

**Reasoning.** The owner merges agents' PRs but already knows what was done from the session, so long descriptions went unread, and GitHub's default squash message is a list of every branch commit. One concise commit per PR keeps `git log` on `main` readable as a list of features and fixes.

## 2026-11-19: Agents make small calls themselves; the owner keeps the large direction

ID: `2026-11-19-agents-make-small-calls-themselves-the` · Status: current

**Decision.** When unsure about a number or a small design detail, an agent takes its best pick, records it, and lists it for the owner to glance at later instead of waiting. Each tunable value lives in one place, so a change the owner wants is one edit. Questions before acting are only for the large direction: a new system, a new rule users must learn, the identity of a feature.

**Reasoning.** Waiting on the owner for every small call stalls work for hours, while a value kept in one place is cheap to change the next morning. The owner wants fewer decisions to make, not less control over where the project goes.

## 2026-11-19: Open questions go in one numbered list, asked once

ID: `2026-11-19-open-questions-go-in-one-numbered` · Status: current

**Decision.** Questions for the owner live in one current numbered list. Each item has one line of context and the agent's own pick. A question is asked once: later status messages say what changed and end with a short summary line, and they do not repeat the question unless something new needs an answer.

**Reasoning.** Questions spread over several messages and lists got lost, and the owner had to ask for them again. The same question repeated on every notification is noise on a phone.

## 2026-11-19: Unattended sessions stay quiet until there is news

ID: `2026-11-19-unattended-sessions-stay-quiet-until-there` · Status: current

**Decision.** In overnight or unattended sessions, agents send no message for a CI check or a routine notification. When every background job has finished and nothing is left but waiting, they send one message with every open question, numbered, each with a line of context and the agent's pick. The questions go in the message itself, not only in a repo file.

**Reasoning.** The owner reads on a phone and cannot open repo files there, so a question that lives only in a doc is not seen. Per-check messages wake the owner for nothing.

## 2026-11-19: Reviewers weigh suggestions against the owner's standing priorities

ID: `2026-11-19-reviewers-weigh-suggestions-against-the-owner` · Status: current

**Decision.** The project keeps a short review brief of the owner's standing priorities for UX, UI and visual work, and every review agent gets it in its prompt. A reviewer says which priority each suggestion supports or trades against. A suggestion that trades against one goes to the owner as a choice; it is never applied as the new default.

**Reasoning.** A review panel's pick once became the default and undid something the owner cared about most, which cost a redirect. Reviewers do not know the owner's taste unless it is written down and handed to them.

## 2026-11-19: No change reaches the owner read only by its author

ID: `2026-11-19-no-change-reaches-the-owner-read` · Status: current

**Decision.** The lead agent plans, delegates and reviews every change before it goes into a PR. The lead may write a small fix itself only when it can test it end to end, and then a second agent, told to review only and make no edits, reads the diff before the PR.

**Reasoning.** The owner does not read code, so review by an agent is the only review there is. A fast lead-written fix once reached a PR with no second reader.

## 2026-11-19: Delegated UI work comes back with a reuse list, and review checks it

ID: `2026-11-19-delegated-ui-work-comes-back-with` · Status: current

**Decision.** An implementer's report for UI work lists each visible part and which shared component or pattern it uses, or "new, because ...". The reviewer goes through the list and, for each new part, names the shared component it should use or writes down why none fits. "Nothing fits" from an implementer is a claim to check, not an answer.

**Reasoning.** Duplicate pickers, rows and controls got past review because the report hid them in a long list and review accepted "no pattern fits" without looking. A reuse list makes the miss visible before the owner finds it.

## 2026-11-19: Parallel implementers each work in their own worktree

ID: `2026-11-19-parallel-implementers-each-work-in-their` · Status: current

**Decision.** When several implementer agents run at once, each works in its own git worktree, never in the lead's working tree. The lead reviews each branch and merges it into the session branch, then removes the worktrees whose work is merged with the cleanup script.

**Reasoning.** Two agents editing one tree broke each other's runs, dropped edits and left the lead's tree dirty. Worktrees with commits are not removed on their own, and one session left 16 of them (about 900 MB).

## 2026-11-19: Every implementer brief carries the same standing block

ID: `2026-11-19-every-implementer-brief-carries-the-same` · Status: current

**Decision.** Every implementer brief says: start by resetting to the session branch (a worktree may start from `main`); use the migration number the lead assigns; never hand-edit generated or captured files; run long checks as a background job that writes a log and wait on the log; work only inside your worktree with absolute paths; never use a bare `git stash`; commit on your worktree branch only when asked, never push; and stop and report rather than loosen a threshold to make a check pass.

**Reasoning.** Each line removes a failure seen in practice: an agent built on `main`, two agents took the same migration number, hand-edited fixtures drifted, foreground checks were killed by tool timeouts, a `cd` edited the lead's tree, and the stash stack is shared by every worktree.

## 2026-11-19: Batch finished work into few PRs, merged in a fixed order

ID: `2026-11-19-batch-finished-work-into-few-prs` · Status: current

**Decision.** Agents may use several local branches, but they merge finished work together and open one PR where they can. Large PRs are fine as long as each commit is one coherent change. When several long sessions run at once, one coordinating session keeps a single board of what needs the owner and a fixed merge order; after each merge the next branch merges `main` and resolves its conflicts before the owner sees it.

**Reasoning.** Only the owner merges, so every PR is manual work for them. With several sessions and no shared picture, the owner lost track of what each was doing and which PR to merge next, and open branches stopped merging cleanly with each other.

## 2026-11-19: Work for a long-running feature branch goes onto that branch

ID: `2026-11-19-work-for-a-long-running-feature` · Status: current

**Decision.** Supporting work for a large feature that lives on its own branch (art, data, a sub-feature) goes onto a branch cut from the feature branch and is merged there. It reaches `main` with the feature's own PR, not as separate PRs to `main`.

**Reasoning.** Separate PRs to `main` each waited on a merge before the feature branch could use them, and one was merged while more work was still being added to it.

## 2026-11-19: Ship a rework in quick small steps and tune at the end

ID: `2026-11-19-ship-a-rework-in-quick-small` · Status: current

**Decision.** A large rework ships as a quick series of PRs, not as one long-lived release. Interim states that feel off between two steps are acceptable. Tuning and polish passes happen once the pieces are in place, aimed at the final state.

**Reasoning.** Tuning each interim state is wasted work, because the next step changes it again. Small steps keep each PR reviewable and keep branches from drifting apart.

## 2026-11-19: Before a stable release, production may change freely; data wipes are the owner's call

ID: `2026-11-19-before-a-stable-release-production-may` · Status: current

**Decision.** While the project is in development, users are told that things may change and data may be reset, and features ship when ready. Existing user data does not hold back a change; a fair migration is enough. Agents never wipe or reset production data on their own: that is always the owner's call.

**Reasoning.** Protecting every old record slows progress when the user base is small and knows the project is early. A wipe cannot be undone, so it needs an explicit human decision.

## 2026-11-19: The lead agent owns the look and brings real choices

ID: `2026-11-19-the-lead-agent-owns-the-look` · Status: current

**Decision.** The lead agent keeps the visual direction consistent: it briefs the agents that make visual work, reviews every piece before the owner sees it, and sends back what does not work. Where the direction is open, the owner gets real variants side by side, not a single draft.

**Reasoning.** The owner reviews visuals rather than making them. One owner of the standard keeps the product looking like one product, and variants side by side are quicker to answer than a draft followed by rounds of notes.

## 2026-11-19: UI work is shown at a phone width and a desktop width, every round

ID: `2026-11-19-ui-work-is-shown-at-a` · Status: current

**Decision.** Every screenshot round of UI work includes a phone width (390 px, and 360 px for tight spots) and a desktop width (1100 px). Before sending, the agent looks at its own screenshots for polish, not only for the fix: spacing, edge alignment, cut-off text and pictures shrunk out of shape. Every way into a changed flow is shot, not only the main one.

**Reasoning.** The owner had to ask for desktop shots in two sessions in a row, and found spacing bugs in the agent's own screenshot. Screenshots of only the main entry point missed a duplicate part reached from a second entry.

## 2026-11-19: Screenshots that belong together form one labelled sheet, and every picture enlarges on tap

ID: `2026-11-19-screenshots-that-belong-together-form-one` · Status: current

**Decision.** Screenshots of one flow (its steps from the first interaction on) or of one view at two widths go in one labelled, numbered image; unrelated things get separate images. On any page made for the owner's review, every picture opens at full size on tap or click and closes again, on a phone too.

**Reasoning.** The owner reviews on a phone, where loose screenshots are hard to compare and small ones are unreadable. A labelled sheet shows the order and the context at a glance.

## 2026-11-19: A polish night starts with read-only audits

ID: `2026-11-19-a-polish-night-starts-with-read` · Status: current

**Decision.** A cleanup or polish session starts with read-only audits (server, UI at phone and desktop widths, frontend code, backend code, tooling and docs, tests and CI). Clear fixes are made and recorded as decisions. Every call that is not a clear fix goes to the owner on one decision page and is not built.

**Reasoning.** Audits first give the session a full picture before anything changes, and keep fixes from colliding. Separating clear fixes from judgement calls lets the session run unattended without making the owner's decisions for them.

## 2026-11-19: Retros turn friction into proposals; procedures become skills

ID: `2026-11-19-retros-turn-friction-into-proposals-procedures` · Status: current

**Decision.** After a large session, a retro lists where the owner had to step in, other friction, and a table of proposals (change, where it goes, what it would have prevented). The owner accepts or drops each proposal, and accepted ones are applied in the same PR. A procedure that agents repeat is kept as a skill so it is not reinvented each time.

**Reasoning.** Most lasting improvements to how agents work came from retros. Writing the "would have prevented" column forces each proposal to point at a real cost, and a skill makes the fix stick across sessions.
