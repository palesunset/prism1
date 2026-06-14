import { useState, useEffect, useCallback, useRef } from 'react';
import { authHeaderRecord } from '@/services/apiAuth';
import { inventoryApiUrl } from '@/services/inventoryApiBase';

export interface OzMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}

const STORAGE_KEY = 'dc-inventory-oz-chat-history';
const SESSION_ID_KEY = 'dc-inventory-oz-session';

export function useOzChat() {
  const [messages, setMessages] = useState<OzMessage[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return [];
    try {
      const parsed = JSON.parse(saved) as OzMessage[];
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      return parsed.filter((m) => new Date(m.timestamp).getTime() > sevenDaysAgo);
    } catch {
      return [];
    }
  });

  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const [notificationGlanceKey, setNotificationGlanceKey] = useState(0);
  const [ozStatus, setOzStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const prevMessageCountRef = useRef<number | null>(null);

  const [sessionId] = useState(() => {
    const saved = localStorage.getItem(SESSION_ID_KEY);
    if (saved) return saved;
    const id = crypto.randomUUID();
    localStorage.setItem(SESSION_ID_KEY, id);
    return id;
  });

  const checkOzStatus = useCallback(async () => {
    try {
      const res = await fetch(inventoryApiUrl('/chat/status'), { headers: authHeaderRecord() });
      if (res.status === 429) {
        setOzStatus('error');
        return;
      }
      if (!res.ok) {
        setOzStatus('error');
        return;
      }
      const data = (await res.json()) as { status?: string; message?: string };
      if (data.status === 'ready') setOzStatus('ready');
      else if (data.status === 'loading') setOzStatus('loading');
      else setOzStatus('error');
    } catch {
      setOzStatus('error');
    }
  }, []);

  useEffect(() => {
    void checkOzStatus();
    const ms = ozStatus === 'loading' ? 5000 : 30_000;
    const interval = setInterval(() => void checkOzStatus(), ms);
    return () => clearInterval(interval);
  }, [checkOzStatus, ozStatus]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  }, [messages]);

  // New assistant reply while the panel is closed → unread + glance cue for the FAB
  useEffect(() => {
    if (prevMessageCountRef.current === null) {
      prevMessageCountRef.current = messages.length;
      return;
    }
    const grew = messages.length > prevMessageCountRef.current;
    prevMessageCountRef.current = messages.length;
    if (!grew) return;
    const last = messages.length > 0 ? messages[messages.length - 1] : undefined;
    if (last?.role === 'assistant' && !isOpen) {
      setHasUnread(true);
      setNotificationGlanceKey((k) => k + 1);
    }
  }, [messages, isOpen]);

  useEffect(() => {
    if (isOpen) setHasUnread(false);
  }, [isOpen]);

  const sendMessage = async (content: string) => {
    const trimmed = content.trim();
    if (!trimmed) return;

    const userMessage: OzMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmed,
      timestamp: new Date().toISOString(),
    };

    const thread = [...messages, userMessage];
    setMessages(thread);
    setIsLoading(true);

    const payloadMessages = thread.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    try {
      const response = await fetch(inventoryApiUrl('/chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaderRecord() },
        body: JSON.stringify({ messages: payloadMessages, sessionId }),
      });
      const data = (await response.json()) as { response?: string };
      const text = data.response ?? 'No response from Oz.';
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: text,
          timestamp: new Date().toISOString(),
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'system',
          content: 'Sorry, Oz could not reach the server. Is the backend running?',
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const clearHistory = () => {
    setMessages([]);
    localStorage.removeItem(STORAGE_KEY);
  };

  const toggleOpen = () => setIsOpen((o) => !o);

  return {
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
  };
}
