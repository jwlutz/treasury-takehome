import { NextResponse } from 'next/server';
import OpenAI from 'openai';

export const runtime = 'nodejs';

const MODEL = process.env.MODEL ?? 'gpt-5.4-mini';
const isReasoning = /^(gpt-5|o\d)/.test(MODEL);

let _client: OpenAI | null = null;
const client = () => (_client ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY }));

// the elements the guide is allowed to point at, per page. the model may only use these ids.
const TARGETS: Record<string, { id: string; what: string }[]> = {
  single: [
    { id: 'examples', what: 'the "try an example" buttons that load a sample with no upload' },
    { id: 'upload', what: 'the box to drop or choose a label image' },
    { id: 'field-beverage_type', what: 'the beverage type selector' },
    { id: 'field-brand_name', what: 'the brand name field' },
    { id: 'field-class_type', what: 'the class / type field' },
    { id: 'field-alcohol_content', what: 'the alcohol content field' },
    { id: 'field-net_contents', what: 'the net contents field' },
    { id: 'verify', what: 'the button that runs the check' },
    { id: 'result', what: 'the result, shown after a check has run' },
    { id: 'nav-batch', what: 'the link to check many labels at once' },
  ],
  batch: [
    { id: 'sample', what: 'the button that loads a ready-made batch of 15 labels' },
    { id: 'csv', what: 'where to upload the CSV of application values' },
    { id: 'images', what: 'where to upload the label image files' },
    { id: 'run', what: 'the button that runs the whole batch' },
    { id: 'dashboard', what: 'the dashboard view with the summary and table (after a run)' },
    { id: 'review-queue', what: 'the review queue of labels that need a human (after a run)' },
    { id: 'nav-single', what: 'the link to check a single label' },
  ],
};

function systemPrompt(page: string) {
  const targets = TARGETS[page] ?? TARGETS.single;
  const list = targets.map((t) => `- ${t.id}: ${t.what}`).join('\n');
  return `You are the guide for "Label check", a tool that checks alcohol beverage labels against the values on a submission and returns approve / needs review / reject with reasons. It is a triage helper for a compliance reviewer, not an auto-approver.

Some people using this are not technical and may be new to the tool, so explain plainly and briefly, one step at a time. Be warm and concrete.

How it works:
- A reviewer adds a label photo and the submitted application values; the app reads the label and compares the two.
- approve = the label matches. needs review = a human should look (a field not readable, or an image-quality problem). reject = a real compliance problem (a value mismatch, or the government warning is missing or wrong).
- The government warning must match the required text exactly, with the "GOVERNMENT WARNING" header in capitals and bold.
- "Single label" checks one at a time. "Batch" checks many at once with a CSV.

You can point at one thing on screen by returning its id in "highlight". Only use an id from this list for the current page:
${list}

Rules:
- "say" is your reply: short, plain, 1 to 3 sentences.
- Set "highlight" to one id when pointing at something would help, otherwise null.
- Only answer questions about using this tool. If asked something unrelated, say so briefly and steer back.`;
}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['say', 'highlight'],
  properties: {
    say: { type: 'string' },
    highlight: { type: ['string', 'null'] },
  },
};

export async function POST(req: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: 'server is missing OPENAI_API_KEY' }, { status: 500 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'expected json' }, { status: 400 });
  }

  const page = body.page === 'batch' ? 'batch' : 'single';
  const history = Array.isArray(body.messages) ? body.messages.slice(-8) : [];
  const messages = [
    { role: 'system', content: systemPrompt(page) },
    ...history.map((m: any) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content ?? '').slice(0, 1000),
    })),
  ];

  const params: any = {
    model: MODEL,
    messages,
    response_format: { type: 'json_schema', json_schema: { name: 'guide_reply', strict: true, schema: SCHEMA } },
  };
  if (!isReasoning) params.temperature = 0.3; // reasoning models reject temperature

  try {
    const res = await client().chat.completions.create(params);
    const out = JSON.parse(res.choices[0].message.content ?? '{}');
    return NextResponse.json({ say: String(out.say ?? ''), highlight: out.highlight ?? null });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'guide failed' }, { status: 502 });
  }
}
