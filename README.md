<!-- @if template -->

# Project template

A starting point for new projects: the process, CI, security and agent tooling from Leet Creatures, without the game. Optionally it also sets up the same web stack (a pnpm workspace, a Vite + Preact frontend and one Cloudflare Worker), with production only or production and staging.

## What you get

- **CI** (`.github/workflows/ci.yml`): parallel jobs behind one required `ci` gate; a security job with gitleaks, actionlint and zizmor; every action pinned to a commit SHA; least-privilege tokens.
- **Agent setup** (`CLAUDE.md`, `.claude/`): working rules for the owner and agents, three subagents (implementer, researcher without a shell, helper), deny rules for secrets, deploys, merges and network tools, and hooks for decisions and retros.
- **Decisions log** (`docs/design/decisions/`, `node scripts/decisions.mjs`): one file per topic, a generated index, and a baseline of decisions that carried over from earlier projects.
- **Security baseline** (`docs/security.md`) and **GitHub setup** (`scripts/github-setup.mjs`): rulesets, environments, Actions settings, secret scanning, and prompts for each missing secret.
- **One commit per PR on `main`:** only squash merges, which take the PR title and description as the commit. `CLAUDE.md` tells agents to write those as history (what changed and why), not as review notes. Agents commit as the owner (a hook sets the identity) and footers are removed automatically, so the commit has no attribution noise.
- **Optional stack** (`bootstrap/stacks/cloudflare-web/`): the web app, the deploy workflow (merge to main deploys production; a manual run deploys staging), and a script and skill that read back which commit is live.

## Start a project

1. On GitHub: **Use this template** → create the new repository. (Or `gh repo create <name> --template Misacorp/project-template --clone`.)
2. Clone it and run the bootstrap. It asks for the name, the owner, the environments and the stack:

   ```bash
   node bootstrap/init.mjs
   ```

3. With the `cloudflare-web` stack: `pnpm install --frozen-lockfile && pnpm check`.
4. Commit and push to `main`.
5. Apply the GitHub settings and set the secrets (needs the `gh` CLI, logged in as the repo owner):

   ```bash
   node scripts/github-setup.mjs --user <your GitHub login>
   ```

6. The remaining one-time steps are in the new project's `docs/setup.md`. Agents remind you of open ones at the start of a session, so you don't have to remember them.

Templates copy files only: GitHub never copies environments, secrets, variables, rulesets or settings. That is why step 5 exists. Re-run it any time; it only changes what differs.

## Working on the template

See `bootstrap/README.md` for how the bootstrap works (placeholders, `@if` blocks, stacks). `node bootstrap/smoke.mjs --out <dir> --stack cloudflare-web --environments production,staging` builds a sample project to try a change; the `template` workflow does that for every combination on each PR.

<!-- @else -->

# {{PROJECT_NAME}}

<!-- TODO({{OWNER_NAME}}): what this is, in a paragraph. -->

<!-- @if cloudflare-web -->

## Development

```bash
pnpm install --frozen-lockfile
pnpm check
```

Run the Worker (`pnpm dev` in `apps/worker`) and the frontend (`pnpm dev` in `apps/web`) side by side; the frontend proxies `/api` to the Worker.

## Deploys

<!-- @if staging -->

- **Production** (`https://{{PRODUCTION_HOST}}`): every merge to `main`.
- **Staging** (`https://{{STAGING_HOST}}`): Actions → deploy → Run workflow, on any branch.

<!-- @else -->

- **Production** (`https://{{PRODUCTION_HOST}}`): every merge to `main`.

<!-- @endif -->

`node scripts/deployed.mjs` shows which commit is live.

<!-- @endif -->

## Setup

`node scripts/github-setup.mjs` applies the GitHub settings this project relies on (ruleset, environments, Actions settings, secret scanning) and asks for missing secrets. Agents follow `CLAUDE.md`.

<!-- @endif -->
