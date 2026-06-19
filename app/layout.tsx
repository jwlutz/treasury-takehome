import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'label check - TTB compliance triage',
  description:
    'upload an alcohol label, check it against the submitted application values, and get a clear approve / needs review / reject call with the reasons.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav className="nav" aria-label="primary">
          <div className="nav-inner">
            <span className="brand">Label check</span>
            <div className="nav-links">
              <Link href="/">Single label</Link>
              <Link href="/batch">Batch</Link>
            </div>
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
