# Bihar STET Paper 2 Chemistry — Daily Practice Website

Static website (no backend, login, or build step). A new 30-question
practice set is published every morning, about 05:00 IST: 10 Inorganic
+ 10 Organic + 10 Physical. Evaluation is deferred: answers are
revealed only at the end of the test, with the score, accuracy,
subject-wise results, and an explanation for every question.

## Files

| File | Purpose |
|---|---|
| `index.html` | Structure of the home, quiz, and result screens |
| `styles.css` | All styling — single light premium theme (white/off-white, navy ink, indigo primary; Royal Plum accent in TRE). The Google Fonts stylesheet is the only external resource; everything else uses system fallbacks |
| `app.js` | Quiz logic: daily set, palette, timer, result, localStorage record, Question Inventory |
| `questions-a.json` + `questions-b.json` | Question bank (STET) — 109 + 109 = 218 questions (Inorganic 71, Organic 73, Physical 74); see the schema below |
| `tre40-questions-a.json` + `tre40-questions-b.json` | Question bank (BPSC TRE 4.0 — Chemistry, Classes 11–12) — same schema, subject-only; 120 + 120 = 240 questions (Inorganic 80, Organic 80, Physical 80) |
| `daily-sets.json` | Question Inventory manifest: the published daily sets, one entry per exam and date, listing the set's question ids in order |
| `vercel.json` | Vercel static hosting config |

Every bank shard is minified JSON and stays well under 128KB: no single
file may exceed the Vercel single-argument upload limit. Banks are
split into balanced shards; `app.js` loads every shard for an exam and
concatenates them in file order. Combined shard order is the bank order.

## Question ids

Every question has a stable unique `id`, assigned once in bank order
and never reused or reordered:

- STET: `stet-0001` to `stet-0218` (in bank order).
- TRE 4.0: `tre40-0001` to `tre40-0240` (in combined shard order).

New questions are appended to the end of the bank and take the next
ids in order. Never renumber, reuse, or reorder existing ids: the
manifest and past daily sets refer to questions by id.

## Design (clean test-series look)

A single light premium theme: white/off-white background, deep navy ink,
one indigo primary accent (STET) — Royal Plum accent in the TRE exam
state. The homepage is simple: one hero, subject-wise practice cards, a
Question Inventory section, a date-picker card, a 3-step "How it works"
section, and a compact record strip. Fonts: Plus Jakarta Sans
(UI/headings) + Mukta (body text and all question/option/explanation
text) — Google Fonts, with system/Devanagari fallbacks; with fallback
fonts, the site still displays correctly offline. There are no images,
watermarks, or third-party branding.

## How does the daily set work?

A new 30-question set is published every morning, about 05:00 IST, and
saved in `daily-sets.json`. Every published set is frozen forever: the
site resolves a date's set from the manifest first, by question id, in
manifest order. Later bank growth never changes a published set.

Dates with no manifest entry fall back to the rotation:

- `app.js` takes the Asia/Kolkata date and counts days from a fixed
  epoch (1 January 2026).
- Each subject's list is treated as a circle. On day N, the start
  position is (N × 10) mod list size, and the next 10 questions are
  taken from there (wrapping to the start of the list on reaching the
  end). This sliding window gives a different set each day, each
  question appears roughly equally often, and when the list ends, the
  window keeps sliding forward instead of restarting the cycle.
- The rotation base is frozen: the first 188 STET questions and the
  first 210 TRE questions in file order (`ROTATION_BASE` in `app.js`),
  not the grown bank. Past rotation dates therefore keep replaying
  exactly as before, despite bank growth.
- Each rotation date's set is deterministic: the same date always
  gives the same set, so the date picker can be used to re-attempt any
  day's test. Rotation-fallback dates are not "new" published sets.
- Subject practice: 20 questions from that subject, rotating by day,
  over the full bank (new questions included).
- "Random 30" gives 10 + 10 + 10 random questions each time, from the
  full bank.

The manifest is loaded non-fatally: if `daily-sets.json` fails to load
or parse, daily tests still work via rotation and the homepage never
goes blank; the Question Inventory shows its empty state. The manifest
reader also tolerates the legacy flat-array format
(`[{"date", "exam", "ids"}]`) by mapping it to the same structure.

## Question Inventory (daily-sets.json)

Format:

