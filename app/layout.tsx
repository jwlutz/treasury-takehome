import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import Guide from './Guide';
import Feedback from './Feedback';
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
            <Link href="/" className="brand">Label check</Link>
            <div className="nav-right">
              <div className="nav-links">
                <Link href="/" data-guide="nav-single">Single label</Link>
                <Link href="/batch" data-guide="nav-batch">Batch</Link>
                <Link href="/usage" data-guide="nav-usage">Usage</Link>
              </div>
              <Feedback />
            </div>
          </div>
        </nav>
        {children}
        <Guide />
      </body>
    </html>
  );
}
