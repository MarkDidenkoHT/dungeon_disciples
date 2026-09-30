#!/usr/bin/env node
// Reports what every bot template becomes under every tourney rule it can be
// asked to fight under. Read-only.
//
//   node scripts/check-bot-templates.js             singles, summary first
//   node scripts/check-bot-templates.js --pairs      include two-rule days
//   node scripts/check-bot-templates.js --all        every case, ok ones included
//   node scripts/check-bot-templates.js --rule=plain_gear
//
// Exit code 1 if anything is `broken` — an army that would take the field and
// cannot fight. `gutted` and `ineligible` are reported but do not fail: they are
// the backlog this audit exists to produce, not a regression.

const { BOT_TEMPLATES, checkBotTemplates } = require('../data/bot_templates.js');
const { TOURNEY_RULES_BY_ID } = require('../data/tourney.js');
const { auditBotTemplates, auditByRule, checkDowngrades, POWER_FLOOR_PCT } = require('../utils/bot-template-audit.js');

const argv   = process.argv.slice(2);
const pairs  = argv.includes('--pairs') || argv.includes('--all');
const all    = argv.includes('--all');
const only   = (argv.find(a => a.startsWith('--rule=')) || '').slice('--rule='.length) || null;

const label = ids => ids.map(id => TOURNEY_RULES_BY_ID[id]?.name || id).join(' + ');
const pad   = (s, n) => String(s).padEnd(n);

// The authored-template check first: a template that is already wrong is not
// worth reading a rule sweep for.
const authored = checkBotTemplates();
const dirty = Object.entries(authored).filter(([, problems]) => problems.length);
if (dirty.length) {
  console.log('AS AUTHORED\n');
  for (const [id, problems] of dirty) {
    console.log(`  ${id}`);
    for (const p of problems) console.log(`    · ${p}`);
  }
  console.log('');
}

const tagless = checkDowngrades();
if (tagless.length) {
  console.log('DOWNGRADES THAT DROP A TAG   (advisory)\n');
  for (const line of tagless) console.log(`  · ${line}`);
  console.log('');
}

let cases = auditBotTemplates();
if (!pairs) cases = cases.filter(c => c.rules.length === 1);
if (only)   cases = cases.filter(c => c.rules.includes(only));

// ── Per-rule pool ───────────────────────────────────────────────────────────
console.log(`POOL PER RULE   (${BOT_TEMPLATES.length} templates, ⚔ floor ${POWER_FLOOR_PCT}%)\n`);
console.log(`  ${pad('rule', 24)} ${pad('offered', 8)} ${pad('ok', 5)} ${pad('gutted', 7)} ${pad('broken', 7)} ineligible`);
const byRule = auditByRule(auditBotTemplates());
for (const [id, row] of Object.entries(byRule)) {
  if (only && id !== only) continue;
  const flag = row.pool === 0 ? '  ← NO OPPONENTS' : (row.broken ? '  ← broken armies' : '');
  console.log(`  ${pad(TOURNEY_RULES_BY_ID[id]?.name || id, 24)} ${pad(row.pool, 8)} ${pad(row.ok, 5)} ${pad(row.gutted, 7)} ${pad(row.broken, 7)} ${row.ineligible}${flag}`);
}

// ── Cases ───────────────────────────────────────────────────────────────────
const rank = { broken: 0, gutted: 1, ineligible: 2, ok: 3 };
const shown = cases
  .filter(c => all || c.status !== 'ok')
  .sort((a, b) => rank[a.status] - rank[b.status]
    || a.rules.length - b.rules.length
    || a.template.localeCompare(b.template));

const counts = cases.reduce((m, c) => ({ ...m, [c.status]: (m[c.status] || 0) + 1 }), {});
console.log(`\n\nCASES   ${cases.length} audited · `
  + ['broken', 'gutted', 'ineligible', 'ok'].map(s => `${counts[s] || 0} ${s}`).join(' · ')
  + (pairs ? '' : '   (singles only; --pairs for two-rule days)'));

let lastStatus = null;
for (const c of shown) {
  if (c.status !== lastStatus) {
    console.log(`\n── ${c.status.toUpperCase()} ${'─'.repeat(Math.max(0, 60 - c.status.length))}`);
    lastStatus = c.status;
  }
  console.log(`\n  ${c.template} · ${c.band} · ${label(c.rules)}`);
  console.log(`    ${c.units}/${c.baselineUnits} units · ⚔ ${c.power}/${c.basePower} (${c.pct}%)`);
  for (const n of c.notes) console.log(`    · ${n}`);
}

const brokenCount = cases.filter(c => c.status === 'broken').length;
console.log('');
process.exit(brokenCount ? 1 : 0);
