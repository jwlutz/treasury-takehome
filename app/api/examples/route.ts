import { NextResponse } from 'next/server';
import { loadExamples } from '../../../lib/examples';

export const runtime = 'nodejs';

export function GET() {
  try {
    return NextResponse.json({ examples: loadExamples() });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'could not load examples' }, { status: 500 });
  }
}
