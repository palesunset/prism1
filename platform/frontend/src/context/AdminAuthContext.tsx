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
  sessionChecked: boolean;
  authRequired: boolean;
  session: { username: string } | null;
  signIn: (username: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
};

const AdminAuthContext = createContext<AdminAuthState | null>(null);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const authRequired = isSupabaseConfigured;
  const [sessionChecked, setSessionChecked] = useState(!isSupabaseConfigured);
  const [session, setSession] = useState<{ username: string } | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const client = requireSupabase();
    let cancelled = false;

    client.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      const user = data?.session?.user;
      if (user && isAllowedAdminEmail(user.email)) {
        setSession({ username: ADMIN_USERNAME });
      } else {
        if (user) void client.auth.signOut();
        setSession(null);
      }
      setSessionChecked(true);
    });

    const { data: sub } = client.auth.onAuthStateChange((_event, nextSession) => {
      const user = nextSession?.user;
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
    if (error) {
      const msg = error.message.toLowerCase();
      if (msg.includes("invalid login credentials") || msg.includes("invalid credentials")) {
        return `Wrong username or password. Ensure Supabase has a confirmed user: ${ADMIN_EMAIL}`;
      }
      return error.message;
    }
    if (!isAllowedAdminEmail(data.user?.email)) {
      await client.auth.signOut();
      return "Access denied.";
    }
    setSession({ username: ADMIN_USERNAME });
    return null;
  }, []);

  const signOut = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    await requireSupabase().auth.signOut();
    setSession(null);
  }, []);

  const value = useMemo(
    () => ({ sessionChecked, authRequired, session, signIn, signOut }),
    [sessionChecked, authRequired, session, signIn, signOut],
  );

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error("useAdminAuth must be used within AdminAuthProvider");
  return ctx;
}
