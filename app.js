"use strict";
/* Bihar STET Paper 2 Chemistry — daily quiz app. No backend, no login.
   Daily set: deterministic by Asia/Kolkata date, 10+10+10, rotating
   through each subject's bank without repeat until exhausted, then cycling.
   Rotation is a sliding window over the bank in file order: day N starts
   at (N * 10) mod bankSize for that subject and takes the next 10,
   wrapping to the start. The underlying order therefore cycles only
   after every question has been seen, and over time every question
   appears equally often (unlike fixed 10-question blocks, which would
   repeat the first questions of the last partial block every cycle).
   The same date always yields the same set, so the date picker replays
   any day's set. No correct/wrong feedback is shown during a quiz;
   the full review (correct answers + explanations) is only on the
   result screen. Scores are kept in localStorage only.
   Two banks share one quiz/result flow: Bihar STET Paper 2 Chemistry
   (questions.json, stetQuizHistory) and BPSC TRE 4.0 — Chemistry
   (Classes 11-12) (tre40-questions-a/b.json, tre40QuizHistory). The TRE
   bank is Subject (Part III) Chemistry only; Language and General
   Studies are not in it. TRE syllabus/pattern facts are unverified:
   the TRE section is labelled as a fallback (Bihar Teacher Rules
   2023 framework + SCERT/NCERT Higher Secondary curriculum) and
   scoring uses a per-exam negativeMarking config (default 0) until
   BPSC confirms the final pattern. See INTEGRATION.md. */

const EPOCH_DAY = dayNumber("2026-01-01");
const LETTERS = ["A", "B", "C", "D"];
const EXAM_CHOICE_KEY = "examSwitcherChoice"; // UI preference only, never scores

/* Per-exam config. STET values preserve existing behaviour exactly.
   TRE values: correct name, subject-only scope, configurable scoring.
   negativeMarking: 0 = no negative marking (default, TO CONFIRM).
   Set to -1/3 ONLY when BPSC confirms it; never hard-code it elsewhere. */
const EXAMS = {
  stet: {
    key: "stet",
    short: "STET",
    title: "Bihar STET Paper 2 Chemistry — Daily Practice Test",
    themeColor: "#2B3FE0",
    mark: "ST",
    brandTitle: "Bihar STET Chemistry",
    brandSub: "Paper 2 · Classes 11–12 · Daily Practice",
    file: "questions.json",
    historyKey: "stetQuizHistory",
    subjects: ["Inorganic", "Organic", "Physical"],
    todayLineId: "todayLine",
    datePickerId: "datePicker",
    subjectCardsId: "subjectCards",
    historyLineId: "lastScoreLine",
    historyListId: "historyList",
    countAttr: "data-count",
    practiceAttr: "data-practice",
    negativeMarking: 0,
    markingNote: ""
  },
  tre40: {
    key: "tre40",
    short: "TRE 4.0",
    title: "BPSC TRE 4.0 — Chemistry (Classes 11–12) — Daily Practice Test",
    themeColor: "#593C8F",
    mark: "TR",
    brandTitle: "BPSC TRE 4.0 Chemistry",
    brandSub: "Chemistry · Classes 11–12 · Daily Practice",
    // Split into two files so each stays under the Vercel single-file
    // upload argument limit; together they are the full 210-question bank.
    files: ["tre40-questions-a.json", "tre40-questions-b.json"],
    historyKey: "tre40QuizHistory",
    // TO CONFIRM from the question-bank file on arrival: if the TRE
    // bank uses different subject strings, update this list to match
    // the file. Do not rename subjects in the file to fit the code.
    subjects: ["Inorganic", "Organic", "Physical"],
    todayLineId: "tre40TodayLine",
    datePickerId: "tre40DatePicker",
    subjectCardsId: "tre40SubjectCards",
    historyLineId: "tre40LastScoreLine",
    historyListId: "tre40HistoryList",
    countAttr: "data-count-tre40",
    practiceAttr: "data-practice-tre40",
    negativeMarking: 0, // TO CONFIRM: -1/3 only when BPSC confirms it
    markingNote: "Negative marking — BPSC final notification se verify hona baaki hai."
  }
};

