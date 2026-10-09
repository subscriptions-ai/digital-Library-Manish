import type { ReactNode } from 'react';
import { PreviewHeader, PreviewFooter } from './HomePreviewChrome';
import { AIAssistantChat } from './AIAssistantChat';

/** Shared chrome and home-page typography for all visitor-facing routes. */
export function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <PreviewHeader />
      <main className="np public-content flex-1 bg-public" style={{ color: 'var(--np-body)' }}>
        {children}
      </main>
      <PreviewFooter />
      {/* Visitor-facing only: the assistant lives inside the public
          layout, so staff and subscriber tools never render it. */}
      <AIAssistantChat />
    </>
  );
}
