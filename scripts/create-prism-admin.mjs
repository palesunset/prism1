#!/usr/bin/env node
/**
 * Create the single PRISM admin user in Supabase Auth (run once).
 *
 *   ADMIN_PASSWORD='your-password' npm run create-admin
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in repo-root `.env` or env.
 * Optional: VITE_ADMIN_EMAIL (default admin@prism.admin)
 */
import { loadRootEnv } from "./load-root-env.mjs";

loadRootEnv();

const url = (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "").replace(/\/$/, "");
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
const email = (process.env.VITE_ADMIN_EMAIL ?? "admin@prism.admin").trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD?.trim() ?? "";

if (!url || !serviceKey) {
  console.error("Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
if (!password || password.length < 8) {
  console.error("Set ADMIN_PASSWORD (min 8 characters) for the new admin user.");
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${serviceKey}`,
  apikey: serviceKey,
  "Content-Type": "application/json",
};

async function findUserByEmail() {
  const res = await fetch(`${url}/auth/v1/admin/users?email=${encodeURIComponent(email)}`, {
    headers,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`List users failed (${res.status}): ${body}`);
  }
  const data = await res.json();
  return data.users?.[0] ?? null;
}

async function createUser() {
  const res = await fetch(`${url}/auth/v1/admin/users`, {
    method: "POST",
    headers,
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const body = await res.json().catch(() => ({}));
  if (res.ok) {
    console.log(`Created admin user: ${email}`);
    console.log(`Sign in with username "admin" (or email ${email}).`);
    return;
  }
  if (body.msg?.includes("already") || body.message?.includes("already")) {
    console.log(`User ${email} already exists — updating password…`);
    const existing = await findUserByEmail();
    if (!existing?.id) {
      throw new Error("User exists but could not be loaded for password update.");
    }
    const patch = await fetch(`${url}/auth/v1/admin/users/${existing.id}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ password, email_confirm: true }),
    });
    if (!patch.ok) {
      const err = await patch.text();
      throw new Error(`Password update failed (${patch.status}): ${err}`);
    }
    console.log(`Updated password for ${email}.`);
    return;
  }
  throw new Error(`Create failed (${res.status}): ${JSON.stringify(body)}`);
}

createUser().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
