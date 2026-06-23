'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ApplicationFields, Decision, FieldCheck } from '../../lib/policy/types';
import { parseManifestCsv, type BatchManifestRow } from '../../lib/csv';
import { DECISION, checkLabel } from '../ui';
import { recordUsage } from '../usage';

type RowStatus = 'pending' | 'running' | 'done' | 'error';

interface ResultState {
  status: RowStatus;
  decision?: Decision;
  checks?: FieldCheck[];
  latencyMs?: number;
  message?: string;
  override?: Decision; // the human's call in the review queue
}

interface Row extends BatchManifestRow, ResultState {
  preview: string;
}

const CSV_HEADER =
  'filename,beverage_type,brand_name,class_type,alcohol_content,net_contents,producer_name,producer_address,country_of_origin';

const APP_LABELS: [keyof ApplicationFields, string][] = [
  ['beverage_type', 'Beverage type'],
  ['brand_name', 'Brand'],
  ['class_type', 'Class / type'],
  ['alcohol_content', 'Alcohol'],
  ['net_contents', 'Net contents'],
  ['producer_name', 'Producer'],
  ['producer_address', 'Address'],
  ['country_of_origin', 'Country'],
];

async function dataUrlToFile(dataUrl: string, name: string, type: string): Promise<File> {
  const blob = await (await fetch(dataUrl)).blob();
  return new File([blob], name, { type });
}

function Pill({ decision }: { decision?: Decision }) {
  if (!decision) return <span className="meta">—</span>;
  const d = DECISION[decision];
  return <span className={`pill ${d.tone}`}>{d.label}</span>;
}

