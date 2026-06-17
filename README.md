# HubSpot Contact Compliance

A daily audit of your sales consultants' contacts. Once a day it finds the contacts
they touched yesterday, checks each one for compliance issues, posts a note naming the
owner, and emails each consultant (plus a roundup to Ali).

It runs entirely on GitHub Actions — no computer or command line needed.

---

## The 4 files

| File | Goes where in the repo | What it is |
|---|---|---|
| `contact-compliance.js` | repo root | the script |
| `config.js` | repo root | the consultant list + settings you can edit |
| `package.json` | repo root | tells Actions to use Node |
| `contact-compliance.yml` | `.github/workflows/contact-compliance.yml` | the 10 AM schedule |

---

## Step 1 — Create the repo and add the files

1. On GitHub, create a new repo in your org: **`hubspot-contact-compliance`** (Private).
2. Add each file above using **Add file → Create new file** in the web UI.
   - For the workflow, type the file name as `.github/workflows/contact-compliance.yml`
     (typing the slashes creates the folders automatically).

## Step 2 — Create the HubSpot private app token

In HubSpot: **Settings → Integrations → Private apps → Create a private app**.
Give it these **read** scopes:
`crm.objects.contacts.read`, `crm.objects.companies.read`, and the activity/engagement read
scopes (calls, emails, tasks, communications, notes), plus **`crm.objects.contacts.write`**
and notes write so it can post notes. Copy the token.

## Step 3 — Add the 3 secrets

In the repo: **Settings → Secrets and variables → Actions → New repository secret**. Add:

- `HUBSPOT_TOKEN` — the private app token from Step 2
- `GEMINI_KEY` — a Google AI Studio (Gemini) API key
- `RESEND_KEY` — your Resend API key

## Step 4 — DRY RUN first (important)

The script ships in **safe mode** (`DRY_RUN: true` in `config.js`). It will **not** post
notes or send emails — it only prints a report.

1. Go to the **Actions** tab → **Contact Compliance** → **Run workflow**.
2. Open the run and read the log. Check that:
   - it found a sensible number of contacts,
   - the **"Resolved contact properties"** line shows real names for Lead Stage / Outcome / Occupation,
   - the **"Call dispositions"** line lists Busy / Connected / etc.,
   - the flagged issues look correct.
3. **Send Ali that log.** If anything looks off (wrong property, missing WhatsApp, etc.),
   we adjust before going live.

## Step 5 — Go live

Once the dry run looks right:

1. In `config.js`, set `DRY_RUN: false`.
2. (See the Resend note below before consultant emails will deliver.)
3. It now runs automatically every day at **10 AM PKT**.

---

## Resend: emailing the consultants

Right now `FROM_EMAIL` is `onboarding@resend.dev`, which **can only deliver to Ali's
address**. So in live mode, only Ali's roundup will arrive — the consultant emails won't.

To turn on consultant emails:

1. In Resend: **Domains → Add domain → `hofmigration.com`**.
2. Add the **SPF, DKIM and DMARC DNS records** Resend gives you, at your domain's DNS host.
3. Once Resend shows the domain **verified**, set `FROM_EMAIL: "noreply@hofmigration.com"` in `config.js`.

Bonus: verifying this domain also fixes the Adnan/Farah summary emails on your other three projects.

---

## What it checks

Identity (name, occupation) · Lead Stage set · a call is logged · a follow-up task when the
lead is "Schedule Call Back" · email quality (placeholders, missing client name in the greeting,
company + LinkedIn signature links, spelling) · WhatsApp follow-up after any non-"Connected"
call outcome (and a >24h delay flag). It shows the **top 3** issues per contact.

## A few checks are provisional (we'll calibrate from the first dry run)

- The **WhatsApp 24h** rule currently measures from the call time; we may refine it once we see how WhatsApp replies are stored.
- "Consultant only wrote a note instead of logging a call" isn't detected yet — only a fully missing call is.
- "Task set for the exact callback time" isn't checked yet — only whether a task exists.

These are easy to tighten after we see real data in the dry-run log.

## Editing the consultant list later

Open `config.js`, edit the `OWNERS` list (name + ownerId), commit. That's it.
