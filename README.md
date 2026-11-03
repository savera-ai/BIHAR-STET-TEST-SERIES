# Bihar STET Paper 2 Chemistry — Daily Practice Website

Static website (no backend, login, or build step). 30 new practice
questions every day: 10 Inorganic + 10 Organic + 10 Physical. Evaluation
is deferred: answers are revealed only at the end of the test, with the
score, accuracy, subject-wise results, and an explanation for every
question.

## Files

| File | Purpose |
|---|---|
| `index.html` | Structure of the home, quiz, and result screens |
| `styles.css` | All styling — single light premium theme (white/off-white, navy ink, indigo primary; Royal Plum accent in TRE). The Google Fonts stylesheet is the only external resource; everything else uses system fallbacks |
| `app.js` | Quiz logic: daily set, palette, timer, result, localStorage record |
| `questions.json` | Question bank (STET) — see the schema below |
| `tre40-questions-a.json` + `tre40-questions-b.json` | Question bank (BPSC TRE 4.0 — Chemistry, Classes 11–12) — same schema, subject-only; 105 + 105 = 210 questions (split across two files so that each file stays under the Vercel upload limit) |
| `vercel.json` | Vercel static hosting config |

## Design (clean test-series look)

A single light premium theme: white/off-white background, deep navy ink,
one indigo primary accent (STET) — Royal Plum accent in the TRE exam
state. The homepage is simple: one hero, subject-wise practice cards, a
date-picker card, a 3-step "How it works" section, and a compact record
strip. Fonts: Plus Jakarta Sans (UI/headings) + Mukta (body text and all
question/option/explanation text) — Google Fonts, with system/Devanagari
fallbacks; with fallback fonts, the site still displays correctly
offline. There are no images, watermarks, or third-party branding.

## How does daily rotation work?

- `app.js` takes the Asia/Kolkata date (today) and counts days from a
  fixed epoch (1 January 2026).
- Each subject's list is treated as a circle. On day N, the start
  position is (N × 10) mod bank size, and the next 10 questions are taken
  from there (wrapping to the start of the list on reaching the end).
  This sliding window gives a new set every day, each question appears
  roughly equally often, and when the bank ends, the window keeps
  sliding forward instead of restarting the cycle.
- Each date's set is deterministic: the same date always gives the same
  set, so the date picker can be used to re-attempt any day's test.
- Subject practice: 20 questions from that subject, rotating by day.
- "Random 30" gives 10 + 10 + 10 random questions each time.

## How to add a new daily set (no code change)

`questions.json` is a JSON array. To add 30 new questions, append items
with the same schema to the end of the array, then commit and deploy:

```json
{
  "q": "Write the question here?",
  "options": ["Option A", "Option B", "Option C", "Option D"],
  "answer": 0,
  "explanation": "Why the correct answer is right, in 1-2 lines.",
  "subject": "Inorganic",
  "topic": "Atomic Structure / Nodes"
}
```

Rules:

- `options` must always contain 4 distinct options.
- `answer` is the index of the correct option: 0 = A, 1 = B, 2 = C, 3 = D.
- `subject` must always be one of: `Inorganic`, `Organic`, `Physical`.
- Add at least 10 new questions for each subject so that the daily set
  stays balanced (10 + 10 + 10).
- Do not add duplicate / near-duplicate questions — check the bank first
  (for example Graham's law, Ksp AB2, XeO3 shape, EAN, G–C hydrogen bonds).
- Do not write any invented PYQ year or chapter weightage claim.

The site does not need to be redeployed separately — Vercel redeploys
automatically on a GitHub push (if the project is linked to Git).

## Running locally

`questions.json` is loaded with `fetch`, so opening the file directly by
double-clicking it (`file://`) may cause the browser to block the fetch.
Run it from a local server:

```bash
cd stet-quiz-website
python3 -m http.server 8000
# then open http://localhost:8000 in the browser
```

## Deploying on Vercel (from GitHub)

1. Push this folder to a GitHub repository.
2. Vercel dashboard → Add New Project → import the same repository.
3. Framework preset: **Other** (no build command, no output directory
   — static files are served from the root).
4. Press Deploy. Vercel creates a new deployment on every GitHub push.

## Disclaimer

Cross-check the syllabus list on the official BSEB website before final
reliance. No chapter-wise weightage claim is made on this site. This site
is not affiliated with Testbook; the design and content are original.

## BPSC TRE 4.0 — Chemistry (Classes 11–12)

A second section on the same site: **BPSC TRE 4.0 — Chemistry (Classes 11–12)**.
There is no standalone paper called "Paper 2 Chemistry" in TRE — Chemistry
is Part III (Concerned Subject) of the Main Exam, only for Classes 11–12.
This section is never named "Paper 2".

**Scope — subject only (Part III) Chemistry:** `tre40-questions-a.json` /
`tre40-questions-b.json` contain 210 questions (Inorganic 70, Organic 70,
Physical 70), for Subject Chemistry only. Language (qualifying) and
General Studies are not in this bank. The daily 30-question test
(10 + 10 + 10) is a practice subset of this bank — it is not a full mock
of the whole exam, and it makes no claim about Language/GS coverage.
There is no standalone Chemistry track for Classes 9–10 on this site.

**Rotation is the same for TRE:** the STET sliding-window algorithm, the
same epoch (1 January 2026), and the Asia/Kolkata date. With a 70/70/70
bank, the daily windows repeat every 7 days (step 10 mod 70) — this is
the correct result of the rotation, not a bug. The STET and TRE sets are
independent of each other.

**Syllabus label (fallback — prescribed wording, the single wording live):**

> Syllabus map: fallback based on the BPSC TRE framework (Bihar Teacher Rules, 2023) + SCERT/NCERT Higher Secondary curriculum; still to be verified against the detailed notification for TRE 4.0 (Advt. 14/2026). The pattern (Prelims+Mains / negative marking) may change.

This section carries the label "Beta — syllabus unverified". It is not
presented as the "Official BPSC TRE 4.0 syllabus". No chapter-wise
weightage, per-chapter question count, PYQ year, exam date, or vacancy
claim is made. Negative marking — still to be verified against the BPSC
final notification.

**Scoring is configurable:** in `app.js`, `EXAMS.tre40.negativeMarking`
defaults to `0` (no negative marking for a wrong answer). Only when BPSC
confirms it should this one value be changed to `-1/3` — no change to the
shared scoring code. History is saved under separate keys:
`stetQuizHistory` (STET) and `tre40QuizHistory` (TRE); `examSwitcherChoice`
stores only the last selected exam tab, no score.

**How to add TRE questions:** append items with the same schema as STET
to the end of the `tre40-questions-b.json` array (and keep the a/b balance
as file size grows) — 4 options, `answer` 0–3, `explanation`, `subject`
Inorganic/Organic/Physical, `topic`. Add at least 10 questions for each
subject, do not add duplicates/near-duplicates (also cross-check against
the STET bank), and do not write any invented PYQ/weightage claim.
Topics tagged "(Advanced PG-extension)" come from a single secondary
source — confirmation is pending, so do not present them as core syllabus
claims.
