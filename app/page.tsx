'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { ApplicationFields, Decision, FieldCheck } from '../lib/policy/types';
import { DECISION, SEV_MARK, checkLabel } from './ui';
import { generate, renderLabelSvg, type Scenario } from '../lib/generate';

interface VerifyResponse {
  decision: Decision;
  checks: FieldCheck[];
  quality: { ok: boolean; reasons: string[] };
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
  const [app, setApp] = useState<ApplicationFields>(EMPTY);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>('');
  const [examples, setExamples] = useState<Example[]>([]);
  const [result, setResult] = useState<VerifyResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [generated, setGenerated] = useState<{ note: string; expected: 'approve' | 'reject' } | null>(null);
  const resultRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    fetch('/api/examples')
      .then((r) => r.json())
      .then((d) => setExamples(d.examples ?? []))
      .catch(() => {});
  }, []);

  // move focus to the result so screen readers and keyboard users land on the outcome
  useEffect(() => {
    if (result) resultRef.current?.focus();
  }, [result]);

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

  // make a synthetic label, rasterize it to a png, and run it straight through the verifier.
  // we own both sides so the expected outcome is known and shown next to the result.
  async function generateAndRun(scenario: Scenario) {
    setError('');
    const g = generate(scenario);
    try {
      const f = await svgToPngFile(renderLabelSvg(g.art), 'generated.png');
      setApp(g.application);
      setFile(f);
      setPreview(URL.createObjectURL(f));
      setGenerated({ note: g.note, expected: g.expected });
      await runVerify(f, g.application);
    } catch (err: any) {
      setError(err?.message ?? 'could not generate a label');
    }
  }

  return (
    <main>
      <header>
        <h1>Label check</h1>
        <p>
          Upload an alcohol label, compare it against the submitted application values, and get a clear
          approve / needs review / reject call with the reasons. A triage tool, not an auto-approval.
        </p>
      </header>

      <h2>Try an example</h2>
      <div className="examples" data-guide="examples">
        {examples.length === 0 && <p className="meta">loading examples...</p>}
        {examples.map((ex) => (
          <button key={ex.id} type="button" className="example" onClick={() => loadExample(ex)}>
            <strong>{ex.title}</strong>
            <span>{ex.blurb}</span>
          </button>
        ))}
      </div>

      <h2>Generate a test</h2>
      <p className="meta">make a fresh label and check it live. we render the image and own the values, so the expected call is known.</p>
      <div className="examples" data-guide="generate">
        <button type="button" className="example" disabled={loading} onClick={() => generateAndRun('compliant')}>
          <strong>Compliant</strong>
          <span>valid label, expect approve</span>
        </button>
        <button type="button" className="example" disabled={loading} onClick={() => generateAndRun('noncompliant')}>
          <strong>Noncompliant</strong>
          <span>break one thing, expect reject</span>
        </button>
        <button type="button" className="example" disabled={loading} onClick={() => generateAndRun('random')}>
          <strong>Random</strong>
          <span>surprise me</span>
        </button>
      </div>

      <form onSubmit={submit}>
        <h2>Label image</h2>
        <label
          data-guide="upload"
          className={`drop${dragOver ? ' over' : ''}`}
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
          <b>Drop a label image here, or choose a file</b>
          <small>jpg or png. nothing is stored - the image is checked in memory and discarded.</small>
          <input
            className="visually-hidden"
            type="file"
            accept="image/*"
            onChange={(e) => takeFile(e.target.files?.[0] ?? null)}
          />
        </label>
        {preview && (
          <div className="preview">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="selected label preview" />
            <span className="meta">{file?.name}</span>
          </div>
        )}

        <h2>Application values</h2>
        <fieldset>
          <legend>What the submission says the label should show</legend>
          <div className="grid">
            <div className="field" data-guide="field-beverage_type">
              <label htmlFor="beverage_type">Beverage type</label>
              <select
                id="beverage_type"
                value={app.beverage_type}
                onChange={(e) => setField('beverage_type', e.target.value)}
              >
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
                <input
                  id={f.key}
                  type="text"
                  value={app[f.key]}
                  onChange={(e) => setField(f.key, e.target.value)}
                />
              </div>
            ))}
          </div>
        </fieldset>

        <div className="actions">
          <button className="btn" type="submit" disabled={loading} data-guide="verify">
            {loading ? 'Checking...' : 'Verify label'}
          </button>
          <button
            className="btn secondary"
            type="button"
            disabled={loading}
            onClick={() => {
              setApp(EMPTY);
              takeFile(null);
            }}
          >
            Clear
          </button>
        </div>
      </form>

      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}

      {result && (
        <section aria-live="polite" data-guide="result">
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
            {!result.quality.ok && <> · image quality flagged</>}
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
    </main>
  );
}
