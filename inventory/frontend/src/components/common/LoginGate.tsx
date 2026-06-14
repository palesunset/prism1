import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { inventoryApiUrl } from '@/services/inventoryApiBase';

export function LoginGate({ children }: { children: React.ReactNode }) {
  const { ready, authRequired, apiKey, setApiKey } = useAuth();
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ background: 'var(--bg)', color: 'var(--fg)' }}>
        <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
          Loading…
        </p>
      </div>
    );
  }

  if (!authRequired || apiKey) {
    return <div className="flex h-full min-h-0 flex-col">{children}</div>;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const key = input.trim();
    if (!key) {
      setError('API key is required');
      return;
    }
    setChecking(true);
    setError('');
    try {
      const res = await fetch(inventoryApiUrl('/sites'), {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (res.status === 401) {
        setError('Invalid API key');
        return;
      }
      if (!res.ok) {
        setError('Could not verify API key');
        return;
      }
      setApiKey(key);
    } catch {
      setError('Could not reach the server');
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4" style={{ background: 'var(--bg)' }}>
      <form
        onSubmit={submit}
        className="card w-full max-w-md space-y-4 p-6"
        style={{ borderColor: 'var(--border)' }}
      >
        <div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--fg)' }}>
            Sign in
          </h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--color-muted)' }}>
            This inventory server requires an API key. Enter the key configured as{' '}
            <code className="text-xs">API_KEY</code> on the backend.
          </p>
        </div>
        <div>
          <label className="text-sm font-medium" htmlFor="api-key">
            API key
          </label>
          <input
            id="api-key"
            type="password"
            autoComplete="off"
            className="input-field mt-1 w-full"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Paste API key"
          />
          {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
        </div>
        <button type="submit" className="btn-primary w-full" disabled={checking}>
          {checking ? 'Verifying…' : 'Continue'}
        </button>
      </form>
    </div>
  );
}
