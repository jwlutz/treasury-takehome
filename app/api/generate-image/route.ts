// live label image generation. takes a prompt, calls an image model server-side (key stays here),
// returns a data url. slow + exempt from the 5s verify budget; "generate & test" is the demo feature.
// in the blocked-outbound prod environment this will fail and the client falls back to the svg template.
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MODEL = process.env.IMAGE_MODEL ?? 'gpt-image-1';

let _client: OpenAI | null = null;
const client = () => (_client ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY }));

export async function POST(req: NextRequest) {
  try {
    const { prompt, size } = await req.json();
    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ error: 'a prompt is required' }, { status: 400 });
    }

    const params: any = {
      model: MODEL,
      prompt,
      n: 1,
      size: size ?? (MODEL.startsWith('dall-e') ? '1024x1792' : '1024x1536'), // portrait: a bottle
    };
    if (MODEL.startsWith('dall-e')) params.response_format = 'b64_json'; // gpt-image-1 rejects this param

    const res = await client().images.generate(params);
    const d: any = res.data?.[0];
    let b64: string | null = d?.b64_json ?? null;
    if (!b64 && d?.url) {
      // dall-e can hand back a url instead of bytes; fetch + inline it so nothing leaks client-side
      b64 = Buffer.from(await (await fetch(d.url)).arrayBuffer()).toString('base64');
    }
    if (!b64) return NextResponse.json({ error: 'the image model returned no image' }, { status: 502 });

    return NextResponse.json({ image: `data:image/png;base64,${b64}`, model: MODEL });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'image generation failed' }, { status: 500 });
  }
}
