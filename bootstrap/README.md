# Bootstrap

Everything in this folder (and `.github/workflows/template.yml`) belongs to the template and is removed once `node bootstrap/init.mjs` has run.

## What init does

1. Asks for the project name, slug, owner, GitHub repository, environments (`production` or `production,staging`) and stack (`none` or `cloudflare-web`), or takes them as flags (`--help`).
2. Writes `project.config.json`: the answers, plus each environment's URL, deploy branches and the names of its secrets. `scripts/github-setup.mjs`, `scripts/decisions.mjs` and `scripts/deployed.mjs` read it.
3. Renders every file of the repo and of the chosen stack (`stacks/<stack>/files/`, which overlays files of the same path):
   - `{{NAME}}` placeholders (capitals only, so GitHub's `${{ expr }}` is never touched): `PROJECT_NAME`, `PROJECT_SLUG`, `REPO`, `OWNER_NAME`, `OWNER_GITHUB`, `PRODUCTION_HOST`, `STAGING_HOST`, `TODAY`. An unknown name is an error.
   - Conditional blocks: a whole line `# @if staging`, `// @if !staging` or `<!-- @if cloudflare-web -->`, then optionally `@else`, then `@endif`. Blocks nest. Inside a Markdown or HTML line, `<!-- @if x -->...<!-- @else -->...<!-- @endif -->` works too. Flags: `staging`, `stack` (any stack), the stack's name, and `template` (never set, so a `template` block shows only in the template itself).
   - A file that renders to nothing is not written, which makes a whole file conditional.
4. Merges `stacks/<stack>/claude-settings.json` (extra deny rules) into `.claude/settings.json`.
5. Adds the decisions in `decisions/<flag>/<topic>.md` for each flag that is on, then runs `node scripts/decisions.mjs fix`.
6. Removes `bootstrap/` and the template workflow (`--keep-bootstrap` keeps them).

## Adding a stack

Make `stacks/<name>/files/` with the files it adds or replaces (its own `.github/workflows/ci.yml` and `deploy.yml`, a lockfile if it has one), add the name to `STACKS` in `lib.mjs`, and to the `template` workflow's matrix. Put its secrets in `buildConfig`. Use `@if <name>` blocks for the stack's lines in shared files (`CLAUDE.md`, `docs/security.md`, `.gitignore`); a file that is active in the template itself (`dependabot.yml`) is replaced by a full copy in the stack instead.

## The cloudflare-web lockfile

`stacks/cloudflare-web/files/pnpm-lock.yaml` is committed so a new project installs exactly what the template tested. Importers are keyed by path, not package name, so it stays valid after the slug is filled in. To update versions: change the catalog in `pnpm-workspace.yaml`, then in a sample project (`node bootstrap/smoke.mjs --out <dir> --stack cloudflare-web`) run `pnpm install` and copy its `pnpm-lock.yaml` back here.
