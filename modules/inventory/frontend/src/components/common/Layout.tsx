import type { ReactNode } from 'react';
import { Navbar } from './Navbar';
import { ToastContainer } from './Toast';

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="inventory-shell flex h-full min-h-0 flex-col overflow-hidden" style={{ background: 'var(--bg)' }}>
      <Navbar />
      <main className="flex min-h-0 w-full flex-1 flex-col px-4 py-6">
        {children}
      </main>
      <ToastContainer />
    </div>
  );
}
