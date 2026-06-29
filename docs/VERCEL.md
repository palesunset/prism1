# Host PRISM on Vercel (cloud-only)

PRISM runs entirely on **Vercel** (UI + APIs) with **Supabase Postgres**. No local servers required for production.

## 1 — Supabase setup

1. Open [Supabase Dashboard](https://supabase.com/dashboard/project/acrxdkqqvcfnedljixyg).
2. **SQL Editor** → run `supabase/migrations/001_prism_schema.sql`.
3. **Authentication → Users** → create your admin user (email + password).
4. Copy from **Project Settings → API**:
   - Project URL
   - **anon public** key
   - **service_role** key (server only — never expose in browser)
5. Copy **Database → Connection string → URI** (use **Session pooler**, port 6543).

## 2 — Vercel environment variables

In [Vercel](https://vercel.com) → your project → **Settings → Environment Variables**, add:

| Variable | Value |
|----------|--------|
| `DATABASE_URL` | Postgres URI from Supabase |
| `VITE_SUPABASE_URL` | `https://acrxdkqqvcfnedljixyg.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role (optional, future server use) |

Vercel sets `VERCEL=1` automatically — APIs use Supabase instead of SQLite.

## 3 — Deploy

1. Push to [github.com/palesunset/prism1](https://github.com/palesunset/prism1).
2. Vercel → **Import Project** → select the repo.
3. Root directory: **`.`** (default). Settings come from `vercel.json`.
4. **Deploy**.

Your app URL: `https://your-project.vercel.app`

## Architecture on Vercel

```
Browser → Vercel CDN (React SPA)
       → /api/lsp/*     → Python serverless (CSPF, import, export)
       → /api/notes/*   → Node serverless
       → /api/ipam/*    → Node serverless
       → /api/inventory/* → Node serverless
              ↓
         Supabase Postgres
```

## First login

When `VITE_SUPABASE_*` is set, the platform shows an **admin login** screen. Sign in with the Supabase user you created.

## Optional local preview

Use `npx vercel dev` with a root `.env` file (copy from `.env.example`). Full offline `npm run dev` remains available for developers but is **not** used in production.
