import type { ReactNode } from 'react';
import { PreviewHeader, PreviewFooter } from './HomePreviewChrome';

/** Shared chrome and home-page typography for all visitor-facing routes. */
export function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <PreviewHeader />
      <main className="np public-content flex-1 bg-surface" style={{ color: 'var(--np-body)' }}>
        {children}
      </main>
      <PreviewFooter />
    </>
  );
}
