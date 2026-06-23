import { NextResponse } from 'next/server';
import { verifyImage } from '../../../lib/pipeline';
import type { ApplicationFields } from '../../../lib/policy/types';

export const runtime = 'nodejs'; // the openai sdk needs node, not the edge runtime
export const maxDuration = 30; // headroom over the 5s target

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // bound the upload before we hand it to the vision model
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

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

// stand-in application for lookup mode, where the values come from the image rather than the form.
const BLANK_APP: ApplicationFields = {
  beverage_type: 'other',
  brand_name: '',
  class_type: '',
  alcohol_content: '',
  net_contents: '',
  producer_name: '',
  producer_address: '',
  country_of_origin: '',
};

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
  if (file.size > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: 'image is too large (max 10MB)' }, { status: 413 });
  }
  if (file.type && !ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'unsupported image type (use jpeg, png, or webp)' }, { status: 415 });
  }

  // lookup mode = "fill from image": the model reads the label to stand in for the COLA lookup, so the
  // application fields aren't supplied and the required-values guard is skipped.
  const lookup = String(form.get('mode') ?? 'given') === 'lookup';

  let app: ApplicationFields = BLANK_APP;
  try {
    const raw = form.get('application');
    if (raw) app = JSON.parse(String(raw));
  } catch {
    if (!lookup) return NextResponse.json({ error: 'application values are not valid json' }, { status: 400 });
  }
  if (!lookup) {
    const missing = REQUIRED.filter((k) => !String(app?.[k] ?? '').trim());
    if (missing.length) {
      return NextResponse.json({ error: `missing application values: ${missing.join(', ')}` }, { status: 400 });
    }
  }

  // image stays in memory for the duration of the call only - nothing is written to disk (no pii at rest)
  const image = Buffer.from(await file.arrayBuffer());
  const mime = file.type || 'image/jpeg';

  try {
    return NextResponse.json(await verifyImage(image, app, mime, { lookup }));
  } catch (e) {
    console.error('verify failed', e);
    return NextResponse.json({ error: 'verification failed' }, { status: 502 });
  }
}
