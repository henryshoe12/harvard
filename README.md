# Overtime

A week view for student athletes: all your work due with how long it takes, your fixed team and class schedule, and your free time.

**Try it without any setup:** run the app and open `/week?demo=1` for a sample in-season football week.

## What it does today

Overtime shows, it doesn't schedule you. You decide when to do the work.

- **Work due, with time.** Every assignment from Canvas (or added by hand) with an hour estimate you can change, and a checkbox when it's done. "Due this week" and "Coming up" are listed separately.
- **Your fixed schedule.** Practice, lifts, film, travel and class from Google Calendar, Teamworks or Canvas links. Canvas lectures count as class time, not homework.
- **Plan work into free time, your way.** Tap "Plan time" on any assignment, pick a session length (or do it all at once), and tap open gaps on the calendar to put sessions there. Split a 4-hour problem set into three sessions across the week, or finish next week's work early. Remove a session with one tap.
- **Free time, on demand.** Flip "Show free time" to see the open gaps (30 minutes or longer, between when your day starts and ends), and compare hours of free time left with hours of work due.
- **Travel conflicts.** Every class and deadline that lands on a road trip or game, grouped by course, with an email to the professor or TF already written. It opens in Gmail, Outlook or your mail app so you check it and press send.
- **A page for each class.** Upload a syllabus (PDF or pasted text) and Claude turns it into the rules, grading, staff emails, every due date, and what the class means for an athlete who travels. Add any date to your week in one tap.
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

## Syllabus reading

Create an API key at [console.anthropic.com](https://console.anthropic.com/) and set it as `ANTHROPIC_API_KEY` (in `.env.local`, and in Vercel's environment variables). Each syllabus costs a few cents to read. Without a key, everything else works and the demo classes still show.

## Deploy (free)

Import the repo on [Vercel](https://vercel.com/new), add the environment variables from `.env.example`, and add the Vercel URL's callback to the Google OAuth client.

## What's next

See the v1 spec. Next up: write the plan back to a separate "Overtime" Google calendar, a team invite link that shares the team schedule, accounts and storage in Supabase (preferences currently live in a cookie), and a Sunday-night "here's your week" email.
