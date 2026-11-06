# Overtime

A planner for student athletes. It reads your team schedule (Google Calendar) and your class deadlines (Canvas), protects your sleep, and plans study blocks around practice, lifts, film and travel.

**Try it without any setup:** run the app and open `/week?demo=1` for a sample in-season football week.

## What it does today

- **Sleep first.** Every night from your bedtime to your wake time is blocked. If something starts early (a 6am lift), that night moves earlier so you keep the same hours of sleep. Events that run into the night are flagged.
- **Works around the team schedule.** Reads every Google calendar you have turned on, so a Teamworks or shared team calendar counts. Items from a Canvas calendar subscribed in Google become deadlines to study for, not busy time. Keeps 45 minutes of recovery after lifts, practice, games and travel, and 15 minutes to get to each event.
- **Plans study time.** Coursework comes from your Canvas calendar feed or is added by hand. Sessions are 30 to 90 minutes, earliest deadline first, at most 4 hours of study a day, nothing in the first 30 minutes after waking or the last 30 before bed.
- **Tells you when it won't fit.** If a deadline can't be met in the free time you have, it says how many hours are missing.

The planning logic is in `src/lib/planner.ts` and is covered by `npm test`.

## Run it locally

```bash
npm install
cp .env.example .env.local   # then fill it in (below)
npm run dev                   # http://localhost:3000
npm test                      # planner tests
```

## Google sign-in setup (one time, about 10 minutes)

1. Go to [Google Cloud Console](https://console.cloud.google.com/) and create a project called "Overtime".
2. **APIs & Services → Library**: enable the **Google Calendar API**.
3. **APIs & Services → OAuth consent screen**: choose External, fill in the app name and your email, add the scope `.../auth/calendar.readonly`, and add yourself and your testers as **Test users** (up to 100 while the app is in testing).
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**: type Web application, with redirect URIs
   - `http://localhost:3000/api/auth/callback/google`
   - `https://<your-vercel-domain>/api/auth/callback/google` (once deployed)
5. Copy the client ID and secret into `.env.local` as `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`. Generate `AUTH_SECRET` with `npx auth secret`.

## Deploy (free)

Import the repo on [Vercel](https://vercel.com/new), add the three environment variables from `.env.example`, and add the Vercel URL's callback to the Google OAuth client.

## What's next

See the v1 spec. Next up: write the plan back to a separate "Overtime" Google calendar, a team invite link that shares the team schedule, accounts and storage in Supabase (preferences currently live in a cookie), and a Sunday-night "here's your week" email.
