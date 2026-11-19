#!/usr/bin/env node
// Applies the GitHub settings this project relies on, from project.config.json, and asks for the secret
// values that are missing. Safe to run again: each step checks what is there and only changes what differs.
// Run it on your own machine with the GitHub CLI logged in (`gh auth status`) as an admin of the repo:
//
//   node scripts/github-setup.mjs                 everything below, as gh's active account
//   node scripts/github-setup.mjs --user <login>  as another account gh is logged in to
//   node scripts/github-setup.mjs --dry-run       print the steps, change nothing
//   node scripts/github-setup.mjs --no-secrets    skip the secret prompts
//
// It first checks that the account is an admin of the repository, and stops if not.
//
// 1. Repository: squash merges only, with the PR title and description as the commit (CLAUDE.md, Pull
//    requests); delete branches after merge; no auto-merge; secret scanning and push protection;
//    Dependabot alerts and security updates.
// 2. Actions: the default GITHUB_TOKEN is read-only and can't approve PRs; actions must be pinned to a
//    full commit SHA; workflows from outside contributors wait for approval.
// 3. A ruleset on the default branch: pull request required (squash only), the `ci` check required and
//    up to date, no force push, no deletion, nobody bypasses.
// 4. The environments in project.config.json. production deploys only from main; staging from any branch.
// 5. Secrets: each one the config lists and the environment lacks is asked for. The value
//    goes from your terminal to `gh` (which hides what you type), never through this script or a chat.
//
// A step that GitHub refuses (some settings need a paid plan on private repositories) is a warning, and
// the rest still runs. Plain Node and `gh`, no dependencies.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { createInterface } from 'node:readline/promises';

const ROOT = process.cwd();
const argv = process.argv.slice(2);
const args = new Set(argv);
const DRY = args.has('--dry-run');
const SECRETS = !args.has('--no-secrets');
const userAt = argv.indexOf('--user');
const USER = userAt >= 0 ? argv[userAt + 1] : undefined;
/** The environment for every gh call: with --user, that account's token (gh keeps it; we never print it). */
let ghEnv = process.env;
let warnings = 0;

