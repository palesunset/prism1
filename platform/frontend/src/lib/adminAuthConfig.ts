/** Single admin account — username maps to Supabase Auth email at sign-in. */
export const ADMIN_USERNAME = (import.meta.env.VITE_ADMIN_USERNAME ?? "admin").trim().toLowerCase();

export const ADMIN_EMAIL = (import.meta.env.VITE_ADMIN_EMAIL ?? "admin@prism.admin")
  .trim()
  .toLowerCase();

/** Map login field (username or allowed email) to Supabase email. */
export function resolveAdminLoginEmail(input: string): string | null {
  const value = input.trim().toLowerCase();
  if (!value) return null;
  if (value === ADMIN_USERNAME) return ADMIN_EMAIL;
  if (value === ADMIN_EMAIL) return ADMIN_EMAIL;
  return null;
}

export function isAllowedAdminEmail(email: string | undefined | null): boolean {
  return Boolean(email && email.trim().toLowerCase() === ADMIN_EMAIL);
}
