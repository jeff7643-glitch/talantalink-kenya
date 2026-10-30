# TalantaLink Kenya

A professional community for Kenya's talent to connect, share their work, and discover opportunities.

## Current status

Email/password registration, sign-in, email verification, password recovery, and reset are available on `/auth`. Registration sets a non-administrator account type, then guides verified members through profile setup and optional photo upload. Supabase sessions use shared SSR cookies, are refreshed in Next.js Proxy, and are validated again on protected server routes. Profiles, posts, opportunities, appreciations, comments, connection requests, applications, saved posts, messages, and campaign drafts use Supabase; the interface does not substitute sample records when the database is empty. Feed and message updates use Supabase Realtime.

Roles are Talent, Employer, Recruiter, and Administrator. Talent accounts can apply to opportunities; Employer and Recruiter accounts can manage their own listings and campaign drafts. Role restrictions are enforced by Supabase Row Level Security as well as the interface. Administrator cannot be selected at registration: assign it only through a trusted Supabase SQL session.

Members can attach photos to posts and profiles. Campaigns are saved as drafts; ad delivery and event tracking are not implemented. Any campaign totals shown are derived from persisted advertisement events and should not be read as proof of campaign delivery.

## Run locally

Requirements: Node.js 20.9 or later and npm.

```powershell
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). A local development server may already be running in this workspace.

## Supabase setup

For a fresh project:

1. In the Supabase Dashboard, open **SQL Editor** and run [`supabase/migrations/20261030000000_initial_schema.sql`](./supabase/migrations/20261030000000_initial_schema.sql). It creates the tables, 47 counties, eight talent categories, and Row Level Security policies.
2. Run [`supabase/migrations/20261030000100_enable_live_updates_and_post_photos.sql`](./supabase/migrations/20261030000100_enable_live_updates_and_post_photos.sql) to enable live feed events and create the public post-photo bucket with member-scoped uploads.
3. Run [`supabase/migrations/20261030000200_member_features.sql`](./supabase/migrations/20261030000200_member_features.sql) to enable saved posts, profile photos, and messaging between accepted connections.
4. Run [`supabase/migrations/20261030000300_authentication_roles.sql`](./supabase/migrations/20261030000300_authentication_roles.sql) to add account roles, onboarding state, and role-aware database policies.
5. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local` using the project URL and a publishable key from **Project Settings → API Keys**.

Publishable keys are intended for browser use with RLS enabled. **Never use or expose a service-role/secret key in the browser or commit it to source control.** Configure the Supabase Auth site URL and redirect allowlist to include `http://localhost:3000/auth/callback`; add the corresponding HTTPS callback URL before production use. Configure the confirmation and password recovery email templates to use Supabase’s verification link so they return through this callback. Email confirmation must be enabled to require address verification.

The `.env.local` file is ignored by git. The auth trigger creates a profile and accepts only Talent, Employer, or Recruiter metadata; it always rejects Administrator self-assignment. To grant administrator access, run a trusted SQL statement such as `update public.profiles set role = 'administrator' where id = '<verified-user-uuid>';` in the Supabase Dashboard SQL Editor. Never expose a service-role key to the client. Company verification and sponsored posts are intentionally restricted; do not mark companies as verified from the client.

## Checks

```powershell
npm run lint
npm run build
```
