const { app } = require('@azure/functions');
const { runPipeline } = require('../agents/index.js');

app.http('createStory', {
  methods: ['GET', 'POST'],
  authLevel: 'anonymous',
  route: 'createstory',
  handler: async (request, context) => {
    let input;
    let dryRun = false;

    if (request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      input = body.input;
      dryRun = Boolean(body.dryRun);
    } else {
      input = request.query.get('input');
      const flag = request.query.get('dryRun');
      dryRun = flag === '1' || flag === 'true';
    }

    if (!input || !input.trim()) {
      return {
        status: 400,
        jsonBody: {
          ok: false,
          error: 'Missing "input". Provide ?input=... (GET) or { "input": "..." } (POST).',
        },
      };
    }

    context.log(`Pipeline start (dryRun=${dryRun}): ${input.slice(0, 100)}`);

    try {
      const result = await runPipeline(input, { dryRun });
      return { status: 200, jsonBody: { ok: true, ...result } };
    } catch (err) {
      context.error('Pipeline failed:', err);
      return { status: 500, jsonBody: { ok: false, error: err.message } };
    }
  },
});