```json
{"stet": [{"date": "2026-11-05", "ids": ["stet-0189", "..."]}],
 "tre40": [{"date": "2026-11-05", "ids": ["tre40-0211", "..."]}]}
```

Each entry lists 30 ids in the order Inorganic 10, Organic 10,
Physical 10. A manifest set is frozen forever and is never
regenerated. The inventory section on each home view lists every
published set for that exam, newest first, with its set number
(oldest = Set 1), date, question counts, a "Today" badge when the set
is today's, a completed note when a matching history entry exists, and
a Start button that loads exactly that set.

## How to add a new daily set

Append 30 new questions (10 Inorganic + 10 Organic + 10 Physical) to
the end of the exam's bank shards, keeping the shards balanced, assign
the next ids in bank order, and append one manifest entry for the date
with those 30 ids. Then deploy (see below). The schema for each new
question is:

```json
{
  "id": "stet-0219",
  "q": "Write the question here?",
  "options": ["Option A", "Option B", "Option C", "Option D"],
  "answer": 0,
  "explanation": "Why the correct answer is right, in 1-2 lines.",
  "subject": "Inorganic",
  "topic": "Atomic Structure / Nodes"
}
```

Rules:

- `id` is assigned once, in bank order, and never reused or reordered.
- `options` must always contain 4 distinct options.
- `answer` is the index of the correct option: 0 = A, 1 = B, 2 = C, 3 = D.
- `subject` must always be one of: `Inorganic`, `Organic`, `Physical`.
- Add at least 10 new questions for each subject so that the daily set
  stays balanced (10 + 10 + 10).
- Do not add duplicate / near-duplicate questions — check the bank first
  (for example Graham's law, Ksp AB2, XeO3 shape, EAN, G–C hydrogen bonds).
- Do not write any invented PYQ year or chapter weightage claim.
- Keep every shard minified and under 128KB; rebalance the shards if
  one shard grows too large, without changing combined bank order.
- A manifest entry, once published, is never edited or regenerated.

IDEMPOTENCY: the 5 Nov 2026 sets are already published — one entry per
exam in `daily-sets.json` for `2026-11-05`. A daily run on 5 Nov must
find them present and publish nothing new for that date. Never publish
two sets for the same exam and date.

## Running locally

The bank shards and `daily-sets.json` are loaded with `fetch`, so
opening the file directly by double-clicking it (`file://`) may cause
the browser to block the fetch. Run it from a local server:

```bash
cd stet-quiz-website
python3 -m http.server 8000
# then open http://localhost:8000 in the browser
```

## Deploying on Vercel

Deployment is by the deploy script, not automatically on a GitHub
push: the script uploads each file with `upload_file` and creates a
deployment with `create_deployment` (`forceNew: 1`, no `gitSource`,
no `teamId` — passing `teamId` returns 403). Pushing to GitHub alone
does not redeploy the live site. The deploy script's file list is:
`index.html`, `styles.css`, `app.js`, the bank shards,
`daily-sets.json`, `README.md`, `vercel.json`, `robots.txt`,
`sitemap.xml`.

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
`tre40-questions-b.json` contain 240 questions (Inorganic 80, Organic 80,
Physical 80), for Subject Chemistry only. Language (qualifying) and
General Studies are not in this bank. The daily 30-question test
(10 + 10 + 10) is a practice subset of this bank — it is not a full mock
of the whole exam, and it makes no claim about Language/GS coverage.
There is no standalone Chemistry track for Classes 9–10 on this site.

**Rotation is the same for TRE:** the STET sliding-window algorithm, the
same epoch (1 January 2026), and the Asia/Kolkata date, over the frozen
rotation base of the first 210 TRE questions (70/70/70). With that base,
the daily windows repeat every 7 days (step 10 mod 70) — this is the
correct result of the rotation, not a bug. The STET and TRE sets are
independent of each other. Published TRE sets come from the manifest
first, as for STET.

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
to the end of the TRE bank shards (keeping the a/b shards balanced and
under 128KB each), assign the next `tre40-NNNN` ids in bank order, and
append one manifest entry for the date — 4 options, `answer` 0–3,
`explanation`, `subject` Inorganic/Organic/Physical, `topic`. Add at
least 10 questions for each subject, do not add
duplicates/near-duplicates (also cross-check against the STET bank),
and do not write any invented PYQ/weightage claim. Topics tagged
"(Advanced PG-extension)" come from a single secondary source —
confirmation is pending, so do not present them as core syllabus
claims.
