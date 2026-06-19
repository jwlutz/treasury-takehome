'use client';

// report issue / feedback. opens a prefilled GitHub new-issue page (no server token, no secret,
// nothing sent automatically: the user submits it on GitHub). repo is configurable via env.
import { useState, type FormEvent } from 'react';

const REPO = process.env.NEXT_PUBLIC_GITHUB_REPO || 'jwlutz/treasury-takehome';

export default function Feedback() {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<'feedback' | 'issue'>('feedback');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  function submit(e: FormEvent) {
    e.preventDefault();
    const label = kind === 'issue' ? 'bug' : 'feedback';
    const heading = `[${label}] ${title.trim() || (kind === 'issue' ? 'issue report' : 'feedback')}`;
    const url = `https://github.com/${REPO}/issues/new?title=${encodeURIComponent(heading)}&labels=${encodeURIComponent(label)}&body=${encodeURIComponent(body.trim())}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    setOpen(false);
    setTitle('');
    setBody('');
  }

  return (
    <>
      <button type="button" className="report-btn" onClick={() => setOpen(true)}>
        Report issue
      </button>

      {open && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="report issue or feedback"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="modal">
            <div className="modal-head">
              <strong>Tell us what happened</strong>
              <button type="button" className="guide-x" aria-label="close" onClick={() => setOpen(false)}>
                ✕
              </button>
            </div>

            <div className="toggle" role="group" aria-label="type">
              <button type="button" className={kind === 'feedback' ? 'on' : ''} aria-pressed={kind === 'feedback'} onClick={() => setKind('feedback')}>
                Feedback
              </button>
              <button type="button" className={kind === 'issue' ? 'on' : ''} aria-pressed={kind === 'issue'} onClick={() => setKind('issue')}>
                Issue
              </button>
            </div>

            <form onSubmit={submit}>
              <label htmlFor="fb-title">Title</label>
              <input
                id="fb-title"
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={kind === 'issue' ? 'what went wrong' : 'what could be better'}
              />
              <label htmlFor="fb-body">Details</label>
              <textarea
                id="fb-body"
                rows={5}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="steps, what you expected, anything useful"
              />
              <p className="meta">opens a prefilled GitHub issue on {REPO}. nothing is sent automatically; you submit it there.</p>
              <div className="actions">
                <button type="submit" className="btn">
                  Open GitHub issue
                </button>
                <button type="button" className="btn secondary" onClick={() => setOpen(false)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
