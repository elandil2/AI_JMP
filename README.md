# Logistics Route Analyst

AI-powered route risk analysis and safety briefing platform for truck operations. The app combines Google-powered route analysis, Gemini-generated risk summaries, weather checks, Supabase-backed persistence, and shareable report links in a Next.js application.

## What the app does

- Authenticated dashboard for creating, reviewing, exporting, and deleting route reports
- Single-route report generation from origin/destination selections
- Batch CSV upload flow for generating multiple reports
- Public share links for finished reports
- Admin area and protected application routes backed by Supabase auth
- Scheduled keep-alive endpoint configured through Vercel cron jobs

## Tech stack

- Next.js 15
- React 19
- TypeScript
- Supabase Auth and database
- Google Gemini via `@google/genai`
- Recharts for report visualizations

## Prerequisites

- Node.js LTS
- npm
- A Supabase project
- A Gemini API key

## Environment variables

Create a local env file such as `.env.local` and add the values below.

```bash
NEXT_PUBLIC_SUPABASE_URL="https://your-project.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="your-supabase-anon-key"
SUPABASE_SERVICE_ROLE_KEY="your-supabase-service-role-key"
GEMINI_API_KEY="your-gemini-api-key"
MAPBOX_TOKEN=""
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

Notes:

- `GEMINI_API_KEY` is the Gemini key used by `services/geminiService.ts` (`API_KEY` is accepted for older installations).
- `SUPABASE_SERVICE_ROLE_KEY` is required for server-side operations such as the keep-alive route and should never be exposed in the browser.
- `NEXT_PUBLIC_APP_URL` is used when generating share links for reports.
- `MAPBOX_TOKEN` is optional.

## Local development

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start the development server:

   ```bash
   npm run dev
   ```

3. Open `http://localhost:3000`.

Useful scripts:

```bash
npm run dev
npm run build
npm run start
npm run lint
```

## Main application areas

- `/` and `/login`: authentication entry points
- `/dashboard`: authenticated report list and report actions
- `/reports/new`: create a single route report
- `/reports/batch`: upload CSV data for batch report creation
- `/reports/[id]`: authenticated report detail view
- `/r/[slug]`: public share page for a report
- `/admin`: admin workspace

## Vercel deployment

This repo already includes a `vercel.json` file with a scheduled cron job for:

- `GET /api/cron/keep-alive`

To deploy on Vercel:

1. Import the GitHub repository into Vercel or open the existing Vercel project.
2. Set all production environment variables from the list above.
3. Confirm the Production Branch is `main`.
4. Redeploy the project after changing branch settings or environment variables.

If your project is still tracking `master`, Vercel may continue building from the old branch. After renaming the GitHub default branch to `main`, also check the Vercel project settings and switch the Production Branch to `main` there.

## Branch note

This project was originally using `master`. For new production updates to deploy correctly through GitHub and Vercel, the repository and Vercel production settings should both point to `main`.
