'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { ApplicationFields, Decision, FieldCheck } from '../lib/policy/types';
import { DECISION, SEV_MARK, checkLabel } from './ui';

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

export default function Home() {
  const [app, setApp] = useState<ApplicationFields>(EMPTY);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>('');
  const [examples, setExamples] = useState<Example[]>([]);
  const [result, setResult] = useState<VerifyResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
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
    setFile(f);
    setPreview(f ? URL.createObjectURL(f) : '');
  }

  async function loadExample(ex: Example) {
    setApp(ex.application);
    setResult(null);
    setError('');
    const f = await dataUrlToFile(ex.image, `${ex.id}.${ex.mime.split('/')[1] ?? 'jpg'}`);
    setFile(f);
    setPreview(ex.image);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!file) {
      setError('add a label image first.');
      return;
    }
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const fd = new FormData();
      fd.append('image', file);
      fd.append('application', JSON.stringify(app));
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
