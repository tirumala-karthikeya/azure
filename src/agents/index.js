const { AzureOpenAI } = require('openai');
const yaml = require('js-yaml');
const fs = require('node:fs');
const path = require('node:path');

const DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT;
const client = new AzureOpenAI({
  endpoint: process.env.AZURE_OPENAI_ENDPOINT,
  apiKey: process.env.AZURE_OPENAI_API_KEY,
  apiVersion: process.env.AZURE_OPENAI_API_VERSION || '2024-10-21',
  deployment: DEPLOYMENT,
});

const ROOT = path.resolve(__dirname, '..', '..');
const COPILOT = path.join(ROOT, '.github', 'copilot');
const CAPABILITY = path.join(COPILOT, 'jira-story');

function loadFile(file) {
  return fs.readFileSync(path.join(CAPABILITY, file), 'utf8');
}

const SCHEMA = loadFile('schema.yaml');
const PROMPTS = {
  generator: loadFile('generator.md'),
  validator: loadFile('validator.md'),
  planner: loadFile('planner.md'),
};

async function callAgent({ systemPrompt, userInput }) {
  const response = await client.chat.completions.create({
    model: DEPLOYMENT,
    max_tokens: 4096,
    temperature: 0.2,
    messages: [
      { role: 'system', content: `${systemPrompt}\n\n# Schema reference\n\n${SCHEMA}` },
      { role: 'user', content: userInput },
    ],
  });

  const text = response.choices[0]?.message?.content || '';
  return { text, usage: response.usage };
}

async function generateStory(input) {
  return callAgent({ systemPrompt: PROMPTS.generator, userInput: input });
}

async function validateStory(storyYaml) {
  return callAgent({ systemPrompt: PROMPTS.validator, userInput: storyYaml });
}

async function planStory(storyYaml) {
  return callAgent({ systemPrompt: PROMPTS.planner, userInput: storyYaml });
}

function logUsage(label, usage) {
  if (!usage) return;
  console.error(
    `[${label}] prompt=${usage.prompt_tokens} completion=${usage.completion_tokens} total=${usage.total_tokens}`
  );
}

function parseYaml(text) {
  const stripped = text
    .replace(/^\s*```(?:yaml)?\s*\n?/, '')
    .replace(/\n?```\s*$/, '')
    .trim();
  return yaml.load(stripped);
}

const PRIORITY_MAP = { P0: 'Highest', P1: 'High', P2: 'Medium', P3: 'Low' };

const adf = {
  doc: (...content) => ({ type: 'doc', version: 1, content }),
  heading: (text, level = 2) => ({
    type: 'heading',
    attrs: { level },
    content: [{ type: 'text', text }],
  }),
  paragraph: (text) => ({
    type: 'paragraph',
    content: [{ type: 'text', text }],
  }),
  bulletList: (items) => ({
    type: 'bulletList',
    content: items.map((text) => ({
      type: 'listItem',
      content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
    })),
  }),
};

function buildDescription(story, planner) {
  const blocks = [
    adf.heading('Description'),
    adf.paragraph(String(story.description || '').trim()),
    adf.heading('Business Value'),
    adf.paragraph(String(story.business_value || '').trim()),
    adf.heading('Acceptance Criteria'),
    adf.bulletList(story.acceptance_criteria || []),
  ];

  if (story.technical_notes) {
    blocks.push(adf.heading('Technical Notes'));
    blocks.push(adf.paragraph(String(story.technical_notes).trim()));
  }

  if (Array.isArray(story.dependencies) && story.dependencies.length) {
    blocks.push(adf.heading('Dependencies'));
    blocks.push(adf.bulletList(story.dependencies));
  }

  if (Array.isArray(story.risks) && story.risks.length) {
    blocks.push(adf.heading('Risks'));
    blocks.push(adf.bulletList(story.risks));
  }

  if (planner && Array.isArray(planner.tasks) && planner.tasks.length) {
    blocks.push(adf.heading('Engineering Tasks'));
    blocks.push(
      adf.bulletList(
        planner.tasks.map((t) => `${t.id}: ${t.title} (${t.estimate_hours}h)`)
      )
    );
  }

  if (planner && planner.effort_review) {
    const er = planner.effort_review;
    blocks.push(adf.heading('Effort Review'));
    blocks.push(
      adf.paragraph(
        `Declared: ${er.declared} | Implied: ${er.implied} | Match: ${er.match}. ${er.reason || ''}`.trim()
      )
    );
  }

  if (planner && typeof planner.readiness_score === 'number') {
    blocks.push(adf.heading(`Readiness: ${planner.readiness_score}/100`));
    if (Array.isArray(planner.readiness_notes) && planner.readiness_notes.length) {
      blocks.push(adf.bulletList(planner.readiness_notes));
    }
  }

  return adf.doc(...blocks);
}

