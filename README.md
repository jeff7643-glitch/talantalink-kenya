# TalantaLink Kenya

A professional community for Kenya's talent to connect, share their work, and discover opportunities.

## Current status

The site is connected to its Supabase project. Email/password sign-up and sign-in are available on /auth; profiles, posts, published opportunities, appreciations, comments, connection requests, and applications use Supabase. Campaign management and messaging are still prototype-only.

The public database currently has all 47 counties and eight talent categories; profiles, talents, companies, and opportunities are populated by users. Any remaining sample campaign metrics are illustrative, not real delivery data.

## Run locally

Requirements: Node.js 20.9 or later and npm.

```powershell
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). A local development server may already be running in this workspace.

## Supabase setup

The initial schema is applied to the connected project. For a fresh project:

1. In the Supabase Dashboard, open **SQL Editor** and run [`supabase/migrations/20261030000000_initial_schema.sql`](./supabase/migrations/20261030000000_initial_schema.sql). It creates the tables, 47 counties, eight talent categories, and Row Level Security policies.
2. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local` using the project URL and a publishable key from **Project Settings → API Keys**.

Publishable keys are intended for browser use with RLS enabled. **Never use or expose a service-role/secret key in the browser or commit it to source control.** The connected project uses `http://localhost:3000` as its auth site URL and redirect allowlist entry. Add the deployed site URL before production use.

The `.env.local` file is ignored by git. The auth trigger creates a public profile when Supabase creates a user. Company verification and sponsored posts are intentionally restricted; do not mark companies as verified from the client.

## Checks

```powershell
npm run lint
npm run build
```

## Next integration steps

- Load the signed-in profile and county from Supabase instead of the demo profile.
- Complete profile editing and talent profile onboarding.
- Add company onboarding and opportunity publishing.
- Persist campaigns and add server-side impression/click tracking.
- Connect messaging to the database and configure storage buckets for profile and post media.

Do not treat demo metrics or sample opportunity listings as real platform data.
