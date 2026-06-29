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
import {
  ADMIN_EMAIL,
  ADMIN_USERNAME,
  isAllowedAdminEmail,
  resolveAdminLoginEmail,
} from "../lib/adminAuthConfig";

type AdminAuthState = {
  ready: boolean;
  authRequired: boolean;
  session: { username: string } | null;
  signIn: (username: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
};

const AdminAuthContext = createContext<AdminAuthState | null>(null);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(!isSupabaseConfigured);
  const [session, setSession] = useState<{ username: string } | null>(null);
  const authRequired = isSupabaseConfigured;

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const client = requireSupabase();
    let cancelled = false;

    client.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      const user = data.session?.user;
      if (user && isAllowedAdminEmail(user.email)) {
        setSession({ username: ADMIN_USERNAME });
      } else {
        if (user) void client.auth.signOut();
        setSession(null);
      }
      setReady(true);
    });

    const { data: sub } = client.auth.onAuthStateChange((_event, next) => {
      const user = next.session?.user;
      if (user && isAllowedAdminEmail(user.email)) {
        setSession({ username: ADMIN_USERNAME });
      } else {
        setSession(null);
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (username: string, password: string) => {
    const email = resolveAdminLoginEmail(username);
    if (!email) return "Invalid username.";
    const client = requireSupabase();
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) return error.message;
    if (!isAllowedAdminEmail(data.user?.email)) {
      await client.auth.signOut();
      return "Access denied.";
    }
    return null;
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
