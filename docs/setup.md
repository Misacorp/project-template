# Setup checklist

One-time steps that only {{OWNER_NAME}} can do, written when the project was bootstrapped. Agents: a hook reminds you at the start of a session while a box is open. Check what you can yourself first (for example `gh api repos/{{REPO}}/rulesets`), then raise the rest with {{OWNER_NAME}} once, as one numbered list. Tick a box in your next PR when it is confirmed done. Steps that need things the project doesn't have yet wait until it does; say so instead of asking.

- [ ] **GitHub settings.** On your own machine, from the repo root: `node scripts/github-setup.mjs --user {{OWNER_GITHUB}}`. It protects `main`, makes merges squash-only with the PR title and description as the commit, locks down Actions, turns on secret scanning and creates the environments. Re-run it after changing `project.config.json`.
- [ ] **Claude's access to this repository.** If the Claude GitHub App is limited to selected repositories: GitHub, Settings, Applications, Claude, Configure, Repository access, add `{{REPO}}`. Without it, cloud sessions can read but not push.

<!-- @if !commit-email -->

- [ ] **Commit email for agents.** Add `"commitEmail"` with your GitHub no-reply address (GitHub, Settings, Emails: `<id>+{{OWNER_GITHUB}}@users.noreply.github.com`) under `owner` in `project.config.json`. Agents then commit as you, and squash merges get no `Co-authored-by` line.

<!-- @endif -->

- [ ] **What the project is.** Tell an agent in a paragraph; it fills the TODOs in `CLAUDE.md`, `README.md` and `docs/progress.md`.

<!-- @if cloudflare-web -->

- [ ] **The domain on Cloudflare.** `{{PRODUCTION_HOST}}`<!-- @if staging --> and `{{STAGING_HOST}}`<!-- @endif --> must be in a zone on your Cloudflare account (the Worker claims the hostname itself on the first deploy).
- [ ] **Cloudflare credentials in GitHub.** Create an API token from the "Edit Cloudflare Workers" template, limited to your account and that zone, and copy your account ID (Workers & Pages overview). Re-run `node scripts/github-setup.mjs --user {{OWNER_GITHUB}}`; it asks for `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` for production<!-- @if staging --> and staging<!-- @endif -->, with hidden input.
- [ ] **First deploy.** Merge a PR into `main` (or Actions, deploy, Run workflow on `main`). The run ends by checking that the live commit is the merged one; `node scripts/deployed.mjs --prod` shows it any time.

<!-- @endif -->
