// evidence extraction: one image -> an evidence record (facts visible in THIS photo only).
// the model is told it is NOT deciding compliance and NOT comparing to an application.
import OpenAI from 'openai';
import type { EvidenceRecord } from '../policy/types';

const MODEL = process.env.MODEL ?? 'gpt-5.4-mini';
const DETAIL = (process.env.DETAIL ?? 'high') as 'high' | 'auto' | 'low';
const isReasoning = /^(gpt-5|o\d)/.test(MODEL); // gpt-5.x / o-series take reasoning-style params

let _client: OpenAI | null = null;
const client = () => (_client ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY }));

export const SYSTEM = `You create an evidence record from a photo of one alcohol beverage label.

You are not deciding compliance. You are not comparing against an application. You only extract text and visual facts visible in THIS image.

Rules:
- Transcribe only visible printed text. Do not infer missing words from TTB rules or common label wording.
- value = the cleaned value (strip captions like "Net Contents:" or lead-ins like "Produced and bottled by"). evidence_text = the exact surrounding printed phrase, character-for-character.
- Set value only when it is visibly and confidently readable.
- If a field is absent from this image, set visible=false and value=null. Do NOT treat absence from one photo as noncompliance.
- If a field is degraded by glare, blur, crop, skew, or low contrast but you can still read every character with confidence, record the value and set legible=false. Set value=null only when you genuinely cannot make out the text. Never guess a character.
- location_note: where it appears (front label, back, neck, partly cropped, etc.).
- government_warning: transcribe the full visible warning into text, including the header exactly as printed. Record header_text (exact, preserve its capitalization), header_all_caps, header_bold (visibly heavier weight), separate_from_other_text, and contrast_issue.
- extra_statement: a standalone statement near the mandatory info (e.g. CONTAINS SULFITES); visible=false / value=null if none.
Return JSON only.`;

const FIELD = {
  type: 'object',
  additionalProperties: false,
  required: ['value', 'visible', 'legible', 'evidence_text', 'location_note'],
  properties: {
    value: { type: ['string', 'null'] },
    visible: { type: 'boolean' },
    legible: { type: 'boolean' },
    evidence_text: { type: ['string', 'null'] },
    location_note: { type: 'string' },
  },
};

const WARNING = {
  type: 'object',
  additionalProperties: false,
  required: ['text', 'visible', 'legible', 'header_text', 'header_all_caps', 'header_bold', 'separate_from_other_text', 'contrast_issue'],
  properties: {
    text: { type: ['string', 'null'] },
    visible: { type: 'boolean' },
    legible: { type: 'boolean' },
    header_text: { type: ['string', 'null'] },
    header_all_caps: { type: ['boolean', 'null'] },
    header_bold: { type: ['boolean', 'null'] },
    separate_from_other_text: { type: ['boolean', 'null'] },
    contrast_issue: { type: 'boolean' },
  },
};

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['brand_name', 'class_type', 'alcohol_content', 'net_contents', 'producer_name', 'producer_address', 'country_of_origin', 'government_warning', 'extra_statement'],
  properties: {
    brand_name: FIELD,
    class_type: FIELD,
    alcohol_content: FIELD,
    net_contents: FIELD,
    producer_name: FIELD,
    producer_address: FIELD,
    country_of_origin: FIELD,
    government_warning: WARNING,
    extra_statement: FIELD,
  },
};

export interface ExtractResult {
  evidence: EvidenceRecord;
  raw: any;
  latencyMs: number;
  confidence: number | null; // mean token probability from logprobs
  tokens: number; // total tokens for this call (usage meter)
}

// strip any param a given model rejects (logprobs / temperature / reasoning_effort) and retry once
async function callModel(params: any) {
  try {
    return await client().chat.completions.create(params);
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    const retry = { ...params };
    let changed = false;
    for (const p of ['logprobs', 'top_logprobs', 'temperature', 'reasoning_effort']) {
      if (p in retry && new RegExp(p, 'i').test(msg)) {
        delete retry[p];
        changed = true;
      }
    }
    if (changed) return client().chat.completions.create(retry);
    throw e;
  }
}

export async function extractLabelEvidence(image: Buffer, mime = 'image/jpeg'): Promise<ExtractResult> {
  const b64 = image.toString('base64');
  const params: any = {
    model: MODEL,
    logprobs: true,
    response_format: { type: 'json_schema', json_schema: { name: 'label_evidence', strict: true, schema: SCHEMA } },
    messages: [
      { role: 'system', content: SYSTEM },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Create the evidence record for this alcohol label.' },
          { type: 'image_url', image_url: { url: `data:${mime};base64,${b64}`, detail: DETAIL } },
        ],
      },
    ],
  };
  if (!isReasoning) params.temperature = 0;

  const t0 = Date.now();
  const res = await callModel(params);
  const latencyMs = Date.now() - t0;
  const raw = JSON.parse(res.choices[0].message.content ?? '{}');
  const lps = res.choices[0].logprobs?.content ?? [];
  const confidence = lps.length ? Math.exp(lps.reduce((s: number, t: any) => s + t.logprob, 0) / lps.length) : null;
  return { evidence: raw as EvidenceRecord, raw, latencyMs, confidence, tokens: res.usage?.total_tokens ?? 0 };
}
