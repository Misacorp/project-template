# Design decisions

This folder holds the project's design decisions, one file per topic. Read this index first, then only the topic file or files your work touches. The index lists only the entries in force.

## How to use it

Look things up:

- `node scripts/decisions.mjs list --topic <topic>` lists a topic's current entries.
- `node scripts/decisions.mjs search <regex>` searches titles and bodies.
- `node scripts/decisions.mjs show <id or heading text>` prints whole entries.

Record a decision:

- Run `node scripts/decisions.mjs new --topic <topic> --title "..." [--supersedes id] [--amends id] [--owner]`, then write the body (`**Decision.**` and `**Reasoning.**`).
- Or write a `## YYYY-MM-DD: Title` entry by hand at the top of the topic file and run `node scripts/decisions.mjs fix`.
- A new entry that replaces an earlier one says `Supersedes:` its id; one that changes part of it says `Amends:`. Never rewrite an old entry.
- `fix` sorts the entries, fills in IDs, derives statuses and rewrites this index. Never edit IDs, statuses or this file by hand. `check` reports what is out of date and never writes.
- Decisions the owner confirmed carry the owner's tag, `**[<name>]**`, in the title (`--owner` adds it; the name is `owner.name` in `project.config.json`).

## Direction and process

[direction.md](direction.md): Priorities, how the owner and agents work, naming and tone.

- 2026-11-19 Agents commit as the owner \[{{OWNER_NAME}}\]
- 2026-11-19 Squash merges only; the PR title and description are the commit (amended)
- 2026-11-19 Agents make small calls themselves; the owner keeps the large direction
- 2026-11-19 Open questions go in one numbered list, asked once
- 2026-11-19 Unattended sessions stay quiet until there is news
- 2026-11-19 Reviewers weigh suggestions against the owner's standing priorities
- 2026-11-19 No change reaches the owner read only by its author
- 2026-11-19 Delegated UI work comes back with a reuse list, and review checks it
- 2026-11-19 Parallel implementers each work in their own worktree
- 2026-11-19 Every implementer brief carries the same standing block
- 2026-11-19 Batch finished work into few PRs, merged in a fixed order
- 2026-11-19 Work for a long-running feature branch goes onto that branch
- 2026-11-19 Ship a rework in quick small steps and tune at the end
- 2026-11-19 Before a stable release, production may change freely; data wipes are the owner's call
- 2026-11-19 The lead agent owns the look and brings real choices
- 2026-11-19 UI work is shown at a phone width and a desktop width, every round
- 2026-11-19 Screenshots that belong together form one labelled sheet, and every picture enlarges on tap
- 2026-11-19 A polish night starts with read-only audits
- 2026-11-19 Retros turn friction into proposals; procedures become skills

## Platform and tooling

[platform.md](platform.md): Hosting, CI and deploys, environments, dependencies, security, dev tools.

- 2026-11-19 Decisions live in docs/design/decisions, one file per topic
- 2026-11-19 Agents never merge; main accepts changes only through PRs
- 2026-11-19 CI runs parallel jobs behind one required gate job
- 2026-11-19 Documentation-only PRs skip the build and tests, but never the gate
- 2026-11-19 Agents push after quick local checks; CI runs the full check
- 2026-11-19 Each rule is tested once, at the lowest layer that can prove it
- 2026-11-19 Guards must be shown to fail, and must explain their changes
- 2026-11-19 Dependencies are few, exact, aged and script-free
- 2026-11-19 Workflows follow a fixed hardening list
- 2026-11-19 Secrets live in GitHub environments, one per target, and agents never handle them
- 2026-11-19 In a public repo, logs, summaries and artifacts are public too
- 2026-11-19 Limit what a fooled agent can do
- 2026-11-19 Migrations apply by recorded version, and a released number is never reused

## Product

[product.md](product.md): Features, UX and behaviour the users see.

- 2026-11-19 Phone first, desktop too
- 2026-11-19 Accessibility is not traded away
- 2026-11-19 Focus returns to the opener only for keyboard users
- 2026-11-19 One overlay at a time
- 2026-11-19 Don't choose for the user; destructive actions go last
- 2026-11-19 Every clickable thing looks clickable, without hover
- 2026-11-19 Hidden overflow gets a hint
- 2026-11-19 Nothing fills in after the page has drawn
- 2026-11-19 Touch targets fit their context
- 2026-11-19 Show, don't tell; fewer boxes
- 2026-11-19 One spacing scale, set by containers
- 2026-11-19 Shared components are listed, guarded and reused
- 2026-11-19 Drag and drop always has a tap and keyboard alternative
- 2026-11-19 Counts read "1 / 3", and terms explain themselves without "?" icons
