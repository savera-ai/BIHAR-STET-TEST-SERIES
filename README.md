# Bihar STET Paper 2 Chemistry — Daily Practice Website

Static website (koi backend, login ya build step nahi). Roz 30 naye practice
questions: 10 Inorganic + 10 Organic + 10 Physical. Jawab test ke ant me
(score, accuracy, subject-wise result aur har sawal ka explanation) milta hai.

## Files

| File | Kaam |
|---|---|
| `index.html` | Home, quiz aur result screens ka structure |
| `styles.css` | Saari styling — 7 weekday glass themes, Google Fonts stylesheet hi ekmatra external resource hai, baaki system fallbacks |
| `app.js` | Quiz logic: daily set, palette, timer, result, localStorage record |
| `questions.json` | Question bank — schema neeche dekho |
| `vercel.json` | Vercel static hosting config |

## Themes (7 weekday, glass design)

Har din (Asia/Kolkata weekday) ek alag glass theme milta hai — Monday soft,
Tuesday cobalt, Wednesday wine, Thursday indigo/teal, Friday deep green,
Saturday dark navy, Sunday pink. Theme sirf colours badalta hai, questions
aur rotation nahi. Fonts: Baloo 2 (headings), Rozha One (hero Hindi line),
Mukta (body/questions) — Google Fonts, system/Devanagari fallbacks ke saath;
offline me fallback fonts se site sahi dikhti hai.

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
