# HubSpot Contact Compliance

A daily compliance audit of the sales consultants' contacts, split into separate
scripts that run one after another. It finds the contacts worked in the chosen time
window, checks each live lead, posts a note **from Ali** tagging the consultant,
assigns them a task, and emails them. Runs on GitHub Actions.

---

## The files

All in the **repo root**, except the workflow.

| File | What it does |
|---|---|
| `contact-compliance.js` | **the runner** — passes each contact through the checks |
| `config.js` | the 47 consultants + every setting |
| `selftest.js` | the rules register: every agreed rule as a runnable test |
| `0-hubspot.js` | API helpers, access self-test, PKT day maths |
| `1-fetch.js` | finds the contacts and loads calls, emails, tasks, WhatsApps, deals |
| `2-check-stage.js` | client name, lead stage marked, outcome marked |
| `3-check-call.js` | call logged, call recency, call outcome, call description |
| `4-check-task.js` | follow-up task set up |
| `5-check-email.js` | email sent, placeholders, client name in greeting, spelling |
| `6-check-whatsapp.js` | WhatsApp after a call where the client was not reached |
| `8-check-stage-match.js` | reads the call notes and flags a contradicting lead stage |
| `7-note.js` | writes the note in Ali's wording, posts it, assigns the task |
| `package.json` | tells Actions to use Node |
| `.github/workflows/contact-compliance.yml` | schedule + the dropdown form |

Numbered names matter — the runner loads them by name. Don't rename them.

---

## Running it

**Actions → Contact Compliance → Run workflow.** All dropdowns, nothing to type:

| Dropdown | Choices |
|---|---|
| Dry run | `true` = safe test (writes nothing) · `false` = LIVE |
| Hours back | **Type any number of hours**: 1, 18, 24, 72. Use 0 for any time (no window). Default 24. |
| Lead stage | `all` · **`(not marked)`** · or one of the 21 stages |
| How many contacts | `all` · 25 / 50 / 100 / 250 / 500 / 1000 |
| Consultant + 3 more | `all` · any of the 47 names · `- none -` |

`(not marked)` audits contacts that have activity but no lead stage — pair it with a
wider window to sweep up unstaged leads.

### Read these three things in the log

1. **Access table** — `OK tasks (3 linked)` / `BROKEN communications`. Anything BROKEN
   means the private app can't read it; add the read scope in HubSpot. Checks that
   depend on a broken lookup switch themselves off, so nobody is wrongly flagged.
2. **WhatsApp visibility** — `14 communication record(s) read, 14 counted as WhatsApp`
   plus the channel types seen. If it reads 0 while several contacts had a
   not-reached call, every "no WhatsApp" finding is dropped and a warning printed.
3. **Summary** — scanned / skipped / flagged, issues by type, per consultant, samples.

---

## The rules

**Skipped entirely:** contacts with a **deal** (follow-ups belong on the deal), and
contacts at closed stages (Sale, Duplicate, Wrong Number, Ineligible …) unless you
pick that stage deliberately.

**Lead stage / outcome**
- No lead stage marked → ask them to mark it. Everything stage-dependent waits until then.
- Call logged but no outcome marked → ask them to mark the outcome.
- Lead stage contradicts the call notes → ask them to correct it (AI).

**Call**
- Last call today or yesterday → fine. 2+ days ago, or none → ask them to call.
- Quality is only judged on **recent** calls (not months-old history).
- A call with no call outcome → ask them to select it.
- **Connected** or **Meeting booked** with no description → ask them to log it.
  Never asked for Busy, No answer, Left voicemail, Left live message, Wrong number.
  `NA`, `N/A`, `-`, `.` do not count as a description.

**Email** — expected once a call exists (no call → the ask is to *call*, not both).
Placeholders, missing client name in the greeting, spelling.

**WhatsApp** — required after a call where the client was **not** reached, and it must
come **after** that call; more than 24h later is flagged. Spelling check is OFF.

**Task** — a follow-up task must exist. Our own `[Compliance]` tasks don't count.

Only the **3 most important** issues go in the note: stage mismatch → call → lead
stage → outcome → email → task → WhatsApp.

---

## Changing the rules

Every rule is a scenario in `selftest.js`. **Run `node selftest.js` after any edit** —
it reports `41 passed, 0 failed` and names anything that stopped working. The workflow
runs it before the audit, so a broken rule stops the run instead of posting bad notes.

When adding a rule, add its scenario at the same time. That is what stops rules from
being quietly lost.

---

## How the consultant finds out

1. **A note on the contact**, owned by **Ali Raza (86250521)**, with a real HubSpot
   tag (`data-mention-id` markup, same as a mention typed in the UI).
2. **A task assigned to them** — the reliable in-HubSpot signal, because HubSpot does
   **not** notify for @mentions created via API (their documentation confirms this).
   Prefixed `[Compliance]`. Needs `crm.objects.tasks.write`.
   Turn off with `CREATE_TASK_FOR_CONSULTANT: false`.
3. **An email** — needs `hofmigration.com` verified in Resend; until then only Ali's
   address can receive.

## Going live

- **Manual run:** set the Dry run dropdown to `false`.
- **Daily 10 AM PKT run:** no form is possible on a schedule, so edit `config.js` and
  change the `: true` at the end of the `DRY_RUN:` line to `: false`.

## Secrets

`HUBSPOT_TOKEN` · `GEMINI_KEY` · `RESEND_KEY` — Settings → Secrets and variables → Actions.

## Tuning (all in `config.js`)

`CALL_STALE_AFTER_DAYS` · `CALL_DESCRIPTION_REQUIRED_OUTCOMES` ·
`WHATSAPP_SKIP_CALL_OUTCOMES` · `WHATSAPP_DELAY_HOURS` · `WHATSAPP_SANITY_NET` ·
`CHECK_STAGE_MATCH` · `CHECK_EMAIL_SPELLING` · `CHECK_WHATSAPP_SPELLING` ·
`CHECK_OCCUPATION` · `CHECK_CALL_DESCRIPTION` · `TERMINAL_STAGES` ·
`MAX_ISSUES_PER_CONTACT` · `NOTE_OWNER_ID` · `OWNERS`

**Large runs:** the AI checks cost ~2 calls per contact, so a full sweep may hit Gemini
rate limits. Turn those toggles off, or work through it by consultant or lead stage.

**When you add a consultant:** the workflow dropdowns are generated from `OWNERS`, so
both `config.js` and the `.yml` need regenerating together.
