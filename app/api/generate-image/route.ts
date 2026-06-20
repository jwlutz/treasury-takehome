// live label image generation. takes a prompt, calls an image model server-side (key stays here),
// returns a data url. slow + exempt from the 5s verify budget; "generate & test" is the demo feature.
// in the blocked-outbound prod environment this will fail and the client falls back to the svg template.
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MODEL = process.env.IMAGE_MODEL ?? 'gpt-image-1';
const isDalle = MODEL.startsWith('dall-e');
// only sizes the active model accepts (the param is public, so validate it rather than pass it through)
const SIZES = isDalle ? ['1024x1024', '1024x1792', '1792x1024'] : ['1024x1024', '1024x1536', '1536x1024', 'auto'];
const DEFAULT_SIZE = isDalle ? '1024x1792' : '1024x1536'; // portrait: a bottle
const MAX_PROMPT = 2000;

let _client: OpenAI | null = null;
const client = () => (_client ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY }));

export async function POST(req: NextRequest) {
  try {
    const { prompt, size } = await req.json();
    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ error: 'a prompt is required' }, { status: 400 });
    }
    if (prompt.length > MAX_PROMPT) {
      return NextResponse.json({ error: 'prompt is too long' }, { status: 400 });
    }
    if (size != null && !SIZES.includes(size)) {
      return NextResponse.json({ error: 'unsupported size' }, { status: 400 });
    }

    const params: any = { model: MODEL, prompt, n: 1, size: size ?? DEFAULT_SIZE };
    if (isDalle) params.response_format = 'b64_json'; // gpt-image-1 rejects this param and returns b64 by default

    const res = await client().images.generate(params);
    const b64: string | null = res.data?.[0]?.b64_json ?? null;
    if (!b64) return NextResponse.json({ error: 'the image model returned no image' }, { status: 502 });

    return NextResponse.json({ image: `data:image/png;base64,${b64}`, model: MODEL });
  } catch (e) {
    console.error('generate-image failed', e);
    return NextResponse.json({ error: 'image generation failed' }, { status: 500 });
  }
}
