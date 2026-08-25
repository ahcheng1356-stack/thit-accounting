# သစ်စာရင်းအင်း — Netlify + Supabase

Production-ready migration of the timber accounting dashboard.

## 1. Supabase

1. Create a Supabase project.
2. Open **SQL Editor**, paste `supabase/schema.sql`, and run it once.
3. Copy the project URL and **service_role** key from Project Settings > API.

## 2. Netlify environment variables

Add these in **Site configuration > Environment variables**:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (secret; never expose in frontend code)
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `USER_USERNAME`
- `USER_PASSWORD`
- `SESSION_SECRET` (reserved for future signing; use a long random value)

Use new passwords rather than the old passwords previously shared.

## 3. Deploy

Push this folder to a private GitHub repository. In Netlify choose **Add new project > Import an existing project**, select the repository, add the variables above, and deploy. Netlify reads `netlify.toml` automatically.

## Local development

Copy `.env.example` to `.env`, enter development values, then run:

```bash
npm install
npm run dev
```

## Security

Supabase Row Level Security is enabled with no browser policies. Database access is restricted to server-side Netlify Functions. Keep the service-role key out of GitHub and chat.
