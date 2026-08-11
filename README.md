# HubSpot Contact Compliance

A daily compliance audit of the sales consultants' contacts, split into separate
scripts that run one after another. It finds the contacts touched yesterday, checks
each live lead, posts a note **from Ali** naming the consultant, assigns the consultant
a task, and emails them (plus a roundup to Ali). Runs on GitHub Actions.

---

## The files

All in the **repo root**, except the workflow.

| File | What it does |
|---|---|
| `contact-compliance.js` | **the runner** — passes each contact through the checks below |
| `config.js` | the consultant list + all settings |
| `0-hubspot.js` | HubSpot API helpers + the access self-test |
| `1-fetch.js` | finds yesterday's contacts and loads their calls, emails, tasks, WhatsApps |
| `2-check-stage.js` | lead stage selected? outcome selected? |
| `3-check-call.js` | call logged? does the logged call have a call outcome? |
| `4-check-task.js` | follow-up task set up? |
| `5-check-email.js` | email sent? placeholders, client name in greeting, spelling |
| `6-check-whatsapp.js` | WhatsApp sent when the client was not reached, within 24h |
| `8-check-stage-match.js` | **reads the call notes** and flags a lead stage that contradicts them |
| `7-note.js` | writes the note in Ali's wording, posts it, assigns the task |
| `package.json` | tells Actions to use Node |
| `.github/workflows/contact-compliance.yml` | the schedule + the dropdown form |

The numbered names matter — the runner loads them by name. Don't rename them.

---

## Running it

**Actions tab → Contact Compliance → Run workflow.** All dropdowns:

| Dropdown | Choices |
|---|---|
| Dry run | `true` = safe test (writes nothing) · `false` = LIVE |
| Lead stage | `all`, or one stage (No Answer, Call Back, Qualified CAN …) |
| How many contacts | `all`, or 25 / 50 / 100 / 250 / 500 / 1000 |
| Consultant | `all`, or one of the 42 names |
| Also audit ×3 | more names, or `- none -` |

Everything defaults to safe: dry run, all consultants, all stages, no cap.

### Read the top of the log first

Every run starts with an access self-test:

```
--- checking access (sample contact 12345) ---
  OK      calls (3 linked to the sample)
  OK      emails (1 linked to the sample)
  BROKEN  tasks
```

Anything marked **BROKEN** means the private app can't read it — add the matching
read scope to the app in HubSpot and re-run. Checks that depend on a broken lookup
are switched off automatically, so nobody gets wrongly flagged.

The log ends with a SUMMARY (counts, issues by type, flagged per consultant) plus
sample notes.

---

## What gets flagged

- No lead stage selected
- No outcome selected (when a call exists)
- No call logged, or a logged call with no call outcome
- No task set up
- No email sent — and if sent: leftover placeholders, no client name after the greeting, spelling mistakes
- No WhatsApp after a call where the client was **not** reached, or one sent more than 24h later
- **Lead stage that contradicts the call notes** (e.g. notes show a qualified, interested client but the stage says No Answer)

Closed/dead stages (Sale, Duplicate, Wrong Number, Ineligible …) are skipped — unless
you deliberately pick that stage in the dropdown.

Only the **3 most important** issues go in the note: stage mismatch → call → lead
stage → outcome → email → task → WhatsApp.

---

## How the consultant finds out

1. **A note on the contact**, owned by **Ali Raza (86250521)** so it reads as a note
   from the compliance lead — not as something the consultant wrote to themselves.
   The consultant is recorded as @mentioned on it.
2. **A task assigned to the consultant**, which lands in their HubSpot task queue.
   This is the reliable in-HubSpot signal — **HubSpot never sends a notification for
   an @mention created via API** (their own documentation confirms this), so the
   mention alone would never reach them.
   Our tasks are prefixed `[Compliance]` and are ignored by `4-check-task.js`, so the
   audit never mistakes its own task for the consultant's follow-up.
   Turn off with `CREATE_TASK_FOR_CONSULTANT: false`.
   Needs `crm.objects.tasks.write` on the private app.
3. **An email to the consultant** — needs the Resend domain step below.
4. **A roundup email to Ali** — works today.

### Emails to consultants need one setup step

`FROM_EMAIL` is `onboarding@resend.dev`, which **only delivers to Ali's address**. To
email the consultants:

1. In Resend: **Domains → Add domain → `hofmigration.com`**
2. Add the SPF, DKIM and DMARC DNS records Resend gives you
3. Once verified, set `FROM_EMAIL: "noreply@hofmigration.com"` in `config.js`

---

## Going live

- **Manual run:** set the Dry run dropdown to `false`.
- **Daily 10 AM PKT run:** GitHub can't show a form for scheduled runs, so edit
  `config.js` and change the `: true` at the end of the `DRY_RUN:` line to `: false`.

## Secrets

`HUBSPOT_TOKEN` · `GEMINI_KEY` · `RESEND_KEY` — repo **Settings → Secrets and variables → Actions**.

## Tuning

Each check is its own file, so if one is too strict, that's the only file to change.
Toggles in `config.js`: `CHECK_STAGE_MATCH`, `CHECK_EMAIL_SPELLING`, `CHECK_OCCUPATION`,
`CREATE_TASK_FOR_CONSULTANT`, `WHATSAPP_DELAY_HOURS`, `TERMINAL_STAGES`,
`MAX_ISSUES_PER_CONTACT`, `NOTE_OWNER_ID`.

**Large runs:** the two AI checks make ~2 calls per contact, so auditing all ~3,200 may
hit Gemini rate limits. For a full sweep either turn those toggles off, or work through
it by consultant or by lead stage.
