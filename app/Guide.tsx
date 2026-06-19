'use client';

// the accessibility guide: a plain-words assistant that explains the flow and can point at one
// on-screen element (by its data-guide id). on by default so help is always there. it only guides,
// it never acts on the user's behalf.
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { usePathname } from 'next/navigation';

interface Msg {
  role: 'user' | 'assistant';
  content: string;
}

const SUGGESTIONS: Record<string, string[]> = {
  single: ['How do I check a label?', 'What does "needs review" mean?', 'Where do I upload?'],
  batch: ['How do I check many labels?', 'What is the review queue?', 'Where do I load a sample?'],
};

function highlight(id: string) {
  const el = document.querySelector(`[data-guide="${id}"]`) as HTMLElement | null;
  if (!el) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
  el.classList.add('guide-highlight');
  setTimeout(() => el.classList.remove('guide-highlight'), 2600);
}

export default function Guide() {
  const pathname = usePathname();
  const page = pathname?.startsWith('/batch') ? 'batch' : 'single';
  const [open, setOpen] = useState(true); // accessibility mode on by default
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: 'assistant',
      content:
        "Hi, I'm your guide. Ask how to check a label, what a result means, or where to find something and I'll point you to it.",
    },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bodyRef.current?.scrollTo(0, bodyRef.current.scrollHeight);
  }, [messages, open]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    const next: Msg[] = [...messages, { role: 'user', content: q }];
    setMessages(next);
    setInput('');
    setBusy(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: next, page }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'guide unavailable');
      setMessages((m) => [...m, { role: 'assistant', content: data.say || '...' }]);
      if (data.highlight) setTimeout(() => highlight(data.highlight), 120);
    } catch {
      setMessages((m) => [...m, { role: 'assistant', content: 'sorry, the guide is unavailable right now.' }]);
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    send(input);
  }

  return (
    <>
      <button className="guide-launch" aria-expanded={open} aria-controls="guide-panel" onClick={() => setOpen((o) => !o)}>
        {open ? 'Close guide' : 'Need help?'}
      </button>

      {open && (
        <aside id="guide-panel" className="guide" role="dialog" aria-label="guide assistant">
          <div className="guide-head">
            <strong>Guide</strong>
            <button className="guide-x" aria-label="close guide" onClick={() => setOpen(false)}>
              ✕
            </button>
          </div>

          <div className="guide-body" ref={bodyRef}>
            {messages.map((m, i) => (
              <div key={i} className={`gmsg ${m.role}`}>
                {m.content}
              </div>
            ))}
            {busy && <div className="gmsg assistant">…</div>}
          </div>

          <div className="guide-suggest">
            {SUGGESTIONS[page].map((s) => (
              <button key={s} type="button" onClick={() => send(s)} disabled={busy}>
                {s}
              </button>
            ))}
          </div>

          <form className="guide-input" onSubmit={onSubmit}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="ask the guide…"
              aria-label="ask the guide"
            />
            <button type="submit" disabled={busy || !input.trim()}>
              Send
            </button>
          </form>
        </aside>
      )}
    </>
  );
}
