'use client';

import { useUsage } from '../usage';

const fmt = (n: number) => n.toLocaleString();

export default function UsagePage() {
  const u = useUsage();
  const cards = [
    { label: 'tokens', value: fmt(u.tokens) },
    { label: 'checks', value: fmt(u.verifications) },
    { label: 'chats', value: fmt(u.chats) },
    { label: 'generated', value: fmt(u.images) },
  ];

  return (
    <main>
      <header>
        <h1>Usage</h1>
        <p>This session only. Nothing is persisted (no PII, session memory only), so it resets on reload.</p>
      </header>

      <div className="cards">
        {cards.map((c) => (
          <div className="stat" key={c.label}>
            <b>{c.value}</b>
            <span>{c.label}</span>
          </div>
        ))}
      </div>

      <p className="meta">
        In production this would be per signed-in reviewer, agents see their own, supervisors see team totals. Here it
        is one session-scoped meter.
      </p>
    </main>
  );
}
