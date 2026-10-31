# TalantaLink Kenya

A professional community for Kenya's talent to connect, share their work, and discover opportunities.

## Current status

Email/password registration, sign-in, email verification, password recovery, and reset are available on `/auth`. Registration sets a non-administrator account type, then guides verified members through profile setup and optional photo upload. Supabase sessions use shared SSR cookies, are refreshed in Next.js Proxy, and are validated again on protected server routes. Profiles, posts, opportunities, appreciations, comments, connection requests, applications, saved posts, messages, and campaign drafts use Supabase; the interface does not substitute sample records when the database is empty. Feed and message updates use Supabase Realtime.

Roles are Talent, Employer, Recruiter, and Administrator. Talent accounts can apply to opportunities; Employer and Recruiter accounts can manage their own listings and campaign drafts. Role restrictions are enforced by Supabase Row Level Security as well as the interface. Administrator cannot be selected at registration: assign it only through a trusted Supabase SQL session.

Members can attach photos to posts and profiles. Campaigns are saved as drafts; ad delivery and event tracking are not implemented. Any campaign totals shown are derived from persisted advertisement events and should not be read as proof of campaign delivery.

Members can build and edit a public professional profile at `/profile/edit`, including location, skills, experience, education, portfolio media, certificates, availability, social links, and contact preferences. Profiles are shared at `/talent/<profile-id>`. Contact details are private unless their matching contact preference is enabled.

The community feed stores posts in Supabase, supports photo/video uploads, follows, hashtags, member mentions, reports, likes, comments, saved posts, and shareable post pages at `/posts/<post-id>`.

Talent discovery is available at `/discover`. Employers and talent can browse and manage vacancies, auditions, internships, competitions, freelance gigs, and sponsorship opportunities at `/opportunities`. Employers and recruiters can manage organization profiles and logos, review applicants, update application stages, request applicant connections, and track recruitment activity at `/employer`. Private real-time messaging, attachments, unread counts, blocks, and reports are available at `/inbox`.

Members receive real-time in-app updates at `/notifications` and can choose which follows, post activity, messages, application changes, matching opportunities, and verification events to receive. Kenyan mobile numbers use `+254`; WhatsApp contact is shown only when the profile owner opts in. Location forms include major Kenyan towns, compensation is entered in KES, and the app provides an Android-friendly install manifest.

Administrators can manage accounts, suspend fraudulent users, verify talent and employers, review private company registration evidence, moderate reports and listings, manage talent categories, and inspect the audit trail at `/admin`. Members can report suspicious jobs, scams, content, and accounts at `/trust/report`. Profiles default to private and require explicit consent before becoming public; employer verification evidence is stored in a private bucket.

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
5. Run [`supabase/migrations/20261031000000_professional_profiles.sql`](./supabase/migrations/20261031000000_professional_profiles.sql) to add professional profile fields, private contact details, public portfolio storage, and certificates.
6. Run [`supabase/migrations/20261031000100_social_networking.sql`](./supabase/migrations/20261031000100_social_networking.sql) to enable follows, mentions, hashtag indexing, reports, and video posts.
7. Run [`supabase/migrations/20261031000200_inbox_messaging.sql`](./supabase/migrations/20261031000200_inbox_messaging.sql) to enable private message attachments, blocks, reports, and notification records.
8. Run [`supabase/migrations/20261031000300_opportunities_marketplace.sql`](./supabase/migrations/20261031000300_opportunities_marketplace.sql) to enable marketplace opportunity types, requirements, contacts, and CV/portfolio applications.
9. Run [`supabase/migrations/20261031000400_talent_discovery.sql`](./supabase/migrations/20261031000400_talent_discovery.sql) to seed discovery categories and add talent search indexes.
10. Run [`supabase/migrations/20261031000500_admin_operations.sql`](./supabase/migrations/20261031000500_admin_operations.sql) to enable administrator verification, moderation, account management, and platform statistics.
11. Run [`supabase/migrations/20261031000600_trust_safety.sql`](./supabase/migrations/20261031000600_trust_safety.sql) to enable consent-based profile privacy, employer verification evidence, suspicious-link signals, reporting, and database-enforced rate limits.
12. Run [`supabase/migrations/20261031000700_employer_dashboard.sql`](./supabase/migrations/20261031000700_employer_dashboard.sql) to enable employer logos, applicant shortlisting, secure contact requests, and recruitment activity tracking.
13. Run [`supabase/migrations/20261031000800_kenya_notifications.sql`](./supabase/migrations/20261031000800_kenya_notifications.sql) to normalize Kenyan phone numbers and add private notification preferences, event records, and Realtime updates.
14. Run [`supabase/migrations/20261031000850_private_profile_media.sql`](./supabase/migrations/20261031000850_private_profile_media.sql) to move profile photos, covers, portfolio items and certificates to consent-aware private storage.
15. Run [`supabase/migrations/20261031000900_database_rls_audit.sql`](./supabase/migrations/20261031000900_database_rls_audit.sql) to fail deployment if a public table is missing RLS/policies, constraints are unvalidated, a county is missing, or a storage bucket is misconfigured.
16. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local` using the project URL and a publishable key from **Project Settings → API Keys**.

Apply every migration in order in the Supabase SQL Editor before deploying the application. The feed requires `posts.media_storage_path`, and talent discovery requires the `profiles.primary_category_id` foreign key to `talent_categories`; run the feed and discovery queries after migration 004 to verify PostgREST recognizes those schema changes. Migration 009 checks schema, constraints, indexes, policies and storage configuration at migration time; it does not inspect application behavior or prove that the migration has been applied to a live project. Re-run the audit after schema changes and manually review policy definitions and grants before production. Application and message data must remain protected by the participant-specific policies in their migrations.

Publishable keys are intended for browser use with RLS enabled. **Never use or expose a service-role/secret key in the browser or commit it to source control.** Configure the Supabase Auth site URL and redirect allowlist to include `http://localhost:3000/auth/callback`; add the corresponding HTTPS callback URL before production use. Configure the confirmation and password recovery email templates to use Supabase’s verification link so they return through this callback. Email confirmation must be enabled to require address verification.

The `.env.local` file is ignored by git. The auth trigger creates a profile and accepts only Talent, Employer, or Recruiter metadata; it always rejects Administrator self-assignment. To grant administrator access, run a trusted SQL statement such as `update public.profiles set role = 'administrator' where id = '<verified-user-uuid>';` in the Supabase Dashboard SQL Editor. Never expose a service-role key to the client. Company verification and sponsored posts are intentionally restricted; do not mark companies as verified from the client.

## Checks

```powershell
npm run lint
npx tsc --noEmit
npm run build
```
