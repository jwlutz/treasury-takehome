import { NextRequest, NextResponse } from 'next/server';
import { loadExamples, randomExample, type ExampleCategory } from '../../../lib/examples';

export const runtime = 'nodejs';

const VALID: ExampleCategory[] = ['compliant', 'noncompliant', 'unclear', 'real'];

// GET ?category=compliant|noncompliant|unclear|real -> one random example from that bucket.
// GET with no category -> one of each disposition (the legacy demo set).
export function GET(req: NextRequest) {
  try {
    const cat = req.nextUrl.searchParams.get('category');
    if (cat) {
      if (!VALID.includes(cat as ExampleCategory)) {
        return NextResponse.json({ error: `unknown category "${cat}"` }, { status: 400 });
      }
      const example = randomExample(cat as ExampleCategory);
      if (!example) return NextResponse.json({ error: `no examples for "${cat}"` }, { status: 404 });
      return NextResponse.json({ example });
    }
    return NextResponse.json({ examples: loadExamples() });
  } catch (e) {
    console.error('examples failed', e);
    return NextResponse.json({ error: 'could not load examples' }, { status: 500 });
  }
}
