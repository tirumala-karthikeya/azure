/**
 * Splits docs/github-actions-handbook.md into per-section MDX pages
 * under website/src/content/docs/handbook/, plus rewrites diagram references
 * to use the website's /diagrams/ path.
 */

const fs   = require('fs');
const path = require('path');

const SRC  = path.resolve(__dirname, '../../docs/github-actions-handbook.md');
const OUT  = path.resolve(__dirname, '../../website/src/content/docs/handbook');

// heading text → diagram filename, same as the docx builder uses
const DIAGRAMS = {
  'How it works under the hood':                                         'lifecycle.png',
  'The Actions UI, in a quick tour':                                     'ui-layout.png',
  'Scenario 2 — Sequential execution':                                   'scenario-02-sequential.png',
  'Scenario 3 — Parallel execution':                                     'scenario-03-parallel.png',
  'Scenario 4 — Mixed (sequential then parallel then sequential)':       'scenario-04-mixed.png',
  'Scenario 7 — Environment-based deployment with approval gates':       'scenario-07-environments.png',
  'Scenario 11 — Auto-rollback on health check failure':                 'scenario-11-rollback.png',
  'Scenario 12 — Workflow chaining with `workflow_run`':                 'scenario-12-chaining.png',
  'The full flow':                                                       'end-to-end.png',
};

function slugify(s) {
  return s
    .toLowerCase()
    .replace(/[—–]/g, '-')
    .replace(/[`*_~]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function escapeYaml(s) {
  return s.replace(/'/g, "''");
}

const md    = fs.readFileSync(SRC, 'utf-8');
const lines = md.split('\n');

// Drop the existing TOC block at the top — Starlight gives us nav for free.
let bodyStart = 0;
for (let i = 0; i < lines.length; i++) {
  // Skip until we hit the first ## heading
  if (lines[i].match(/^##\s+\d+\./)) { bodyStart = i; break; }
}

// Split into sections by `## N. Title`
const sections = [];
let current   = null;
for (let i = bodyStart; i < lines.length; i++) {
  const m = lines[i].match(/^##\s+(\d+)\.\s+(.*)$/);
  if (m) {
    if (current) sections.push(current);
    current = { num: parseInt(m[1], 10), title: m[2].trim(), lines: [] };
    continue;
  }
  if (current) current.lines.push(lines[i]);
}
if (current) sections.push(current);

fs.mkdirSync(OUT, { recursive: true });
// Clear old generated files
for (const f of fs.readdirSync(OUT)) fs.unlinkSync(path.join(OUT, f));

for (const sec of sections) {
  const padded = String(sec.num).padStart(2, '0');
  const slug   = `${padded}-${slugify(sec.title)}`;
  const file   = path.join(OUT, `${slug}.md`);

  // Inject a diagram image right after a sub-heading that has one mapped.
  const out = [];
  for (let j = 0; j < sec.lines.length; j++) {
    const ln = sec.lines[j];
    out.push(ln);
    const sub = ln.match(/^####?\s+(.*)$/);
    if (sub && DIAGRAMS[sub[1].trim()]) {
      out.push('');
      out.push(`![${sub[1].trim()}](/diagrams/${DIAGRAMS[sub[1].trim()]})`);
    }
  }

  // Trim trailing/leading blank lines
  while (out.length && out[0].trim() === '') out.shift();
  while (out.length && out[out.length - 1].trim() === '') out.pop();

  // Trim a trailing horizontal rule line that came from the section divider
  while (out.length && out[out.length - 1].trim() === '---') out.pop();

  const fm = [
    '---',
    `title: '${escapeYaml(sec.title)}'`,
    `description: 'Section ${sec.num} of the GitHub Actions Handbook.'`,
    `sidebar:`,
    `  order: ${sec.num}`,
    '---',
    '',
  ].join('\n');

  fs.writeFileSync(file, fm + out.join('\n') + '\n');
  console.log(`wrote ${slug}.md (${out.length} lines)`);
}

console.log(`\n${sections.length} pages created in ${OUT}`);