function gh(argv, input) {
  return execFileSync('gh', argv, {
    env: ghEnv,
    encoding: 'utf8',
    input: input === undefined ? undefined : JSON.stringify(input),
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

function api(method, path, body) {
  const argv = ['api', '-X', method, '-H', 'Accept: application/vnd.github+json', path];
  if (body !== undefined) argv.push('--input', '-');
  const out = gh(argv, body);
  return out.trim() ? JSON.parse(out) : null;
}

/** Runs one named step; prints it, and turns a refusal into a warning. */
function step(label, fn) {
  if (DRY) {
    console.log(`  would: ${label}`);
    return;
  }
  try {
    fn();
    console.log(`  ok:    ${label}`);
  } catch (err) {
    warnings += 1;
    const detail = String(err.stderr || err.message || err)
      .trim()
      .split('\n')[0];
    console.log(`  WARN:  ${label}: ${detail}`);
  }
}

function loadConfig() {
  const path = join(ROOT, 'project.config.json');
  if (existsSync(path)) return JSON.parse(readFileSync(path, 'utf8'));
  // The template itself (not bootstrapped yet): repository settings only.
  const remote = execFileSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf8' }).trim();
  const m = /github\.com[:/]([^/\s]+\/[^/\s]+?)(?:\.git)?\/?$/.exec(remote);
  if (!m)
    throw new Error(
      'No project.config.json and no GitHub remote: run node bootstrap/init.mjs first.',
    );
  console.log('No project.config.json: applying repository settings only (no environments).');
  return { repo: m[1], environments: {} };
}

function rulesetBody() {
  return {
    name: 'main',
    target: 'branch',
    enforcement: 'active',
    bypass_actors: [],
    conditions: { ref_name: { include: ['~DEFAULT_BRANCH'], exclude: [] } },
    rules: [
      { type: 'deletion' },
      { type: 'non_fast_forward' },
      {
        type: 'pull_request',
        parameters: {
          required_approving_review_count: 0,
          dismiss_stale_reviews_on_push: false,
          require_code_owner_review: false,
          require_last_push_approval: false,
          required_review_thread_resolution: false,
          allowed_merge_methods: ['squash'],
        },
      },
      {
        type: 'required_status_checks',
        parameters: {
          strict_required_status_checks_policy: true,
          required_status_checks: [{ context: 'ci' }],
        },
      },
    ],
  };
}

async function askSecrets(repo, environments) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    for (const [env, entry] of Object.entries(environments)) {
      const secrets = new Set(
        JSON.parse(gh(['secret', 'list', '--env', env, '--repo', repo, '--json', 'name'])).map(
          (s) => s.name,
        ),
      );
      for (const name of entry.secrets ?? []) {
        if (secrets.has(name)) {
          console.log(
            `  ok:    ${env} secret ${name} is set (gh secret set ${name} --env ${env} to change it)`,
          );
          continue;
        }
        const yes = (
          await rl.question(`  ${env}: secret ${name} is missing. Set it now? [Y/n] `)
        ).trim();
        if (/^n/i.test(yes)) continue;
        rl.pause();
        // gh prompts for the value itself and hides what is typed or pasted.
        const r = spawnSync('gh', ['secret', 'set', name, '--env', env, '--repo', repo], {
          env: ghEnv,
          stdio: 'inherit',
        });
        rl.resume();
        if (r.status !== 0) {
          warnings += 1;
          console.log(`  WARN:  ${env} secret ${name} was not set.`);
        }
      }
    }
  } finally {
    rl.close();
  }
}

/** Picks the account (--user) and stops unless it is an admin of the repository. */
function checkAccount(repo) {
  if (USER !== undefined) {
    if (!/^[A-Za-z0-9-]+$/.test(USER ?? '')) throw new Error('--user needs a GitHub login.');
    let token;
    try {
      token = execFileSync('gh', ['auth', 'token', '--user', USER], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim();
    } catch {
      throw new Error(`gh is not logged in as ${USER}. Run: gh auth login`);
    }
    ghEnv = { ...process.env, GH_TOKEN: token };
  }
  const login = api('GET', 'user').login;
  let admin = false;
  try {
    admin = api('GET', `repos/${repo}`).permissions?.admin === true;
  } catch {
    // Not visible to this account at all.
  }
  if (!admin) {
    const owner = repo.split('/')[0];
    throw new Error(
      `gh is using the account ${login}, which is not an admin of ${repo}.\n` +
        `Run it as an admin, for example: node scripts/github-setup.mjs --user ${owner}\n` +
        `(gh auth status lists the accounts gh is logged in to.)`,
    );
  }
  console.log(`As ${login} (admin of ${repo}).`);
}

async function main() {
  const config = loadConfig();
  const repo = config.repo;
  checkAccount(repo);
  const r = `repos/${repo}`;
  console.log(`GitHub setup for ${repo}${DRY ? ' (dry run)' : ''}\n`);

  console.log('Repository');
  step('delete branches after merge, no auto-merge', () =>
    api('PATCH', r, { delete_branch_on_merge: true, allow_auto_merge: false }),
  );
  step('squash merges only, with the PR title and description as the commit message', () =>
    api('PATCH', r, {
      allow_squash_merge: true,
      allow_merge_commit: false,
      allow_rebase_merge: false,
      squash_merge_commit_title: 'PR_TITLE',
      squash_merge_commit_message: 'PR_BODY',
    }),
  );
  if (existsSync(join(ROOT, 'bootstrap', 'init.mjs'))) {
    // The template itself (a bootstrapped project has no bootstrap/): offer "Use this template".
    step('mark as a template repository', () => api('PATCH', r, { is_template: true }));
  }
  step('secret scanning and push protection', () =>
    api('PATCH', r, {
      security_and_analysis: {
        secret_scanning: { status: 'enabled' },
        secret_scanning_push_protection: { status: 'enabled' },
      },
    }),
  );
  step('Dependabot alerts', () => api('PUT', `${r}/vulnerability-alerts`));
  step('Dependabot security updates', () => api('PUT', `${r}/automated-security-fixes`));

  console.log('Actions');
  step('read-only GITHUB_TOKEN that cannot approve pull requests', () =>
    api('PUT', `${r}/actions/permissions/workflow`, {
      default_workflow_permissions: 'read',
      can_approve_pull_request_reviews: false,
    }),
  );
  step('actions must be pinned to a full commit SHA', () =>
    api('PUT', `${r}/actions/permissions`, {
      enabled: true,
      allowed_actions: 'all',
      sha_pinning_required: true,
    }),
  );
  step('workflows from outside contributors wait for approval', () =>
    api('PUT', `${r}/actions/permissions/fork-pr-contributor-approval`, {
      approval_policy: 'all_external_contributors',
    }),
  );

  console.log('Ruleset');
  step(
    'default branch: PR (squash only) and the `ci` check required, no force push or deletion',
    () => {
      const existing = (api('GET', `${r}/rulesets`) ?? []).find((s) => s.name === 'main');
      if (existing) api('PUT', `${r}/rulesets/${existing.id}`, rulesetBody());
      else api('POST', `${r}/rulesets`, rulesetBody());
    },
  );

  const envs = Object.entries(config.environments ?? {});
  if (envs.length) console.log('Environments');
  for (const [env, entry] of envs) {
    const branches = entry.branches ?? [];
    step(`${env}: deploys from ${branches.length ? branches.join(', ') : 'any branch'}`, () => {
      api('PUT', `${r}/environments/${env}`, {
        deployment_branch_policy: branches.length
          ? { protected_branches: false, custom_branch_policies: true }
          : null,
      });
      if (!branches.length) return;
      const have = api('GET', `${r}/environments/${env}/deployment-branch-policies`);
      const names = new Set((have?.branch_policies ?? []).map((p) => p.name));
      for (const b of branches) {
        if (!names.has(b)) {
          api('POST', `${r}/environments/${env}/deployment-branch-policies`, {
            name: b,
            type: 'branch',
          });
        }
      }
    });
  }

  if (SECRETS && envs.length && !DRY) {
    console.log('Secrets');
    await askSecrets(repo, config.environments);
  }

  console.log(warnings ? `\nDone with ${warnings} warning(s): see WARN above.` : '\nDone.');
}

main().catch((err) => {
  console.error(String(err.stderr || err.message || err).trim());
  process.exit(1);
});
