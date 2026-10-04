/**
 * Claim audit — every feature bullet in the README must declare how it is
 * backed, and that backing must actually exist in the smoke test.
 *
 * The claim "0 unbacked claims" is itself a claim, and until now nothing in
 * the repo enforced it: add a bullet next month, every check still passes.
 * This script is that enforcement. It is deliberately boring — no deps, no
 * NLP, no fuzzy scoring — because a gate that is clever tends to get disabled.
 *
 *   Rule: every bullet under **Core** / **Installable PWA** carries EITHER
 *     • one or more claim ids — `(#7)` or `<!-- claim:offline-pill -->`
 *       ...which must resolve to a real check() name in scripts/smoke.mjs, OR
 *     • `<!-- no-check: reason -->` — a written justification, never empty.
 *
 *   Exemptions are allowed (some claims are architectural or honest caveats)
 *   but they must be *written down with a reason* and are reported on every
 *   run, so the count can never quietly drift upward.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
const smoke = readFileSync(join(ROOT, 'scripts', 'smoke.mjs'), 'utf8');

/**
 * Every check name the suite actually runs, with its claim ids.
 *
 * Parse only single-quoted names: the suite quotes every check name with `'`,
 * and several contain embedded double quotes ('"Run again" ...'). A looser
 * character class would split those and silently drop checks from the index —
 * a gate that mis-reads its own inventory is worse than no gate.
 */
const checkNames = [...smoke.matchAll(/check\(\s*'((?:[^'\\]|\\.)*)'/g)].map((m) =>
  m[1].replace(/\\'/g, "'")
);
const checksById = new Map();
for (const name of checkNames) {
  for (const id of claimIdsOf(name)) {
    if (!checksById.has(id)) checksById.set(id, []);
    checksById.get(id).push(name);
  }
}

/** `(#7)` / `(#4/#5)` and `<!-- claim:slug -->` / `[claim:slug]`. */
function claimIdsOf(text) {
  const ids = [];
  for (const m of text.matchAll(/\(#(\d+(?:\/#\d+)*)\)/g)) {
    // "7/#8/#16/#19" → 7, 8, 16, 19 — the '#' prefix on each tail must go too.
    for (const n of m[1].split('/')) ids.push(n.replace(/^#/, ''));
  }
  for (const m of text.matchAll(/claim:([a-z0-9][a-z0-9-]*)/g)) ids.push(m[1]);
  return ids;
}

/** Bullets inside the **Core** / **Installable PWA** feature sections. */
function featureBullets() {
  const lines = readme.split('\n');
  const out = [];
  let inFeatures = false;
  let inClaimSection = false;
  lines.forEach((line, i) => {
    if (/^##\s/.test(line)) inFeatures = /^##\s+Features\b/.test(line);
    if (!inFeatures) return;
    // Section subheadings are bold-only lines; a `**` bullet is a claim.
    if (/^\*\*[^*]+\*\*$/.test(line.trim())) {
      inClaimSection = /^\*\*(Core|Installable PWA)\*\*$/.test(line.trim());
      return;
    }
    if (inClaimSection && /^-\s+\S/.test(line)) out.push({ line: i + 1, text: line });
  });
  return out;
}

const bullets = featureBullets();
const problems = [];
const covered = new Set();
const exemptions = [];

for (const { line, text } of bullets) {
  const ids = claimIdsOf(text);
  const exempt = text.match(/<!--\s*no-check:\s*([^*]+?)\s*-->/);

  if (ids.length === 0 && !exempt) {
    problems.push(`README:${line} — no backing declared: ${trim(text)}`);
    continue;
  }
  if (exempt && !exempt[1].trim()) {
    problems.push(`README:${line} — empty <!-- no-check: --> reason: ${trim(text)}`);
    continue;
  }
  if (exempt) {
    exemptions.push({ line, reason: exempt[1].trim() });
    continue;
  }
  for (const id of ids) {
    if (!checksById.has(id)) {
      problems.push(`README:${line} — claim #${id} has no check in scripts/smoke.mjs: ${trim(text)}`);
    } else {
      covered.add(id);
    }
  }
}

// An id used by a check but never claimed by the README is fine (extra
// coverage), so this is reported, not enforced — but it catches typos.
const claimedUnused = [...checksById.keys()].filter(
  (id) => !covered.has(id) && /^\d+$/.test(id)
);

const total = bullets.length;
// Careful: "backed" must EXCLUDE exempt bullets, or the summary overstates
// coverage — the exact soft spot this script exists to remove.
const backedCount = total - problems.length - exemptions.length;

if (problems.length) {
  console.error(`CLAIM AUDIT FAILED — ${problems.length} problem(s):\n`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  console.error('');
}

console.log(
  `claim-audit: ${total} feature bullets — ${backedCount} backed by checks, ` +
    `${exemptions.length} exempt (with written reasons), ${problems.length} broken. ` +
    `${checkNames.length} checks in the suite.`
);
if (claimedUnused.length) {
  console.log(`  note: numbered ids not referenced by any bullet: #${claimedUnused.join(' #')}`);
}
for (const e of exemptions) console.log(`  exempt README:${e.line} — ${e.reason}`);

process.exit(problems.length ? 1 : 0);

function trim(s) {
  const t = s.replace(/^-\s+/, '').replace(/[`*_]/g, '');
  return t.length > 72 ? `${t.slice(0, 72)}…` : t;
}