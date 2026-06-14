import { useRef, useEffect } from 'react';
import { X, Trash2 } from 'lucide-react';
import type { OzMessage } from '@/hooks/useOzChat';
import { OzMessageBubble } from './OzMessageBubble';
import { OzInputArea } from './OzInputArea';
import { OzTypingIndicator } from './OzTypingIndicator';
import { OzSuggestions } from './OzSuggestions';
import { LivingChatbotIcon } from './LivingChatbotIcon';

export function OzChatPanel({
  messages,
  isLoading,
  onSendMessage,
  onClearHistory,
  onClose,
}: {
  messages: OzMessage[];
  isLoading: boolean;
  onSendMessage: (content: string) => void;
  onClearHistory: () => void;
  onClose: () => void;
}) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  return (
    <div
      className="fixed bottom-24 right-6 z-50 flex h-[min(600px,80vh)] w-[min(24rem,calc(100vw-2rem))] flex-col rounded-2xl border shadow-2xl"
      style={{ background: 'var(--panel)', borderColor: 'var(--border)' }}
    >
      <div
        className="flex items-center justify-between border-b px-4 py-3"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="flex items-center gap-2">
          <LivingChatbotIcon size={36} isTyping={isLoading} />
          <div>
            <h3 className="font-semibold" style={{ color: 'var(--fg)' }}>
              Oz
            </h3>
            <p className="text-xs" style={{ color: 'var(--color-subheader)' }}>
              Your inventory wizard
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onClearHistory}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            title="Clear history"
          >
            <Trash2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-slate-50 p-4 dark:bg-slate-950">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-2 text-center">
            <LivingChatbotIcon size={64} />
            <h4 className="mb-2 mt-4 font-medium" style={{ color: 'var(--fg)' }}>
              Hi, I&apos;m Oz
            </h4>
            <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
              Ask about sites, equipment, ports, and utilization. I run only on your machine.
            </p>
            <OzSuggestions onSelect={onSendMessage} />
          </div>
        ) : (
          <>
            {messages.map((m) => (
              <OzMessageBubble key={m.id} role={m.role} content={m.content} />
            ))}
            {isLoading && <OzTypingIndicator />}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      <OzInputArea onSend={onSendMessage} isLoading={isLoading} />
    </div>
  );
}
