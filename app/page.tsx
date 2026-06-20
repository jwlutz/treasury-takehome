'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { ApplicationFields, Decision, FieldCheck } from '../lib/policy/types';
import { DECISION, SEV_MARK, checkLabel } from './ui';
import { generate, imagePrompt, renderLabelSvg, type Scenario } from '../lib/generate';
import { recordUsage, useUsage } from './usage';
import RadialMenu, { type RadialItem } from './RadialMenu';

interface VerifyResponse {
  decision: Decision;
  checks: FieldCheck[];
  latencyMs: number;
  confidence: number | null;
}

interface Example {
  id: string;
  title: string;
  blurb: string;
  application: ApplicationFields;
  image: string;
  mime: string;
}

const BEVERAGES: { value: ApplicationFields['beverage_type']; label: string }[] = [
  { value: 'distilled_spirits', label: 'Distilled spirits' },
  { value: 'wine', label: 'Wine' },
  { value: 'malt_beverage', label: 'Malt beverage / beer' },
];

// text fields shown on the form, in the order an examiner reads a label
const TEXT_FIELDS: { key: keyof ApplicationFields; label: string; wide?: boolean }[] = [
  { key: 'brand_name', label: 'Brand name' },
  { key: 'class_type', label: 'Class / type' },
  { key: 'alcohol_content', label: 'Alcohol content' },
  { key: 'net_contents', label: 'Net contents' },
  { key: 'producer_name', label: 'Producer / bottler name' },
  { key: 'producer_address', label: 'Producer / bottler address' },
  { key: 'country_of_origin', label: 'Country of origin', wide: true },
];

const EMPTY: ApplicationFields = {
  beverage_type: 'distilled_spirits',
  brand_name: '',
  class_type: '',
  alcohol_content: '',
  net_contents: '',
  producer_name: '',
  producer_address: '',
  country_of_origin: '',
};

async function dataUrlToFile(dataUrl: string, name: string): Promise<File> {
  const blob = await (await fetch(dataUrl)).blob();
  return new File([blob], name, { type: blob.type });
}

// rasterize a self-contained svg to a png file in the browser (no outbound, uses system fonts)
function svgToPngFile(svg: string, name: string): Promise<File> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || 760;
      canvas.height = img.naturalHeight || 1000;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error('canvas unavailable'));
        return;
      }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob((b) => (b ? resolve(new File([b], name, { type: 'image/png' })) : reject(new Error('render failed'))), 'image/png');
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('svg render failed'));
    };
    img.src = url;
  });
}