export default function Batch() {
  const [manifest, setManifest] = useState<BatchManifestRow[]>([]);
  const [files, setFiles] = useState<Map<string, File>>(new Map());
  const [previews, setPreviews] = useState<Map<string, string>>(new Map());
  const [results, setResults] = useState<Record<string, ResultState>>({});
  const [running, setRunning] = useState(false);
  const [role, setRole] = useState<'dashboard' | 'review'>('dashboard');
  const [sort, setSort] = useState<{ key: 'filename' | 'decision' | 'latency'; dir: number }>({ key: 'filename', dir: 1 });
  const [error, setError] = useState('');
  const [concurrency, setConcurrency] = useState(6);
  const [runStart, setRunStart] = useState(0);
  const [now, setNow] = useState(0);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);

  // tick while a batch runs so the eta counts down between completions, not just on each one
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [running]);

  // the table is a pure projection of inputs (manifest + files) and outputs (results)
  const rows: Row[] = useMemo(
    () =>
      manifest
        .filter((m) => files.has(m.filename))
        .map((m) => ({
          ...m,
          preview: previews.get(m.filename) ?? '',
          ...(results[m.filename] ?? { status: 'pending' as RowStatus }),
        })),
    [manifest, files, previews, results],
  );

  const unmatched = manifest.filter((m) => !files.has(m.filename)).map((m) => m.filename);

  const dispo = (r: Row) => r.override ?? r.decision;
  const done = rows.filter((r) => r.status === 'done');
  const counts = {
    cleared: done.filter((r) => dispo(r) === 'approve').length,
    flagged: done.filter((r) => dispo(r) === 'reject').length,
    review: done.filter((r) => dispo(r) === 'needs_review').length,
  };
  const errored = rows.filter((r) => r.status === 'error').length;
  const avgLatency = done.length ? done.reduce((s, r) => s + (r.latencyMs ?? 0), 0) / done.length : 0;
  // the queue is only what needs a human: items the engine sent to review. rejects are already decided.
  const queue = rows.filter((r) => r.status === 'done' && r.decision === 'needs_review' && !r.override);

  const reviewRow = reviewing ? rows.find((r) => r.filename === reviewing) : null;

  function decide(filename: string, decision: Decision) {
    setOne(filename, { override: decision });
    const next = queue.find((r) => r.filename !== filename); // advance to the next one needing review
    setReviewing(next?.filename ?? null);
  }

  const processed = done.length + errored;
  const elapsed = runStart ? now - runStart : 0;
  const etaMs = running && processed > 0 && processed < rows.length ? ((rows.length - processed) * elapsed) / processed : 0;

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      if (sort.key === 'filename') return a.filename.localeCompare(b.filename) * sort.dir;
      if (sort.key === 'latency') return ((a.latencyMs ?? 0) - (b.latencyMs ?? 0)) * sort.dir;
      return String(dispo(a) ?? '').localeCompare(String(dispo(b) ?? '')) * sort.dir;
    });
    return copy;
  }, [rows, sort]);

  function setOne(filename: string, patch: Partial<ResultState>) {
    setResults((prev) => ({ ...prev, [filename]: { ...(prev[filename] ?? { status: 'pending' }), ...patch } }));
  }

  function reset() {
    setManifest([]);
    setFiles(new Map());
    setPreviews(new Map());
    setResults({});
    setError('');
  }

  async function onCsv(file: File | null) {
    if (!file) return;
    try {
      setManifest(parseManifestCsv(await file.text()));
      setResults({});
      setError('');
    } catch (e: any) {
      setError(e?.message ?? 'could not read the csv');
    }
  }

  function onImages(list: FileList | null) {
    if (!list) return;
    setFiles((prev) => {
      const next = new Map(prev);
      for (const f of Array.from(list)) next.set(f.name, f);
      return next;
    });
    setPreviews((prev) => {
      const next = new Map(prev);
      for (const f of Array.from(list)) next.set(f.name, URL.createObjectURL(f));
      return next;
    });
    setResults({});
  }

  async function loadSample() {
    setError('');
    try {
      const d = await (await fetch('/api/examples/batch')).json();
      const items: any[] = d.items ?? [];
      const m: BatchManifestRow[] = [];
      const fmap = new Map<string, File>();
      const pmap = new Map<string, string>();
      for (const it of items) {
        m.push({ filename: it.filename, application: it.application as ApplicationFields });
        fmap.set(it.filename, await dataUrlToFile(it.image, it.filename, it.mime));
        pmap.set(it.filename, it.image);
      }
      setManifest(m);
      setFiles(fmap);
      setPreviews(pmap);
      setResults({});
    } catch (e: any) {
      setError(e?.message ?? 'could not load the sample batch');
    }
  }

  async function run() {
    const items = manifest.filter((m) => files.has(m.filename));
    if (!items.length) return;
    setResults(Object.fromEntries(items.map((m) => [m.filename, { status: 'pending' as RowStatus }])));
    setRunStart(Date.now());
    setNow(Date.now());
    setRunning(true);
    let cursor = 0;
    const worker = async () => {
      while (cursor < items.length) {
        const m = items[cursor++];
        setOne(m.filename, { status: 'running' });
        try {
          const fd = new FormData();
          fd.append('image', files.get(m.filename)!);
          fd.append('application', JSON.stringify(m.application));
          const res = await fetch('/api/verify', { method: 'POST', body: fd });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? 'verification failed');
          setOne(m.filename, { status: 'done', decision: data.decision, checks: data.checks, latencyMs: data.latencyMs });
          recordUsage({ verifications: 1, tokens: data.tokens ?? 0 });
        } catch (e: any) {
          setOne(m.filename, { status: 'error', message: e?.message ?? 'error' });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
    setRunning(false);
  }

  function sortBy(key: 'filename' | 'decision' | 'latency') {
    setSort((s) => ({ key, dir: s.key === key ? -s.dir : 1 }));
  }
  const arrow = (key: string) => (sort.key === key ? (sort.dir === 1 ? ' ▲' : ' ▼') : '');

  const hasRun = done.length > 0 || errored > 0 || running;

  return (
    <main>
      <header>
        <h1>Batch</h1>
        <p>
          Check a whole stack of labels against a CSV of application values. Anything that needs human review
          will be flagged and sent to the review queue if the model isn&apos;t confident it can read it. You can
          check the model&apos;s work against the file names below: correct and review should get approved, wrong
          should get rejected.
        </p>
      </header>

      <h2>Load a batch</h2>
      <div className="card">
        <button type="button" className="btn" onClick={loadSample} disabled={running} data-guide="sample">
          Load sample batch (15 labels)
        </button>
        <p className="meta">or bring your own:</p>
        <div className="grid">
          <div className="field" data-guide="csv">
            <label htmlFor="csv">Manifest CSV (filename → expected values)</label>
            <input id="csv" type="file" accept=".csv,text/csv" onChange={(e) => onCsv(e.target.files?.[0] ?? null)} />
          </div>
          <div className="field" data-guide="images">
            <label htmlFor="imgs">Label images</label>
            <input id="imgs" type="file" accept="image/*" multiple onChange={(e) => onImages(e.target.files)} />
          </div>
        </div>
        <details>
          <summary>CSV format</summary>
          <p className="meta">
            one header row, then one row per label. <code>filename</code> is required; <code>beverage_type</code> is
            optional (inferred from class/type if absent).
          </p>
          <pre className="code">{CSV_HEADER}</pre>
        </details>
        <p className="meta">
          manifest: {manifest.length} rows · images: {files.size} · matched: {rows.length}
          {unmatched.length > 0 && <> · no image for: {unmatched.slice(0, 4).join(', ')}{unmatched.length > 4 ? '…' : ''}</>}
        </p>
      </div>

      <div className="actions">
        <button type="button" className="btn" onClick={run} disabled={running || rows.length === 0} data-guide="run">
          {running ? 'Running…' : `Run batch (${rows.length})`}
        </button>
        <button type="button" className="btn secondary" onClick={reset} disabled={running}>
          Clear
        </button>
        <label className="parallel">
          Parallel
          <select value={concurrency} onChange={(e) => setConcurrency(Number(e.target.value))} disabled={running}>
            {[2, 4, 6, 8, 10].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}

      {running && (
        <div
          className="progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={rows.length}
          aria-valuenow={processed}
          aria-label="batch progress"
        >
          <div className="progress-fill" style={{ width: `${rows.length ? (processed / rows.length) * 100 : 0}%` }} />
        </div>
      )}

      {hasRun && (
        <p className="statusline" aria-live="polite">
          {done.length}/{rows.length} done: {counts.cleared} cleared, {counts.flagged} flagged, {counts.review} review
          {errored > 0 && <> · {errored} errored</>}
          {running && etaMs > 0 && <> · ~{Math.ceil(etaMs / 1000)}s left</>}
        </p>
      )}

      {hasRun && (
        <>
          <div className="roles" role="group" aria-label="view">
            <button type="button" data-guide="dashboard" className={role === 'dashboard' ? 'on' : ''} aria-pressed={role === 'dashboard'} onClick={() => setRole('dashboard')}>
              Dashboard
            </button>
            <button type="button" data-guide="review-queue" className={role === 'review' ? 'on' : ''} aria-pressed={role === 'review'} onClick={() => setRole('review')}>
              Review queue {queue.length > 0 && <span className="badge">{queue.length}</span>}
            </button>
          </div>

          {role === 'dashboard' ? (
            <section>
              <div className="cards">
                <div className="stat">
                  <b>{counts.cleared}</b>
                  <span>cleared</span>
                </div>
                <div className="stat">
                  <b>{counts.review}</b>
                  <span>needs review</span>
                </div>
                <div className="stat">
                  <b>{counts.flagged}</b>
                  <span>rejected</span>
                </div>
                <div className="stat">
                  <b>{(avgLatency / 1000).toFixed(1)}s</b>
                  <span>avg / label</span>
                </div>
              </div>

              <table className="results">
                <caption className="visually-hidden">batch results</caption>
                <thead>
                  <tr>
                    <th scope="col">
                      <button type="button" className="th" onClick={() => sortBy('filename')}>
                        File{arrow('filename')}
                      </button>
                    </th>
                    <th scope="col">
                      <button type="button" className="th" onClick={() => sortBy('decision')}>
                        Decision{arrow('decision')}
                      </button>
                    </th>
                    <th scope="col">Label</th>
                    <th scope="col">
                      <button type="button" className="th" onClick={() => sortBy('latency')}>
                        Time{arrow('latency')}
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((r) => (
                    <tr key={r.filename}>
                      <td>{r.filename}</td>
                      <td>
                        {r.status === 'running' && <span className="meta">checking…</span>}
                        {r.status === 'pending' && <span className="meta">queued</span>}
                        {r.status === 'error' && <span className="pill tone-reject">error</span>}
                        {r.status === 'done' && (
                          <>
                            <Pill decision={dispo(r)} />
                            {r.override && <span className="meta"> (agent)</span>}
                          </>
                        )}
                      </td>
                      <td>
                        {r.preview ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={r.preview}
                            alt={`label ${r.filename}`}
                            className="thumb zoom"
                            onClick={() => setLightbox(r.preview)}
                          />
                        ) : (
                          <span className="meta">—</span>
                        )}
                      </td>
                      <td>{r.latencyMs ? `${(r.latencyMs / 1000).toFixed(1)}s` : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ) : (
            <section>
              {queue.length === 0 ? (
                <p className="meta">Review queue is clear.</p>
              ) : (
                <ul className="queue">
                  {queue.map((r) => {
                    const reasons = (r.checks ?? []).filter((c) => c.severity === 'error' || c.severity === 'warning');
                    return (
                      <li key={r.filename}>
                        <div className="q-head">
                          {r.preview && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={r.preview} alt={`label ${r.filename}`} className="zoom" onClick={() => setLightbox(r.preview)} />
                          )}
                          <div>
                            <strong>{r.filename}</strong>
                            <div className="meta">
                              {reasons.length} reason{reasons.length === 1 ? '' : 's'} to review
                            </div>
                          </div>
                        </div>
                        <div className="q-actions">
                          <button type="button" className="btn" onClick={() => setReviewing(r.filename)}>
                            Review
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}
        </>
      )}

      {reviewRow && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label={`review ${reviewRow.filename}`}
          onClick={(e) => {
            if (e.target === e.currentTarget) setReviewing(null);
          }}
        >
          <div className="review-modal">
            <div className="modal-head">
              <strong>Review · {reviewRow.filename}</strong>
              <button type="button" className="guide-x" aria-label="close" onClick={() => setReviewing(null)}>
                ✕
              </button>
            </div>

            <div className="review-body">
              <div className="review-img">
                {reviewRow.preview && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={reviewRow.preview} alt={`label ${reviewRow.filename}`} className="zoom" onClick={() => setLightbox(reviewRow.preview)} />
                )}
                <span className="meta">click image to enlarge</span>
              </div>

              <div className="review-data">
                <h3>Why it needs review</h3>
                <ul className="q-reasons">
                  {(reviewRow.checks ?? [])
                    .filter((c) => c.severity === 'error' || c.severity === 'warning')
                    .map((c) => (
                      <li key={c.field}>
                        {checkLabel(c.field)}: {c.message}
                      </li>
                    ))}
                </ul>

                <h3>Application values</h3>
                <dl className="review-fields">
                  {APP_LABELS.map(([k, label]) => (
                    <div key={k}>
                      <dt>{label}</dt>
                      <dd>{reviewRow.application[k]}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>

            <div className="review-actions">
              <button type="button" className="btn big-reject" onClick={() => decide(reviewRow.filename, 'reject')}>
                Reject
              </button>
              <button type="button" className="btn big-approve" onClick={() => decide(reviewRow.filename, 'approve')}>
                Accept
              </button>
            </div>
          </div>
        </div>
      )}

      {lightbox && (
        <div className="lightbox" role="dialog" aria-label="enlarged label" onClick={() => setLightbox(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="enlarged label" />
        </div>
      )}
    </main>
  );
}
