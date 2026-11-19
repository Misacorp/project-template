#!/usr/bin/env node
// `node scripts/decisions.mjs <command>`: query, add and check the design decisions in
// docs/design/decisions/. Plain Node, no dependencies. Run `node scripts/decisions.mjs help` for
// the commands. The pure logic is in decisions-lib.mjs; every command takes the repo root
// (`--root`, default: this repo) so tests can run on a temp directory.
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  DIR,
  TODO_MARK,
  UserError,
  assignIds,
  buildPlan,
  changedFiles,
  finalise,
  isCurrent,
  loadState,
  makeId,
  renderEntry,
  usedIds,
  writePlan,
} from './decisions-lib.mjs';

const CLI = 'node scripts/decisions.mjs';
const VALUE_FLAGS = new Set(['root', 'topic', 'title', 'date', 'supersedes', 'amends']);
const BOOL_FLAGS = new Set(['all', 'owner', 'quiet', 'help']);

const USAGE = `Usage: ${CLI} <command>

  topics                          topics with their counts
  list [--topic t] [--all]        current entries (--all: superseded too)
  show <id or heading>...         full entries
  search <regex> [--topic t] [--all]
  new --topic t --title "..." [--date YYYY-MM-DD] [--supersedes a,b] [--amends c] [--owner]
                                  --owner tags the title with the owner's name
                                  (owner.name in project.config.json)
  fix [--quiet]                   sort, fill ids, derive statuses, rewrite README.md
  check                           what CI runs; never writes

Every command accepts --root <dir> (default: this repository).`;

/** Splits argv into { positionals, flags }. */
export function parseArgs(argv) {
  const positionals = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--') {
      positionals.push(...argv.slice(i + 1)); // Everything after -- is a plain argument.
      break;
    }
    if (!arg.startsWith('--')) {
      positionals.push(arg);
      continue;
    }
    const [name, inline] = arg.slice(2).split(/=(.*)/s);
    if (BOOL_FLAGS.has(name)) flags[name] = true;
    else if (VALUE_FLAGS.has(name)) {
      const value = inline ?? argv[++i];
      if (value === undefined) throw new UserError(`--${name} needs a value.`);
      flags[name] = value;
    } else throw new UserError(`Unknown option --${name}. Try: ${CLI} help`);
  }
  return { positionals, flags };
}

