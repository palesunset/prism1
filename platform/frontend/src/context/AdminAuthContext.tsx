import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { isSupabaseConfigured, requireSupabase } from "../lib/supabase";

type AdminAuthState = {
  ready: boolean;
  authRequired: boolean;
  session: { email: string } | null;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
};

const AdminAuthContext = createContext<AdminAuthState | null>(null);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(!isSupabaseConfigured);
  const [session, setSession] = useState<{ email: string } | null>(null);
  const authRequired = isSupabaseConfigured;

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const client = requireSupabase();
    let cancelled = false;

    client.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      const user = data.session?.user;
      setSession(user?.email ? { email: user.email } : null);
      setReady(true);
    });

    const { data: sub } = client.auth.onAuthStateChange((_event, next) => {
      const user = next.session?.user;
      setSession(user?.email ? { email: user.email } : null);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const client = requireSupabase();
    const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
    return error?.message ?? null;
  }, []);

  const signOut = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    await requireSupabase().auth.signOut();
    setSession(null);
  }, []);

  const value = useMemo(
    () => ({ ready, authRequired, session, signIn, signOut }),
    [ready, authRequired, session, signIn, signOut],
  );

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error("useAdminAuth must be used within AdminAuthProvider");
  return ctx;
}
