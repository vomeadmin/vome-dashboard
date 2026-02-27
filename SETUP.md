# Vome Financial Dashboard — Setup Guide

## Quick Start

### 1. Environment Variables

Copy `.env.local` and fill in real values:

```bash
# Stripe
STRIPE_SECRET_KEY=sk_live_...

# Dashboard Passwords
INTERNAL_PASSWORD=your-internal-password
INVESTOR_PASSWORD=your-investor-password

# Django Activity API (Phase 6)
DJANGO_ACTIVITY_URL=https://app.vome.ca/api/v1/analytics/activity-summary/
DJANGO_ACTIVITY_SECRET=your-secret

# Upstash Redis (for quarterly report storage)
UPSTASH_REDIS_REST_URL=https://your-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token
```

### 2. Configure Stripe Plan Mapping

Run the following to list your Stripe products and find their IDs:

```bash
stripe products list --limit 20
```

Then edit `lib/plan-config.ts` and fill in the product IDs:

```ts
export const PLAN_MAP: Record<string, PlanTier> = {
  'prod_XXXX': 'Ultimate',
  'prod_YYYY': 'Enterprise',
  'prod_ZZZZ': 'Pro',
}
```

**Without this mapping**, the dashboard falls back to product name matching
(looks for "ultimate", "enterprise", "pro", "recruit"/"free" in the product name).

### 3. Upstash Redis (for Quarterly Reports)

1. Go to [console.upstash.com](https://console.upstash.com)
2. Create a new Redis database (free tier works)
3. Copy the REST URL and token into `.env.local`

### 4. Run Locally

```bash
nvm use 22
npm run dev
```

- Internal dashboard: http://localhost:3000/dashboard
- Investor view: http://localhost:3000/investor

Both will prompt for Basic Auth credentials from `.env.local`.

### 5. Deploy to Vercel

```bash
npx vercel --prod
```

Set all `.env.local` variables in Vercel dashboard → Settings → Environment Variables.

---

## Architecture Notes

| Route | Auth | Purpose |
|---|---|---|
| `/dashboard` | `INTERNAL_PASSWORD` | MRR/ARR overview |
| `/dashboard/customers` | `INTERNAL_PASSWORD` | Top customers by ARR |
| `/dashboard/forecast` | `INTERNAL_PASSWORD` | Cash flow forecast |
| `/dashboard/reports` | `INTERNAL_PASSWORD` | Quarterly report list |
| `/dashboard/reports/[id]` | `INTERNAL_PASSWORD` | Editable report (e.g. `2026-Q1`) |
| `/investor` | `INVESTOR_PASSWORD` | Investor-facing KPIs + published report |

## Currency

All values are displayed in **CAD**. USD subscriptions are converted using live
ECB rates from `api.frankfurter.app` (refreshed every 10 minutes, falls back to
1.36 if unavailable).

## Quarterly Reports

1. Navigate to `/dashboard/reports`
2. Click **Current Quarter** to create/open the report
3. Edit narrative sections in the rich text editor
4. Click **Export PDF** to print to PDF (use browser Print → Save as PDF)
5. Click **Publish to Investors** to make the narrative visible on `/investor`

## Django Activity API (Phase 6)

The activity panel on the main dashboard expects this endpoint:

```
GET /api/v1/analytics/activity-summary/?period=YYYY-MM
Authorization: Bearer <DJANGO_ACTIVITY_SECRET>
```

See the plan file at `C:\Users\sfage\.claude\plans\ethereal-churning-pearl.md`
for the full Django implementation spec (models, queries, response shape).
