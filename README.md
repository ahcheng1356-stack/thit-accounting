# သစ်စာရင်းအင်း — Vercel + Supabase

Production-ready migration of the timber accounting dashboard.

## 1. Supabase

For this migration, reuse the existing Supabase project and Google Sheets credentials; no data copy or schema reset is needed. The setup steps below apply only to a new installation.

1. Create a Supabase project.
2. Open **SQL Editor**, paste `supabase/schema.sql`, and run it once.
3. Copy the project URL and **service_role** key from Project Settings > API.

## 2. Vercel environment variables

Add these in **Project Settings > Environment Variables**:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (secret; never expose in frontend code)
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `USER_USERNAME`
- `USER_PASSWORD`
- `SESSION_SECRET` (reserved for future signing; use a long random value)

### Optional: two-way Google Sheets sync

The website can synchronize Supabase with four Google Sheet tabs: `Expenses`,
`Orders`, `Inventory`, and `Timber Deals`. Website changes are exported after
each save, edit, or delete. Sheet changes are imported whenever the website
reloads its accounting data.

1. In Google Cloud, enable **Google Sheets API** and create a service account.
2. Create or choose a Google Spreadsheet, then share it as **Editor** with the
   service account email.
3. Add these Vercel environment variables:

- `GOOGLE_SHEETS_SPREADSHEET_ID` — the value between `/d/` and `/edit` in the Sheet URL
- `GOOGLE_SERVICE_ACCOUNT_EMAIL` — the service account `client_email`
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` — the service account `private_key`

On the first website reload, the four tabs and their headers are created. Keep
the headers unchanged. To add a record in Google Sheets, leave `ID` blank. To
delete an existing record from either system, enter `TRUE` in its `Delete`
column; simply removing a Sheet row does not delete database data. Dates must use
`YYYY-MM-DD`.

For the existing **Business Expense In/Out** workbook, the integration detects
its custom layout automatically and uses `Credits`, `Orders`, `စျေး`, `အခွန်`,
`Capital`, and `သစ်ရောင်းဝယ်` in place. It preserves the receipt-image column
in `Credits` and the workbook's formulas and formatting. `Sold Orders` remains a derived view.
Blank or `-` dates in `Credits` are imported as an unknown date and displayed as
`—` on the website. Run the latest `supabase/schema.sql` once before deploying
so the expense date column accepts those blank values.

Use new passwords rather than the old passwords previously shared.

## 3. Deploy

Vercel reads `vercel.json` to build the Vite frontend and expose `/api/auth` and `/api/accounting` as Node.js functions. Shared business logic lives in `server/`. Existing Netlify entrypoints remain available for rollback.

```bash
npx vercel login
npx vercel link
```

Add the existing server credentials listed above to the linked Vercel project's Production environment before running `npm run deploy`. Keep all credentials server-only (no `VITE_` prefix). For local development, use `.env`; Vercel uploads exclude this file.

Alternatively, import this private repository in Vercel, select Vite, add the environment variables, and deploy. Use the generated Vercel URL and sign in again: session cookies are scoped to the old site's hostname. Verify login, accounting data, and Sheets synchronization before retiring the old Netlify site. A custom domain can be moved after the new deployment is verified.

Vercel documentation: [Vite](https://vercel.com/docs/frameworks/frontend/vite) and [Node.js functions](https://vercel.com/docs/functions/runtimes/node-js).

## Local development

Copy `.env.example` to `.env`, enter development values, then run:

```bash
npm install
npm run dev
```

## Security

Supabase Row Level Security is enabled with no browser policies. Database access is restricted to server-side functions. Keep the service-role key out of GitHub and chat.

### Sold orders and transportation

Enter sold tons on the order first. Transportation selects orders with sold tons, including partially sold orders. Record each route leg with its own date and cost. For a 15-ton sale, save Forest → Village at 15 tons, then choose that previous leg when creating Village → Destination; the starting location and 15 tons are filled automatically. Connected legs count as one 15-ton load and both costs count as expenses. Transportation creation, editing, deletion and Sheets synchronization never change order sold tons. Existing sales are preserved; historical sales corrections should be entered on the order.

Run transportation regression checks with `node --test tests/transportation.test.mjs`.