let BANKS = { stet: [], tre40: [] };
let BANK_ERRORS = { stet: null, tre40: null };
let CURRENT_EXAM = "stet";
// state: {questions, answers, marked:Set, current, label, dateStr,
//         exam, totalSeconds, secondsLeft, timerId, startedAt, done}
let state = null;

function dayNumber(dateStr) {
  return Math.floor(Date.parse(dateStr + "T00:00:00Z") / 86400000);
}
function istTodayStr() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(new Date());
}
function prettyDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00Z");
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata", weekday: "long", day: "numeric", month: "long", year: "numeric"
  }).format(d);
}
function el(tag, text, cls) {
  const n = document.createElement(tag);
  if (text !== undefined && text !== null) n.textContent = text;
  if (cls) n.className = cls;
  return n;
}
function bySubject(subject, exam) {
  const bank = BANKS[exam || CURRENT_EXAM] || [];
  return bank.filter((q) => q.subject === subject);
}
function pickDaily(dateStr, exam) {
  const ex = exam || CURRENT_EXAM;
  const dayIndex = dayNumber(dateStr) - EPOCH_DAY;
  const out = [];
  for (const s of EXAMS[ex].subjects) {
    const list = bySubject(s, ex);
    if (!list.length) continue;
    const count = Math.min(10, list.length);
    const start = (((dayIndex * count) % list.length) + list.length) % list.length;
    out.push(...rotate(list, start, count));
  }
  return out;
}
function pickSubject(subject, dateStr, exam) {
  const ex = exam || CURRENT_EXAM;
  const list = bySubject(subject, ex);
  if (!list.length) return [];
  const dayIndex = dayNumber(dateStr) - EPOCH_DAY;
  const start = ((dayIndex * 20) % list.length + list.length) % list.length;
  return rotate(list, start, Math.min(20, list.length));
}
function pickRandom(exam) {
  const ex = exam || CURRENT_EXAM;
  const out = [];
  for (const s of EXAMS[ex].subjects) out.push(...shuffled(bySubject(s, ex)).slice(0, 10));
  return shuffled(out);
}
function rotate(list, start, count) {
  if (!list.length) return [];
  const out = [];
  for (let i = 0; i < count; i++) out.push(list[(start + i) % list.length]);
  return out;
}
function shuffled(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ---------- views ---------- */
function homeViewFor(exam) {
  return exam === "tre40" ? "home-tre40" : "home";
}
function showView(name) {
  const target = name === "home" ? homeViewFor(CURRENT_EXAM) : name;
  for (const v of ["home", "home-tre40", "quiz", "result"]) {
    const sec = document.getElementById("view-" + v);
    if (sec) sec.hidden = v !== target;
  }
  window.scrollTo({ top: 0 });
}
/* setExam is the ONLY place that touches body[data-exam], title,
   theme-color, switcher state, brand text, or examSwitcherChoice. */
function setExam(exam) {
  if (!EXAMS[exam]) return;
  CURRENT_EXAM = exam;
  document.body.dataset.exam = exam;
  document.title = EXAMS[exam].title;
  const theme = document.querySelector('meta[name="theme-color"]');
  if (theme) theme.content = EXAMS[exam].themeColor;
  document.querySelectorAll("[data-exam-switch]").forEach((b) => {
    const on = b.getAttribute("data-exam-switch") === exam;
    b.classList.toggle("active", on);
    b.setAttribute("aria-pressed", on ? "true" : "false");
  });
  const mark = document.getElementById("brandMark");
  if (mark) mark.textContent = EXAMS[exam].mark;
  const title = document.getElementById("brandTitle");
  if (title) title.textContent = EXAMS[exam].brandTitle;
  const sub = document.getElementById("brandSub");
  if (sub) sub.textContent = EXAMS[exam].brandSub;
  try { localStorage.setItem(EXAM_CHOICE_KEY, exam); } catch (e) { /* private mode: ignore */ }
  renderCounts(exam);
  renderHistory(exam);
}

/* ---------- history (localStorage only) ---------- */
function loadHistory(exam) {
  const ex = exam || CURRENT_EXAM;
  try { return JSON.parse(localStorage.getItem(EXAMS[ex].historyKey) || "[]"); }
  catch (e) { return []; }
}
function saveHistory(entry, exam) {
  const ex = exam || CURRENT_EXAM;
  const h = loadHistory(ex);
  h.unshift(entry);
  localStorage.setItem(EXAMS[ex].historyKey, JSON.stringify(h.slice(0, 20)));
}
function renderHistory(exam) {
  const ex = exam || CURRENT_EXAM;
  const cfg = EXAMS[ex];
  const line = document.getElementById(cfg.historyLineId);
  const list = document.getElementById(cfg.historyListId);
  if (!line || !list) return;
  const h = loadHistory(ex);
  list.innerHTML = "";
  if (!h.length) {
    line.textContent = "Abhi tak koi test is device par complete nahi hua hai.";
    return;
  }
  const last = h[0];
  line.textContent = "Pichhla score: " + last.score + " / " + last.total +
    " (" + last.label + ", " + prettyDate(last.dateStr) + ")";
  for (const e of h.slice(0, 7)) {
    const li = el("li", prettyDate(e.dateStr) + " — " + e.label + ": " +
      e.score + "/" + e.total + " (" + Math.round((e.score / e.total) * 100) + "%)");
    list.appendChild(li);
  }
}

/* ---------- quiz flow ---------- */
function startTest(questions, label, dateStr, exam) {
  if (!questions.length) return;
  const ex = exam || CURRENT_EXAM;
  stopTimer();
  state = {
    questions,
    answers: new Array(questions.length).fill(null),
    marked: new Set(),
    current: 0,
    label,
    dateStr,
    exam: ex,
    totalSeconds: questions.length * 90,
    secondsLeft: questions.length * 90,
    startedAt: Date.now(),
    timerId: null,
    done: false
  };
  CURRENT_EXAM = ex;
  document.body.dataset.exam = ex;
  document.getElementById("quizTitle").textContent = label;
  const present = EXAMS[ex].subjects.filter((s) => questions.some((q) => q.subject === s));
  let meta = questions.length + " questions • " + present.join(", ") +
    " • Jawab ant me milega";
  if (EXAMS[ex].markingNote) meta += " • " + EXAMS[ex].markingNote;
  document.getElementById("quizMeta").textContent = meta;
  const chip = document.getElementById("quizExam");
  if (chip) {
    chip.textContent = EXAMS[ex].short;
    chip.style.display = "";
  }
  showView("quiz");
  renderQuestion();
  renderPalette();
  startTimer();
}

function stopTimer() {
  if (state && state.timerId) {
    clearInterval(state.timerId);
    state.timerId = null;
  }
}
function startTimer() {
  if (!state) return;
  updateTimer();
  state.timerId = setInterval(() => {
    state.secondsLeft -= 1;
    if (state.secondsLeft <= 0) {
      state.secondsLeft = 0;
      updateTimer();
      submitTest(true);
      return;
    }
    updateTimer();
  }, 1000);
}
function fmtTime(sec) {
  const m = Math.floor(sec / 60), s = sec % 60;
  return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
}
function updateTimer() {
  if (!state) return;
  const t = document.getElementById("timer");
  if (t) t.textContent = fmtTime(state.secondsLeft);
  const box = document.querySelector(".timer-box");
  if (box) box.classList.toggle("low", state.secondsLeft <= 300);
}
function renderQuestion() {
  if (!state) return;
  const q = state.questions[state.current];
  document.getElementById("qNum").textContent =
    "Question " + (state.current + 1) + " / " + state.questions.length;
  document.getElementById("qSubject").textContent = q.subject;
  document.getElementById("qTopic").textContent = q.topic || "";
  document.getElementById("qText").textContent = q.q;

  const box = document.getElementById("options");
  box.innerHTML = "";
  q.options.forEach((opt, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "option" + (state.answers[state.current] === i ? " selected" : "");
    btn.setAttribute("role", "radio");
    btn.setAttribute("aria-checked", state.answers[state.current] === i ? "true" : "false");
    btn.appendChild(el("span", LETTERS[i], "option-letter"));
    btn.appendChild(el("span", opt));
    btn.addEventListener("click", () => {
      state.answers[state.current] = i;
      renderQuestion();
      renderPalette();
    });
    box.appendChild(btn);
  });

  document.getElementById("btnPrev").disabled = state.current === 0;
  // On the last question the Next button submits (with the same
  // unanswered-confirm as the palette Submit button), so it is labelled
  // as a submit action rather than a no-op "last question" label.
  document.getElementById("btnNext").textContent =
    state.current === state.questions.length - 1 ? "Submit Karo ✓" : "Agla →";
  document.getElementById("btnMark").textContent = state.marked.has(state.current)
    ? "★ Marked — Hatayo" : "Review ke liye Mark Karo";
  const answered = state.answers.filter((a) => a !== null).length;
  document.getElementById("answeredLine").textContent =
    answered + " / " + state.questions.length + " answered • " +
    state.marked.size + " marked for review";
}
function renderPalette() {
  if (!state) return;
  const pal = document.getElementById("palette");
  pal.innerHTML = "";
  state.questions.forEach((_, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "pal-btn" +
      (i === state.current ? " current" : "") +
      (state.answers[i] !== null ? " answered" : "") +
      (state.marked.has(i) ? " marked" : "");
    b.textContent = String(i + 1);
    b.setAttribute("aria-label", "Question " + (i + 1));
    b.addEventListener("click", () => { state.current = i; renderQuestion(); renderPalette(); });
    pal.appendChild(b);
  });
  const answered = state.answers.filter((a) => a !== null).length;
  document.getElementById("paletteSummary").textContent =
    "Answered: " + answered + " • Unanswered: " + (state.questions.length - answered) +
    " • Marked: " + state.marked.size;
}
function computeScore(questions, answers, exam) {
  const neg = (EXAMS[exam] && EXAMS[exam].negativeMarking) || 0;
  let raw = 0, correct = 0, wrong = 0;
  questions.forEach((q, i) => {
    if (answers[i] === null) return;
    if (answers[i] === q.answer) { correct += 1; raw += 1; }
    else { wrong += 1; raw += neg; }
  });
  return { raw: raw, correct: correct, wrong: wrong, neg: neg };
}
function formatScore(raw, neg) {
  // Numeric score, matching the original history shape (score is a
  // number, not a string). Integer when there is no negative marking,
  // rounded to 2 decimals when negative marking is configured.
  if (!neg) return raw;
  return Math.round(raw * 100) / 100;
}

function submitTest(auto) {
  if (!state || state.done) return;
  const unanswered = state.answers.filter((a) => a === null).length;
  if (!auto && unanswered > 0) {
    if (!window.confirm(unanswered + " question(s) ke jawab nahi diye gaye hain. Phir bhi submit karna hai?")) return;
  }
  state.done = true;
  stopTimer();
  const timeTaken = Math.round((Date.now() - state.startedAt) / 1000);
  const result = computeScore(state.questions, state.answers, state.exam);
  saveHistory({
    dateStr: state.dateStr, label: state.label,
    score: formatScore(result.raw, result.neg), total: state.questions.length, timeSec: timeTaken
  }, state.exam);
  renderResult(result, timeTaken);
  showView("result");
  renderHistory(state.exam);
}

function renderResult(result, timeTaken) {
  const total = state.questions.length;
  const accuracy = Math.round((result.correct / total) * 100);
  document.getElementById("resultScore").textContent =
    formatScore(result.raw, result.neg) + " / " + total;
  let summary = state.label + " • Accuracy: " + accuracy + "% • Time taken: " +
    Math.floor(timeTaken / 60) + " min " + (timeTaken % 60) + " sec";
  if (EXAMS[state.exam].markingNote) summary += " • " + EXAMS[state.exam].markingNote;
  if (result.neg) summary += " • Negative marking: " + result.neg + " per galat jawab";
  document.getElementById("resultSummary").textContent = summary;
  const statRow = document.getElementById("statRow");
  statRow.innerHTML = "";
  const stats = [
    ["Sahi", result.correct],
    ["Galat", result.wrong],
    ["Chhute hue", state.answers.filter((a) => a === null).length],
    ["Accuracy", accuracy + "%"]
  ];
  for (const [label, val] of stats) {
    const d = el("div", null, "stat");
    d.appendChild(el("b", String(val)));
    d.appendChild(el("span", label));
    statRow.appendChild(d);
  }

  // Subject-wise (exam's own subject list)
  const subBox = document.getElementById("subjectResult");
  subBox.innerHTML = "";
  const table = document.createElement("table");
  table.className = "subject-table";
  const head = document.createElement("tr");
  for (const h of ["Subject", "Kul", "Sahi", "Galat", "Chhute hue", "Accuracy"]) head.appendChild(el("th", h));
  table.appendChild(head);
  for (const s of EXAMS[state.exam].subjects) {
    let tot = 0, ok = 0, wrong = 0, skip = 0;
    state.questions.forEach((q, i) => {
      if (q.subject !== s) return;
      tot++;
      if (state.answers[i] === null) skip++;
      else if (state.answers[i] === q.answer) ok++;
      else wrong++;
    });
    if (!tot) continue;
    const row = document.createElement("tr");
    for (const v of [s, tot, ok, wrong, skip, Math.round((ok / tot) * 100) + "%"]) row.appendChild(el("td", String(v)));
    table.appendChild(row);
  }
  subBox.appendChild(table);

  // Full review — unchanged logic
  const list = document.getElementById("reviewList");
  list.innerHTML = "";
  state.questions.forEach((q, i) => {
    const item = el("div", null, "review-item");
    const head = el("p", (i + 1) + ". " + q.q, "review-q");
    item.appendChild(head);
    item.appendChild(el("span", q.subject + " • " + (q.topic || ""), "chip chip-topic"));
    q.options.forEach((opt, oi) => {
      const row = el("div", LETTERS[oi] + ". " + opt, "review-opt" +
        (oi === q.answer ? " correct" : "") +
        (state.answers[i] === oi && oi !== q.answer ? " wrong" : ""));
      item.appendChild(row);
    });
    const mine = state.answers[i];
    const verdict = mine === null
      ? el("p", "Tumne jawab nahi diya. Sahi jawab: " + LETTERS[q.answer], "review-verdict skip")
      : mine === q.answer
        ? el("p", "Sahi jawab ✓", "review-verdict ok")
        : el("p", "Galat ✗ — tumhara jawab: " + LETTERS[mine] + " • Sahi jawab: " + LETTERS[q.answer], "review-verdict bad");
    item.appendChild(verdict);
    if (q.explanation) {
      const ex = el("p", "Explanation: " + q.explanation, "explain");
      item.appendChild(ex);
    }
    list.appendChild(item);
  });
}

function quitTest() {
  // A submitted test is already saved, so leaving it needs no warning;
  // only an in-progress test asks for confirmation.
  if (state && !state.done && !window.confirm("Test bina save kiye chhodna hai? Tumhara score save nahi hoga.")) return;
  stopTimer();
  state = null;
  showView("home");
}

/* ---------- bank loading + init ---------- */
function isValidQuestion(q, subjects) {
  return q && typeof q.q === "string" && q.q.trim().length > 0 &&
    Array.isArray(q.options) && q.options.length === 4 &&
    q.options.every((o) => typeof o === "string" && o.trim().length > 0) &&
    Number.isInteger(q.answer) && q.answer >= 0 && q.answer <= 3 &&
    subjects.indexOf(q.subject) !== -1 &&
    typeof q.explanation === "string";
}
async function loadBankFile(cfg) {
  const files = cfg.files || [cfg.file];
  let data = [];
  for (const f of files) {
    const res = await fetch(f);
    if (!res.ok) throw new Error("HTTP " + res.status + " (" + f + ")");
    const part = await res.json();
    if (!Array.isArray(part) || !part.length) throw new Error("empty question bank (" + f + ")");
    data = data.concat(part);
  }
  const valid = data.filter((q) => isValidQuestion(q, cfg.subjects));
  if (valid.length !== data.length) {
    console.warn(cfg.file + ": dropped " + (data.length - valid.length) + " invalid question(s)");
  }
  if (!valid.length) throw new Error("no valid questions");
  return valid;
}
function renderCounts(exam) {
  const cfg = EXAMS[exam];
  const bank = BANKS[exam] || [];
  for (const s of cfg.subjects) {
    const span = document.querySelector("[" + cfg.countAttr + '="' + s + '"]');
    if (span) span.textContent = bySubject(s, exam).length;
  }
  const line = document.getElementById(cfg.todayLineId);
  if (line && bank.length) {
    line.textContent = "Aaj: " + prettyDate(istTodayStr()) +
      " • Bank me kul " + bank.length + " questions";
  }
}
function disableTre40(message) {
  const tab = document.querySelector('[data-exam-switch="tre40"]');
  if (tab) { tab.disabled = true; tab.setAttribute("aria-pressed", "false"); }
  const home = document.getElementById("view-home-tre40");
  if (home) home.querySelectorAll("button").forEach((b) => { b.disabled = true; });
  const line = document.getElementById("tre40TodayLine");
  if (line) line.textContent = message;
}
async function init() {
  const results = await Promise.allSettled(
    [EXAMS.stet, EXAMS.tre40].map((cfg) => loadBankFile(cfg)));
  results.forEach((r, i) => {
    const key = i === 0 ? "stet" : "tre40";
    if (r.status === "fulfilled") { BANKS[key] = r.value; }
    else {
      BANK_ERRORS[key] = r.reason;
      console.error((EXAMS[key].files || [EXAMS[key].file]).join(", ") + " load failed:", r.reason);
    }
  });
  if (!BANKS.stet.length && !BANKS.tre40.length) {
    document.getElementById("todayLine").textContent =
      "questions.json load nahi hua. Is site ko local server se chalao (README dekho) — file:// se fetch block ho sakta hai.";
    const treLine = document.getElementById("tre40TodayLine");
    if (treLine) treLine.textContent =
      "TRE question bank load nahi hua. Is site ko local server se chalao (README dekho) — file:// se fetch block ho sakta hai.";
    return;
  }
  const today = istTodayStr();
  const stetPicker = document.getElementById("datePicker");
  if (stetPicker) stetPicker.value = today;
  const trePicker = document.getElementById("tre40DatePicker");
  if (trePicker) trePicker.value = today;

  // STET home controls — only if the STET bank loaded.
  if (BANKS.stet.length) {
    document.getElementById("btnStartDaily").addEventListener("click", () =>
      startTest(pickDaily(today, "stet"), "Aaj ka Daily Test", today, "stet"));
    document.getElementById("btnRandom").addEventListener("click", () =>
      startTest(pickRandom("stet"), "Random Test — 30 Questions", today, "stet"));
    document.getElementById("btnByDate").addEventListener("click", () => {
      const d = stetPicker.value || today;
      startTest(pickDaily(d, "stet"), "Practice Test — " + prettyDate(d), d, "stet");
    });
    document.querySelectorAll("[data-practice]").forEach((b) =>
      b.addEventListener("click", () => {
        const s = b.getAttribute("data-practice");
        startTest(pickSubject(s, today, "stet"), s + " Practice — 20 Questions", today, "stet");
      }));
  } else {
    document.getElementById("todayLine").textContent =
      "questions.json load nahi hua. Is site ko local server se chalao (README dekho) — file:// se fetch block ho sakta hai.";
  }

  // TRE home controls — only if the TRE bank loaded; otherwise the
  // TRE tab stays disabled and STET keeps working (see disableTre40).
  if (BANKS.tre40.length) {
    const treTab = document.querySelector('[data-exam-switch="tre40"]');
    if (treTab) treTab.disabled = false;
    document.getElementById("btnTre40StartDaily").addEventListener("click", () =>
      startTest(pickDaily(today, "tre40"), "Aaj ka Daily Test", today, "tre40"));
    document.getElementById("btnTre40Random").addEventListener("click", () =>
      startTest(pickRandom("tre40"), "Random Test — 30 Questions", today, "tre40"));
    document.getElementById("btnTre40ByDate").addEventListener("click", () => {
      const d = trePicker.value || today;
      startTest(pickDaily(d, "tre40"), "Practice Test — " + prettyDate(d), d, "tre40");
    });
    document.querySelectorAll("[data-practice-tre40]").forEach((b) =>
      b.addEventListener("click", () => {
        const s = b.getAttribute("data-practice-tre40");
        startTest(pickSubject(s, today, "tre40"), s + " Practice — 20 Questions", today, "tre40");
      }));
  } else {
    disableTre40("TRE 4.0 questions abhi load nahi hue. STET test upar se chalu kar sakte ho — TRE section jald wapas aayega.");
  }

  // Exam switcher (shared; a disabled TRE tab cannot be clicked).
  document.querySelectorAll("[data-exam-switch]").forEach((b) =>
    b.addEventListener("click", () => {
      const exam = b.getAttribute("data-exam-switch");
      // ADAPTATION: confirm away an in-progress test even when the
      // already-selected tab is clicked, so the timer is never left
      // running behind the home view.
      if (state) { quitTest(); if (state) return; }
      if (exam === CURRENT_EXAM) { showView("home"); return; }
      setExam(exam);
      showView("home");
    }));

  // Top nav — exam-aware: Daily starts the CURRENT exam's daily test;
  // Subject Practice scrolls to the CURRENT exam's subject cards.
  document.querySelectorAll("[data-nav]").forEach((b) =>
    b.addEventListener("click", () => {
      const nav = b.getAttribute("data-nav");
      if (state) { quitTest(); if (state) return; }
      if (nav === "daily") {
        const d = istTodayStr();
        startTest(pickDaily(d, CURRENT_EXAM), "Aaj ka Daily Test", d, CURRENT_EXAM);
        return;
      }
      showView("home");
      if (nav === "practice") {
        const cards = document.getElementById(EXAMS[CURRENT_EXAM].subjectCardsId);
        if (cards) cards.scrollIntoView({ behavior: "smooth" });
      }
    }));
  document.getElementById("brandHome").addEventListener("click", (e) => {
    e.preventDefault();
    if (state) { quitTest(); return; }
    showView("home");
  });

  // Shared quiz controls — bodies unchanged from the original code.
  document.getElementById("btnPrev").addEventListener("click", () => {
    if (!state || state.current <= 0) return;
    state.current--; renderQuestion(); renderPalette();
  });
  document.getElementById("btnNext").addEventListener("click", () => {
    if (!state || state.done) return;
    if (state.current === state.questions.length - 1) { submitTest(false); return; }
    state.current++; renderQuestion(); renderPalette();
  });
  document.getElementById("btnMark").addEventListener("click", () => {
    if (!state) return;
    if (state.marked.has(state.current)) state.marked.delete(state.current);
    else state.marked.add(state.current);
    renderQuestion(); renderPalette();
  });
  document.getElementById("btnClear").addEventListener("click", () => {
    if (!state) return;
    state.answers[state.current] = null;
    renderQuestion(); renderPalette();
  });
  document.getElementById("btnSubmit").addEventListener("click", () => submitTest(false));
  document.getElementById("btnQuit").addEventListener("click", quitTest);
  document.getElementById("btnRetry").addEventListener("click", () => {
    if (!state) return;
    startTest(state.questions, state.label, state.dateStr, state.exam);
  });
  document.getElementById("btnNewRandom").addEventListener("click", () =>
    startTest(pickRandom(CURRENT_EXAM), "Random Test — 30 Questions", istTodayStr(), CURRENT_EXAM));
  document.getElementById("btnHome").addEventListener("click", () => { stopTimer(); state = null; showView("home"); });

  // Restore last-selected exam (only if that bank loaded; else STET).
  let saved = null;
  try { saved = localStorage.getItem(EXAM_CHOICE_KEY); } catch (e) { saved = null; }
  const initial = (saved === "tre40" && BANKS.tre40.length) ? "tre40"
    : (BANKS.stet.length ? "stet" : "tre40");
  setExam(initial);
  renderCounts("stet");
  renderCounts("tre40");
  renderHistory("stet");
  renderHistory("tre40");
}

document.addEventListener("DOMContentLoaded", init);
