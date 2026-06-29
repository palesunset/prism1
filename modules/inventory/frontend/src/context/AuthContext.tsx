import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { STORAGE_KEY } from '@/services/apiAuth';
import { inventoryApiUrl } from '@/services/inventoryApiBase';

type AuthState = {
  ready: boolean;
  authRequired: boolean;
  apiKey: string | null;
  setApiKey: (key: string) => void;
  clearApiKey: () => void;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);
  const [apiKey, setApiKeyState] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 12_000);
      try {
        const res = await fetch(inventoryApiUrl('/health'), { signal: controller.signal });
        if (!res.ok) throw new Error('health check failed');
        const data = (await res.json()) as { authRequired?: boolean };
        if (!cancelled) {
          setAuthRequired(Boolean(data.authRequired));
        }
      } catch {
        if (!cancelled) setAuthRequired(false);
      } finally {
        window.clearTimeout(timeout);
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setApiKey = useCallback((key: string) => {
    const trimmed = key.trim();
    setApiKeyState(trimmed || null);
    try {
      if (trimmed) sessionStorage.setItem(STORAGE_KEY, trimmed);
      else sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const clearApiKey = useCallback(() => {
    setApiKeyState(null);
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo(
    () => ({ ready, authRequired, apiKey, setApiKey, clearApiKey }),
    [ready, authRequired, apiKey, setApiKey, clearApiKey]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
