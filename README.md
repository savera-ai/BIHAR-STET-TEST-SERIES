# Bihar STET Paper 2 Chemistry — Daily Practice Website

Static website (koi backend, login ya build step nahi). Roz 30 naye practice
questions: 10 Inorganic + 10 Organic + 10 Physical. Jawab test ke ant me
(score, accuracy, subject-wise result aur har sawal ka explanation) milta hai.

## Files

| File | Kaam |
|---|---|
| `index.html` | Home, quiz aur result screens ka structure |
| `styles.css` | Saari styling — single light premium theme (white/off-white, navy ink, indigo primary; TRE me Royal Plum accent). Google Fonts stylesheet hi ekmatra external resource hai, baaki system fallbacks |
| `app.js` | Quiz logic: daily set, palette, timer, result, localStorage record |
| `questions.json` | Question bank (STET) — schema neeche dekho |
| `tre40-questions-a.json` + `tre40-questions-b.json` | Question bank (BPSC TRE 4.0 — Chemistry, Classes 11–12) — wahi schema, subject-only; 105 + 105 = 210 questions (do files me isliye taaki har file Vercel upload limit me rahe) |
| `vercel.json` | Vercel static hosting config |

## Design (clean test-series look)

Ek hi light premium theme: white/off-white background, deep navy ink,
ek indigo primary accent (STET) — TRE exam state me Royal Plum accent.
Homepage simple hai: ek hero, subject-wise practice cards, date-picker
card, 3-step "Kaise kaam karta hai" aur ek compact record strip. Fonts:
Plus Jakarta Sans (UI/headings) + Mukta (Hindi body aur saare
question/option/explanation text) — Google Fonts, system/Devanagari
fallbacks ke saath; offline me fallback fonts se site sahi dikhti hai.
Koi image, watermark ya third-party branding nahi hai.

## Daily rotation kaise kaam karta hai?

- `app.js` Asia/Kolkata tareekh (aaj) leta hai aur ek fixed epoch
  (1 January 2026) se din ginata hai.
- Har subject ki list ko ek circle mana jata hai. Din N par start position
  (N × 10) mod bank-size hoti hai aur wahan se agle 10 questions liye jate
  hain (ant par pahunche to list ki shuruaat se wrap hota hai). Is sliding
  window se har din naya set milta hai, har question lagbhag barabar baar
  aata hai, aur bank khatm hone par cycle dobara shuru hone ke bajay window
  aage khisakti rehti hai.
- Har tareekh ka set deterministic hai: usi tareekh par hamesha wahi set
  milega, isliye date picker se kisi bhi din ka test dobara solve kar sakte ho.
- Subject practice: us subject se 20 questions, din ke hisab se rotate hote hue.
- "Random 30" har baar 10 + 10 + 10 random questions deta hai.

## Naya daily set kaise add karein (koi code change nahi)

`questions.json` ek JSON array hai. Naye 30 questions add karne ke liye array
ke ant me same schema wale items append kar do, phir commit + deploy karo:

```json
{
  "q": "Sawal yahan likho? (Hindi + English terms)",
  "options": ["Option A", "Option B", "Option C", "Option D"],
  "answer": 0,
  "explanation": "1-2 line me sahi jawab kyun hai.",
  "subject": "Inorganic",
  "topic": "Atomic Structure / Nodes"
}
```

Niyam:

- `options` me hamesha 4 alag-alag options hon.
- `answer` sahi option ka index hai: 0 = A, 1 = B, 2 = C, 3 = D.
- `subject` hamesha inme se ek ho: `Inorganic`, `Organic`, `Physical`.
- Har subject ke kam se kam 10 naye questions add karo taaki daily set
  balanced (10 + 10 + 10) bana rahe.
- Duplicate / near-duplicate sawal mat daalo — pehle bank me check kar lo
  (jaise Graham law, Ksp AB2, XeO3 shape, EAN, G–C hydrogen bonds).
- Koi invented PYQ year ya chapter weightage claim mat likho.

Site ko phir se deploy karne ki zaroorat nahi hoti — Vercel GitHub push par
khud redeploy kar deta hai (agar project Git se linked hai).

## Local me chalana

