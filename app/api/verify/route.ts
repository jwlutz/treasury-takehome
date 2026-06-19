import { NextResponse } from 'next/server';
import { verifyImage } from '../../../lib/pipeline';
import type { ApplicationFields } from '../../../lib/policy/types';

export const runtime = 'nodejs'; // sharp + the openai sdk need node, not the edge runtime
export const maxDuration = 30; // headroom over the 5s target

const REQUIRED: (keyof ApplicationFields)[] = [
  'beverage_type',
  'brand_name',
  'class_type',
  'alcohol_content',
  'net_contents',
  'producer_name',
  'producer_address',
  'country_of_origin',
];

export async function POST(req: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: 'server is missing OPENAI_API_KEY' }, { status: 500 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'expected multipart/form-data' }, { status: 400 });
  }

  const file = form.get('image');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'no image uploaded' }, { status: 400 });
  }

  let app: ApplicationFields;
  try {
    app = JSON.parse(String(form.get('application') ?? ''));
  } catch {
    return NextResponse.json({ error: 'application values are not valid json' }, { status: 400 });
  }
  const missing = REQUIRED.filter((k) => !String(app?.[k] ?? '').trim());
  if (missing.length) {
    return NextResponse.json({ error: `missing application values: ${missing.join(', ')}` }, { status: 400 });
  }

  // image stays in memory for the duration of the call only - nothing is written to disk (no pii at rest)
  const image = Buffer.from(await file.arrayBuffer());
  const mime = file.type || 'image/jpeg';

  try {
    return NextResponse.json(await verifyImage(image, app, mime));
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'verification failed' }, { status: 502 });
  }
}
