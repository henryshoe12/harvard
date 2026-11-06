# Overtime

A week view for student athletes: all your work due with how long it takes, your fixed team and class schedule, and your free time.

**Try it without any setup:** run the app and open `/week?demo=1` for a sample in-season football week.

## What it does today

Overtime shows, it doesn't schedule you. You decide when to do the work.

- **Work due, with time.** Every assignment from Canvas (or added by hand) with an hour estimate you can change, and a checkbox when it's done. "Due this week" and "Coming up" are listed separately.
- **Your fixed schedule.** Practice, lifts, film, travel and class from Google Calendar, Teamworks or Canvas links. Canvas lectures count as class time, not homework.
- **Free time, on demand.** Flip "Show free time" to see the open gaps (30 minutes or longer, between when your day starts and ends), and compare hours of free time left with hours of work due.
- **No Google needed.** Schools like Harvard block new apps from student Google accounts, so you can paste your Teamworks calendar-sync link and Canvas feed link instead.

## Run it locally

```bash
npm install
cp .env.example .env.local   # then fill it in (below)
npm run dev                   # http://localhost:3000
npm test                      # unit tests
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