async function createJiraIssue({ validationYaml, plannerYaml }) {
  const required = ['JIRA_BASE_URL', 'JIRA_EMAIL', 'JIRA_API_TOKEN', 'JIRA_PROJECT_KEY'];
  for (const k of required) {
    if (!process.env[k]) throw new Error(`Missing env var: ${k}`);
  }

  const validation = parseYaml(validationYaml);
  if (validation && validation.verdict === 'rejected') {
    return { skipped: true, reason: 'Validator rejected the story; not creating Jira issue.' };
  }

  const planner = parseYaml(plannerYaml);
  const story = (planner && planner.story) || {};
  if (!story.title) throw new Error('Planner output missing story.title');

  const issueType = process.env.JIRA_ISSUE_TYPE || 'Task';
  const payload = {
    fields: {
      project: { key: process.env.JIRA_PROJECT_KEY },
      summary: story.title,
      issuetype: { name: issueType },
      description: buildDescription(story, planner),
    },
  };

  if (story.priority && PRIORITY_MAP[story.priority]) {
    payload.fields.priority = { name: PRIORITY_MAP[story.priority] };
  }

  const auth = Buffer.from(
    `${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`
  ).toString('base64');
  const url = `${process.env.JIRA_BASE_URL.replace(/\/$/, '')}/rest/api/3/issue`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Jira API ${res.status}: ${body}`);
  }

  const data = await res.json();
  return {
    skipped: false,
    key: data.key,
    id: data.id,
    url: `${process.env.JIRA_BASE_URL.replace(/\/$/, '')}/browse/${data.key}`,
    verdict: validation ? validation.verdict : 'unknown',
  };
}

async function runPipeline(input, { dryRun = false } = {}) {
  console.log('=== Stage 1: Generate ===\n');
  const gen = await generateStory(input);
  console.log(gen.text);
  logUsage('generator', gen.usage);

  console.log('\n=== Stage 2: Validate ===\n');
  const val = await validateStory(gen.text);
  console.log(val.text);
  logUsage('validator', val.usage);

  console.log('\n=== Stage 3: Plan ===\n');
  const plan = await planStory(gen.text);
  console.log(plan.text);
  logUsage('planner', plan.usage);

  let jira = null;
  if (!dryRun) {
    console.log('\n=== Stage 4: Push to Jira ===\n');
    try {
      jira = await createJiraIssue({ validationYaml: val.text, plannerYaml: plan.text });
      if (jira.skipped) {
        console.log(`Skipped: ${jira.reason}`);
      } else {
        console.log(`Created ${jira.key} (${jira.verdict})`);
        console.log(`URL: ${jira.url}`);
      }
    } catch (err) {
      console.error(`Jira push failed: ${err.message}`);
      jira = { error: err.message };
    }
  }

  return { story: gen.text, validation: val.text, plan: plan.text, jira };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const input = args.filter((a) => a !== '--dry-run').join(' ').trim();
  if (!input) {
    console.error('Usage: node src/agents/index.js [--dry-run] "<your story idea>"');
    process.exit(1);
  }
  runPipeline(input, { dryRun }).catch((err) => {
    console.error('Pipeline error:', err);
    process.exit(1);
  });
}

module.exports = { generateStory, validateStory, planStory, createJiraIssue, runPipeline };