const splitList = (value) =>
  (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

// ---------------------------------------------------------------------------------------------
// Queries

/** Every entry as { entry, topic, file, current } in topic order, current first. */
function listEntries(plan) {
  const result = [];
  for (const topic of plan.topics) {
    for (const entry of plan.sortedByTopic.get(topic.id)) {
      result.push({
        entry,
        topic,
        file: `${DIR}/${topic.id}.md`,
        current: isCurrent(plan.infoOf(entry)),
      });
    }
  }
  return result;
}

function requireTopic(plan, id) {
  if (id !== undefined && !plan.topics.some((t) => t.id === id)) {
    throw new UserError(
      `Unknown topic "${id}". Topics: ${plan.topics.map((t) => t.id).join(', ')}.`,
    );
  }
}

function cmdTopics(ctx) {
  const plan = buildPlan(ctx.root);
  for (const topic of plan.topics) {
    const entries = plan.sortedByTopic.get(topic.id);
    const current = entries.filter((e) => isCurrent(plan.infoOf(e))).length;
    ctx.out(
      `${topic.id}  ${topic.title}  ${current} current, ${entries.length - current} superseded`,
    );
  }
  return 0;
}

function cmdList(ctx, args) {
  const plan = buildPlan(ctx.root);
  requireTopic(plan, args.flags.topic);
  for (const { entry, topic, current } of listEntries(plan)) {
    if (args.flags.topic && topic.id !== args.flags.topic) continue;
    if (!current && !args.flags.all) continue;
    ctx.out(`${entry.date}  ${entry.id}  ${entry.title}`);
  }
  return 0;
}

/** The entries a query names: an id, else an exact heading or title, else a substring. */
function findEntries(items, query) {
  const q = query.replace(/^#+\s*/, '').trim();
  const lower = q.toLowerCase();
  const byId = items.filter((i) => i.entry.id === q);
  if (byId.length) return byId;
  const exact = items.filter(
    (i) =>
      `${i.entry.date}: ${i.entry.title}`.toLowerCase() === lower ||
      i.entry.title.toLowerCase() === lower,
  );
  if (exact.length) return exact;
  return items.filter((i) => `${i.entry.date}: ${i.entry.title}`.toLowerCase().includes(lower));
}

function cmdShow(ctx, args) {
  if (!args.positionals.length) throw new UserError(`Usage: ${CLI} show <id or heading>...`);
  const plan = buildPlan(ctx.root);
  const items = listEntries(plan);
  let code = 0;
  for (const query of args.positionals) {
    const found = findEntries(items, query);
    if (found.length === 0) {
      ctx.err(`No entry matches "${query}".`);
      code = 1;
    } else if (found.length > 1) {
      ctx.err(`"${query}" matches ${found.length} entries; be more specific (use an id):`);
      for (const f of found) ctx.err(`  ${f.entry.id}  ${f.entry.title}`);
      code = 1;
    } else {
      const { entry, file } = found[0];
      ctx.out(`${file}\n\n${renderEntry(entry, plan.statusOf(entry))}\n`);
    }
  }
  return code;
}

function cmdSearch(ctx, args) {
  if (args.positionals.length !== 1) throw new UserError(`Usage: ${CLI} search <regex>`);
  let re;
  try {
    re = new RegExp(args.positionals[0], 'i');
  } catch {
    throw new UserError(`"${args.positionals[0]}" is not a valid regular expression.`);
  }
  const plan = buildPlan(ctx.root);
  requireTopic(plan, args.flags.topic);
  for (const { entry, topic, file, current } of listEntries(plan)) {
    if (args.flags.topic && topic.id !== args.flags.topic) continue;
    if (!current && !args.flags.all) continue;
    const lines = entry.body.split('\n').filter((l) => re.test(l));
    if (!re.test(entry.title) && lines.length === 0) continue;
    ctx.out(`${file}  ${entry.id}  ${entry.title}`);
    for (const line of lines) ctx.out(`  ${line.trim().slice(0, 200)}`);
  }
  return 0;
}

// ---------------------------------------------------------------------------------------------
// Writing

/** True for a real calendar date written YYYY-MM-DD (2026-02-31 is not). */
export function isRealDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(date);
}

/** Today's date in Helsinki as YYYY-MM-DD. */
export function todayHelsinki(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Helsinki',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Stops a command that would write when a topic file has problems fix cannot repair. */
function refuseIfBroken(state) {
  if (state.fatal > 0) {
    throw new UserError(`Nothing was written. Fix these first:\n${state.problems.join('\n')}`);
  }
}

function printProblems(ctx, problems) {
  for (const p of problems) ctx.err(`problem: ${p}`);
}

function cmdFix(ctx, args) {
  const plan = buildPlan(ctx.root);
  const changed = writePlan(ctx.root, plan);
  if (args.flags.quiet) {
    if (changed.length) ctx.out(`updated: ${changed.join(', ')}`);
  } else {
    for (const rel of changed) ctx.out(`updated ${rel}`);
  }
  printProblems(ctx, plan.problems);
  return plan.problems.length ? 1 : 0;
}

function cmdNew(ctx, args) {
  const { topic: topicId, title: rawTitle } = args.flags;
  if (!topicId || !rawTitle) throw new UserError('new needs --topic and --title.');
  const state = loadState(ctx.root);
  refuseIfBroken(state);
  if (!state.topics.some((t) => t.id === topicId)) {
    throw new UserError(
      `Unknown topic "${topicId}". Topics: ${state.topics.map((t) => t.id).join(', ')}.`,
    );
  }
  const date = args.flags.date ?? todayHelsinki();
  if (!isRealDate(date)) {
    throw new UserError(`--date must be a real date like 2026-10-28, not "${date}".`);
  }
  let title = rawTitle.replace(/\s+/g, ' ').trim();
  if (!title) throw new UserError('--title is empty.');
  const tag = `**[${state.owner}]**`;
  if (args.flags.owner && !title.includes(tag)) title += ` ${tag}`;
  assignIds(state);
  const used = usedIds(state);
  const supersedes = splitList(args.flags.supersedes);
  const amends = splitList(args.flags.amends);
  for (const id of [...supersedes, ...amends]) {
    if (!used.has(id)) throw new UserError(`Unknown entry id "${id}".`);
  }
  const id = makeId(date, title, used, state.owner);
  state.byTopic.get(topicId).unshift({
    date,
    title,
    id,
    supersedes,
    amends,
    body: `**Decision.** ${TODO_MARK}\n\n**Reasoning.**`,
  });
  const plan = finalise(state);
  writePlan(ctx.root, plan);
  ctx.out(`${DIR}/${topicId}.md`);
  ctx.out(id);
  printProblems(ctx, plan.problems);
  return plan.problems.length ? 1 : 0;
}

// ---------------------------------------------------------------------------------------------
// Check

function cmdCheck(ctx) {
  const problems = [];
  let plan;
  try {
    plan = buildPlan(ctx.root);
  } catch (e) {
    if (!(e instanceof UserError)) throw e;
    plan = null;
    problems.push(e.message);
  }
  if (plan) {
    problems.push(...plan.problems);
    for (const rel of plan.missingFiles)
      problems.push(`${rel} is missing (topic is in topics.json).`);
    for (const [topic, entries] of plan.byTopic) {
      for (const e of entries) {
        if (e.body.includes(TODO_MARK)) {
          problems.push(
            `${DIR}/${topic}.md: ${e.id} still has the TODO placeholder; write the entry.`,
          );
        }
      }
    }
    const changed = changedFiles(ctx.root, plan);
    if (changed.length) {
      problems.push(`out of date, run \`${CLI} fix\`: ${changed.join(', ')}`);
    }
  }
  if (problems.length === 0) {
    ctx.out(`decisions ok: ${plan.all.length} entries in ${plan.topics.length} topics.`);
    return 0;
  }
  printProblems(ctx, problems);
  return 1;
}

// ---------------------------------------------------------------------------------------------

const COMMANDS = {
  topics: cmdTopics,
  list: cmdList,
  show: cmdShow,
  search: cmdSearch,
  new: cmdNew,
  fix: cmdFix,
  check: cmdCheck,
};

/**
 * Runs the CLI. `io` is { out, err, cwd }; returns the exit code. Used by the entry point below
 * and directly by the tests.
 */
export function run(argv, io) {
  const ctx = { out: io.out, err: io.err, cwd: io.cwd, root: '' };
  try {
    const args = parseArgs(argv);
    const command = args.flags.help ? 'help' : (args.positionals.shift() ?? 'help');
    const handler = COMMANDS[command];
    if (!handler) {
      (command === 'help' ? ctx.out : ctx.err)(USAGE);
      return command === 'help' ? 0 : 1;
    }
    ctx.root = resolve(
      io.cwd,
      args.flags.root ?? join(dirname(fileURLToPath(import.meta.url)), '..'),
    );
    return handler(ctx, args);
  } catch (e) {
    if (!(e instanceof UserError)) throw e;
    ctx.err(e.message);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = run(process.argv.slice(2), {
    out: (s) => console.log(s),
    err: (s) => console.error(s),
    cwd: process.cwd(),
  });
}
