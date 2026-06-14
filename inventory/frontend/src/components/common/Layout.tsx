import type { ReactNode } from 'react';
import { Navbar } from './Navbar';
import { ToastContainer } from './Toast';
import { useOzChat } from '@/hooks/useOzChat';
import { OzFloatingButton, OzChatPanel } from '@/components/OzChat';

export function Layout({ children }: { children: ReactNode }) {
  const {
    messages,
    isLoading,
    isOpen,
    hasUnread,
    notificationGlanceKey,
    ozStatus,
    sendMessage,
    clearHistory,
    toggleOpen,
    setIsOpen,
  } = useOzChat();

  return (
    <div className="inventory-shell flex h-full min-h-0 flex-col overflow-hidden" style={{ background: 'var(--bg)' }}>
      <Navbar />
      <main className="flex min-h-0 w-full flex-1 flex-col px-4 py-6">
        {children}
      </main>
      <ToastContainer />

      <OzFloatingButton
        status={ozStatus}
        onClick={toggleOpen}
        isOpen={isOpen}
        isTyping={isLoading}
        hasNotification={hasUnread}
        notificationGlanceKey={notificationGlanceKey}
      />
      {isOpen && (
        <OzChatPanel
          messages={messages}
          isLoading={isLoading}
          onSendMessage={sendMessage}
          onClearHistory={clearHistory}
          onClose={() => setIsOpen(false)}
        />
      )}
    </div>
  );
}