`questions.json` ko `fetch` se load kiya jata hai, isliye file ko seedha
double-click karke (`file://`) kholne par browser fetch block kar sakta hai.
Local server se chalao:

```bash
cd stet-quiz-website
python3 -m http.server 8000
# phir browser me http://localhost:8000 kholo
```

## Vercel par deploy karna (GitHub se)

1. Is folder ko GitHub repository me push karo.
2. Vercel dashboard → Add New Project → wahi repository import karo.
3. Framework preset: **Other** (koi build command nahi, koi output directory
   nahi — root se static files serve hongi).
4. Deploy dabao. Har GitHub push par Vercel khud naya deployment bana dega.

## Disclaimer

Syllabus ki list ko final reliance se pehle official BSEB website par
cross-check kar lein. Is site par koi chapter-wise weightage claim nahi kiya
gaya hai. Ye site Testbook se sambandhit nahi hai; design aur content
original hain.

## BPSC TRE 4.0 — Chemistry (Classes 11–12)

Isi site par doosra section hai: **BPSC TRE 4.0 — Chemistry (Classes 11–12)**.
TRE me "Paper 2 Chemistry" jaisa koi standalone paper nahi hai — Chemistry,
Main Exam ka Part III (Concerned Subject) hai, sirf Classes 11–12 ke liye.
Is section ka naam kabhi "Paper 2" nahi rakha jata.

**Scope — sirf Subject (Part III) Chemistry:** `tre40-questions-a.json` / `tre40-questions-b.json` me
210 questions hain (Inorganic 70, Organic 70, Physical 70), sirf Subject
Chemistry ke. Language (qualifying) aur General Studies is bank me nahi
hain. Roz ka 30-question test (10 + 10 + 10) is bank ka practice subset
hai — ye poora exam ka full mock nahi hai, aur Language/GS coverage ka
koi daava nahi karta. Classes 9–10 ka koi standalone Chemistry track is
site par nahi hai.

**Rotation TRE ke liye bhi wahi hai:** STET wala sliding-window algorithm,
wahi epoch (1 January 2026), Asia/Kolkata tareekh. 70/70/70 bank ke saath
daily windows har 7 din me dohrati hain (step 10 mod 70) — ye rotation ka
sahi natija hai, bug nahi. STET aur TRE ke set ek dusre se aazaad hain.

**Syllabus label (fallback — prescribed wording, ek hi wording live hai):**

> Syllabus map: BPSC TRE framework (Bihar Teacher Rules, 2023) + SCERT/NCERT Higher Secondary curriculum ke aadhar par banaya gaya fallback hai; TRE 4.0 (Advt. 14/2026) ki detailed notification se verify hona baaki hai. Pattern (Prelims+Mains / negative marking) me badlav sambhav hai.

Is section ko "Official BPSC TRE 4.0 syllabus" ke roop me present nahi
kiya gaya hai. Koi chapter-wise weightage, per-chapter question count,
PYQ year, exam date ya vacancy claim nahi kiya gaya hai. Negative
marking — BPSC final notification se verify hona baaki hai.

**Scoring configurable hai:** `app.js` me `EXAMS.tre40.negativeMarking`
default `0` hai (galat jawab par koi negative marking nahi). BPSC ke
confirm karne par hi is ek value ko `-1/3` kiya jayega — shared scoring
code me koi change nahi hoga. History alag keys me save hoti hai:
`stetQuizHistory` (STET) aur `tre40QuizHistory` (TRE); `examSwitcherChoice`
me sirf aakhri chuna gaya exam tab save hota hai, koi score nahi.

**TRE questions kaise add karein:** `tre40-questions-b.json` array ke ant me (aur file size badhne par a/b balance rakhein)
STET wali hi schema ke items append karo (4 options, `answer` 0–3,
`explanation`, `subject` Inorganic/Organic/Physical, `topic`). Har subject
ke kam se kam 10 questions add karo, duplicate/near-duplicate mat daalo
(STET bank se bhi cross-check kar lo), aur koi invented PYQ/weightage
claim mat likho. "(Advanced PG-extension)" tag wale topics single
secondary source se hain — confirmation pending hai, isliye unhe core
syllabus claim ke roop me mat likho.
