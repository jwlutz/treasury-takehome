'use client';

import { useEffect, useRef, useState } from 'react';

// a weighted loading bar. the fill (CSS @keyframes weightedfill) eases out toward ~92% over the
// expected duration so the wait reads as progress, not a frozen spinner. this component owns the live
// wall-clock counter -- the time the user actually feels, which runs a bit longer than the model's own
// latency number. the caller unmounts it and swaps in the result when the call returns.
export default function ProgressBar({ label, expectedMs = 5000 }: { label: string; expectedMs?: number }) {
  const [elapsed, setElapsed] = useState(0);
  const start = useRef(0);

  useEffect(() => {
    start.current = performance.now();
    const id = setInterval(() => setElapsed((performance.now() - start.current) / 1000), 100);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="progress-load" role="status" aria-live="polite">
      <div className="progress-load-head">
        <span>{label}</span>
        <span className="progress-load-time">{elapsed.toFixed(1)}s</span>
      </div>
      <div className="progress-load-track">
        <div className="progress-load-fill" style={{ animationDuration: `${expectedMs}ms` }} />
      </div>
    </div>
  );
}