export default function Home() {
  const router = useRouter();
  const usage = useUsage();
  const [app, setApp] = useState<ApplicationFields>(EMPTY);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>('');
  const [result, setResult] = useState<VerifyResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [genStatus, setGenStatus] = useState('');
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [generated, setGenerated] = useState<{ note: string; expected: 'approve' | 'reject' } | null>(null);
  const resultRef = useRef<HTMLHeadingElement>(null);

  // move focus to the result so screen readers and keyboard users land on the outcome
  useEffect(() => {
    if (result) resultRef.current?.focus();
  }, [result]);

  // paste an image straight from the clipboard (usability: browse + drag-drop + paste)
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith('image/'));
      const f = item?.getAsFile();
      if (f) takeFile(f);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, []);

  function setField(key: keyof ApplicationFields, value: string) {
    setApp((prev) => ({ ...prev, [key]: value }));
  }

  function takeFile(f: File | null) {
    setResult(null);
    setError('');
    setGenerated(null);
    setFile(f);
    setPreview(f ? URL.createObjectURL(f) : '');
  }

  async function loadExample(ex: Example) {
    setApp(ex.application);
    setResult(null);
    setError('');
    setGenerated(null);
    const f = await dataUrlToFile(ex.image, `${ex.id}.${ex.mime.split('/')[1] ?? 'jpg'}`);
    setFile(f);
    setPreview(ex.image);
  }

  // pull a *random* label from the bank for this outcome, so "try an example" isn't the same one twice
  async function loadRandomExample(category: 'compliant' | 'noncompliant' | 'unclear') {
    setError('');
    try {
      const res = await fetch(`/api/examples?category=${category}`);
      const data = await res.json();
      if (!res.ok || !data.example) throw new Error(data.error ?? 'could not load an example');
      await loadExample(data.example);
    } catch (err: any) {
      setError(err?.message ?? 'could not load an example');
    }
  }

  async function runVerify(f: File, a: ApplicationFields) {
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const fd = new FormData();
      fd.append('image', f);
      fd.append('application', JSON.stringify(a));
      const res = await fetch('/api/verify', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'verification failed');
      setResult(data);
      recordUsage({ verifications: 1, tokens: data.tokens ?? 0 });
    } catch (err: any) {
      setError(err?.message ?? 'something went wrong');
    } finally {
      setLoading(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!file) {
      setError('add a label image first.');
      return;
    }
    runVerify(file, app);
  }

  // "generate a test" runs a label through the verifier and shows expected-vs-got.
  // compliant leans on an ACTUAL label from the bank: correct text -> reliably approves. live image-gen
  // garbles exact numbers + the verbatim warning, so it can't be trusted to produce a clean pass.
  async function loadCompliantFromBank() {
    setGenStatus('Loading a real compliant label…');
    try {
      const res = await fetch('/api/examples?category=compliant');
      const data = await res.json();
      if (!res.ok || !data.example) throw new Error(data.error ?? 'could not load a compliant label');
      const ex = data.example;
      const f = await dataUrlToFile(ex.image, `${ex.id}.${ex.mime.split('/')[1] ?? 'jpg'}`);
      setApp(ex.application);
      setFile(f);
      setPreview(ex.image);
      setGenerated({ note: 'a real compliant label from the bank', expected: 'approve' });
      setGenStatus('');
      await runVerify(f, ex.application);
    } catch (err: any) {
      setGenStatus('');
      setError(err?.message ?? 'could not load a compliant label');
    }
  }

  // noncompliant generates a fresh flawed label from the image model (it should reject either way, so
  // text garble is harmless here). offline svg template as the fallback when the model is unavailable.
  async function generateNoncompliant() {
    const g = generate('noncompliant');
    setGenStatus('Generating a label image from the model… this usually takes 30–45s');
    try {
      let f: File;
      let fellBack = false;
      try {
        const res = await fetch('/api/generate-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: imagePrompt(g.art) }),
        });
        const data = await res.json();
        if (!res.ok || !data.image) throw new Error(data.error ?? 'image generation failed');
        f = await dataUrlToFile(data.image, 'generated.png');
      } catch {
        fellBack = true;
        f = await svgToPngFile(renderLabelSvg(g.art), 'generated.png');
      }
      setApp(g.application);
      setFile(f);
      setPreview(URL.createObjectURL(f));
      setGenerated({ note: fellBack ? `${g.note} (image model unavailable, used the offline template)` : g.note, expected: g.expected });
      recordUsage({ images: 1 });
      setGenStatus('');
      await runVerify(f, g.application);
    } catch (err: any) {
      setGenStatus('');
      setError(err?.message ?? 'could not generate a label');
    }
  }

  // compliant -> real bank label; noncompliant -> live image-gen; random -> a coin flip between them.
  async function generateAndRun(scenario: Scenario) {
    setError('');
    setResult(null);
    setGenerated(null);
    const compliant = scenario === 'compliant' || (scenario === 'random' && Math.random() < 0.5);
    if (compliant) await loadCompliantFromBank();
    else await generateNoncompliant();
  }

  function clearAll() {
    setApp(EMPTY);
    takeFile(null);
  }

  const radialItems: RadialItem[] = [
    {
      id: 'examples',
      label: 'Try example',
      dataGuide: 'examples',
      options: [
        { label: 'Compliant', tone: 'success', onSelect: () => loadRandomExample('compliant') },
        { label: 'Noncompliant', tone: 'danger', onSelect: () => loadRandomExample('noncompliant') },
        { label: 'Unclear photo', tone: 'warning', onSelect: () => loadRandomExample('unclear') },
      ],
    },
    {
      id: 'generate',
      label: 'Generate test',
      dataGuide: 'generate',
      options: [
        { label: 'Compliant', tone: 'success', onSelect: () => generateAndRun('compliant') },
        { label: 'Noncompliant', tone: 'danger', onSelect: () => generateAndRun('noncompliant') },
        { label: 'Random', onSelect: () => generateAndRun('random') },
      ],
    },
    { id: 'batch', label: 'Batch', onSelect: () => router.push('/batch') },
  ];

  return (
    <main className="home">
      <header>
        <h1>Label check</h1>
        <p>Compare uploaded photo of label to application values.</p>
      </header>

      <div className="workspace">
        <aside className="rail">
          <div className="rail-usage">
            <div className="rail-usage-top">Usage · session</div>
            <div className="rail-usage-tokens">
              <b>{usage.tokens.toLocaleString()}</b> tokens
            </div>
            <div className="meta">
              {usage.verifications} checks · {usage.chats} chats · {usage.images} generated
            </div>
          </div>
          <RadialMenu items={radialItems} />
        </aside>

        {/* middle column: the image, then the result right under it (not full-width at the page foot) */}
        <div className="stage-col">
          <section
            className={`stage${dragOver ? ' over' : ''}`}
            data-guide="upload"
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              takeFile(e.dataTransfer.files?.[0] ?? null);
            }}
          >
            {genStatus ? (
              <div className="stage-busy" aria-live="polite">
                <span className="spinner" aria-hidden="true" />
                {genStatus}
              </div>
            ) : preview ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="stage-img" src={preview} alt="label preview" />
                <button type="button" className="stage-replace" onClick={clearAll}>
                  Replace
                </button>
              </>
            ) : (
              <label className="drop">
                <b>Drop a label photo here</b>
                <small>or choose a file · paste · this becomes the image once loaded</small>
                <input className="visually-hidden" type="file" accept="image/*" onChange={(e) => takeFile(e.target.files?.[0] ?? null)} />
              </label>
            )}
          </section>

          {error && (
            <div className="alert" role="alert">
              {error}
            </div>
          )}

          {result && (
            <section aria-live="polite" data-guide="result" className="result-section">
              <h2>Result</h2>
              <div className={`banner ${DECISION[result.decision].tone}`}>
                <span className="mark" aria-hidden="true">
                  {DECISION[result.decision].mark}
                </span>
                <div>
                  <h3 tabIndex={-1} ref={resultRef}>
                    {DECISION[result.decision].label}
                  </h3>
                  <p>{DECISION[result.decision].blurb}</p>
                </div>
              </div>

              <p className="meta">
                checked in {(result.latencyMs / 1000).toFixed(1)}s
                {result.confidence != null && <> · read confidence {(result.confidence * 100).toFixed(0)}%</>}
              </p>

              {generated && (
                <div className={`gen-note ${result.decision === generated.expected ? 'ok' : 'bad'}`}>
                  Generated test. {generated.note}. Expected to {generated.expected}; got {result.decision}
                  {result.decision === generated.expected ? ' ✓' : ' ✗'}
                </div>
              )}

              <ul className="checks">
                {result.checks.map((c) => (
                  <li key={c.field} className={`sev-${c.severity}`}>
                    <span className="mark" aria-hidden="true">
                      {SEV_MARK[c.severity] ?? '•'}
                    </span>
                    <span>
                      <span className="name">{checkLabel(c.field)}</span>
                      {c.message && <span className="msg"> — {c.message}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <form className="fields" onSubmit={submit}>
          <fieldset>
            <legend>Application values</legend>
            <div className="grid">
              <div className="field" data-guide="field-beverage_type">
                <label htmlFor="beverage_type">Beverage type</label>
                <select id="beverage_type" value={app.beverage_type} onChange={(e) => setField('beverage_type', e.target.value)}>
                  {BEVERAGES.map((b) => (
                    <option key={b.value} value={b.value}>
                      {b.label}
                    </option>
                  ))}
                </select>
              </div>
              {TEXT_FIELDS.map((f) => (
                <div key={f.key} data-guide={`field-${f.key}`} className={`field${f.wide ? ' wide' : ''}`}>
                  <label htmlFor={f.key}>{f.label}</label>
                  <input id={f.key} type="text" value={app[f.key]} onChange={(e) => setField(f.key, e.target.value)} />
                </div>
              ))}
            </div>
          </fieldset>

          <div className="actions">
            <button className="btn" type="submit" disabled={loading} data-guide="verify">
              {loading ? 'Checking...' : 'Verify label'}
            </button>
            <button className="btn secondary" type="button" disabled={loading} onClick={clearAll}>
              Clear
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
