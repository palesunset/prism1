import { useState, type FormEvent, type ReactNode } from "react";
import { useAdminAuth } from "../context/AdminAuthContext";

export function AdminGate({ children }: { children: ReactNode }) {
  const { sessionChecked, authRequired, session, signIn } = useAdminAuth();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (!authRequired || session) {
    return <>{children}</>;
  }

  if (!sessionChecked) {
    return <>{children}</>;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const msg = await signIn(username, password);
    if (msg) setError(msg);
    setBusy(false);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-950 p-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md space-y-4 rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-xl"
      >
        <div>
          <h1 className="text-xl font-semibold text-white">PRISM Admin</h1>
          <p className="mt-1 text-sm text-slate-400">Single admin sign-in.</p>
        </div>
        <label className="block text-sm text-slate-300">
          Username
          <input
            type="text"
            autoComplete="username"
            className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-white"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </label>
        <label className="block text-sm text-slate-300">
          Password
          <input
            type="password"
            autoComplete="current-password"
            className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-white"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-cyan-600 py-2 font-medium text-white hover:bg-cyan-500 disabled:opacity-60"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
