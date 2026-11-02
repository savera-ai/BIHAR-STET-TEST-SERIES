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
   result screen. Scores are kept in localStorage only. */

const EPOCH_DAY = dayNumber("2026-01-01");
const HISTORY_KEY = "stetQuizHistory";
const SUBJECTS = ["Inorganic", "Organic", "Physical"];
const LETTERS = ["A", "B", "C", "D"];

let BANK = [];
let state = null; // {questions, answers, marked:Set, current, label, dateStr, secondsLeft, timerId, startedAt}

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
function bySubject(subject) {
  return BANK.filter((q) => q.subject === subject);
}
function rotate(list, start, count) {
  if (!list.length) return [];
  const out = [];
  for (let i = 0; i < count; i++) out.push(list[(start + i) % list.length]);
  return out;
}
function pickDaily(dateStr) {
  const dayIndex = dayNumber(dateStr) - EPOCH_DAY;
  const out = [];
  for (const s of SUBJECTS) {
    const list = bySubject(s);
    if (!list.length) continue;
    // Sliding window: 10 per day, stepping 10 each day, wrapping mod size.
    // count is capped so a bank smaller than 10 never repeats a question
    // inside one day's set.
    const count = Math.min(10, list.length);
    const start = (((dayIndex * count) % list.length) + list.length) % list.length;
    out.push(...rotate(list, start, count));
  }
  return out;
}
function pickSubject(subject, dateStr) {
  const list = bySubject(subject);
  const dayIndex = dayNumber(dateStr) - EPOCH_DAY;
  const start = ((dayIndex * 20) % list.length + list.length) % list.length;
  return rotate(list, start, Math.min(20, list.length));
}
function shuffled(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function pickRandom() {
  const out = [];
  for (const s of SUBJECTS) out.push(...shuffled(bySubject(s)).slice(0, 10));
  return shuffled(out);
}

/* ---------- views ---------- */
function showView(name) {
  for (const v of ["home", "quiz", "result"]) {
    const sec = document.getElementById("view-" + v);
    if (sec) sec.hidden = v !== name;
  }
  window.scrollTo({ top: 0 });
}

/* ---------- history (localStorage only) ---------- */
function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); }
  catch (e) { return []; }
}
function saveHistory(entry) {
  const h = loadHistory();
  h.unshift(entry);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(0, 20)));
}
function renderHistory() {
  const h = loadHistory();
  const line = document.getElementById("lastScoreLine");
  const list = document.getElementById("historyList");
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
function startTest(questions, label, dateStr) {
  if (!questions.length) return;
  stopTimer();
  state = {
    questions,
    answers: new Array(questions.length).fill(null),
    marked: new Set(),
    current: 0,
    label,
    dateStr,
    totalSeconds: questions.length * 90,
    secondsLeft: questions.length * 90,
    startedAt: Date.now(),
    timerId: null,
    done: false
  };
  document.getElementById("quizTitle").textContent = label;
  // Describe only the subjects actually in this set: a subject-practice
  // test is not a three-subject mix.
  const present = SUBJECTS.filter((s) => questions.some((q) => q.subject === s));
  document.getElementById("quizMeta").textContent =
    questions.length + " questions • " + present.join(", ") +
    " • Jawab ant me milega";
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
function submitTest(auto) {
  // Guard against a second submit (e.g. timer firing together with a
  // manual submit, or a double click): the first submit already saved
  // the score and marked the test done.
  if (!state || state.done) return;
  const unanswered = state.answers.filter((a) => a === null).length;
  if (!auto && unanswered > 0) {
    if (!window.confirm(unanswered + " question(s) ke jawab nahi diye gaye hain. Phir bhi submit karna hai?")) return;
  }
  state.done = true;
  stopTimer();
  const timeTaken = Math.round((Date.now() - state.startedAt) / 1000);
  let score = 0;
  state.questions.forEach((q, i) => { if (state.answers[i] === q.answer) score += 1; });
  saveHistory({
    dateStr: state.dateStr, label: state.label,
    score, total: state.questions.length, timeSec: timeTaken
  });
  renderResult(score, timeTaken);
  showView("result");
  renderHistory();
}
function renderResult(score, timeTaken) {
  const total = state.questions.length;
  const accuracy = Math.round((score / total) * 100);
  document.getElementById("resultScore").textContent = score + " / " + total;
  document.getElementById("resultSummary").textContent =
    state.label + " • Accuracy: " + accuracy + "% • Time taken: " +
    Math.floor(timeTaken / 60) + " min " + (timeTaken % 60) + " sec";
  const statRow = document.getElementById("statRow");
  statRow.innerHTML = "";
  const stats = [
    ["Sahi", score], ["Galat", state.questions.filter((q, i) =>
      state.answers[i] !== null && state.answers[i] !== q.answer).length],
    ["Chhute hue", state.answers.filter((a) => a === null).length],
    ["Accuracy", accuracy + "%"]
  ];
  for (const [label, val] of stats) {
    const d = el("div", null, "stat");
    d.appendChild(el("b", String(val)));
    d.appendChild(el("span", label));
    statRow.appendChild(d);
  }

  // Subject-wise
  const subBox = document.getElementById("subjectResult");
  subBox.innerHTML = "";
  const table = document.createElement("table");
  table.className = "subject-table";
  const head = document.createElement("tr");
  for (const h of ["Subject", "Kul", "Sahi", "Galat", "Chhute hue", "Accuracy"]) head.appendChild(el("th", h));
  table.appendChild(head);
  for (const s of SUBJECTS) {
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

  // Full review
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

/* ---------- init ---------- */
async function init() {
  try {
    const res = await fetch("questions.json");
    if (!res.ok) throw new Error("HTTP " + res.status);
    BANK = await res.json();
    if (!Array.isArray(BANK) || !BANK.length) throw new Error("empty question bank");
  } catch (e) {
    document.getElementById("todayLine").textContent =
      "questions.json load nahi hua. Is site ko local server se chalao (README dekho) — file:// se fetch block ho sakta hai.";
    return;
  }
  const today = istTodayStr();
  document.getElementById("todayLine").textContent =
    "Aaj: " + prettyDate(today) + " • Bank me kul " + BANK.length + " questions";
  for (const s of SUBJECTS) {
    const span = document.querySelector('[data-count="' + s + '"]');
    if (span) span.textContent = bySubject(s).length;
  }
  const picker = document.getElementById("datePicker");
  picker.value = today;

  document.getElementById("btnStartDaily").addEventListener("click", () =>
    startTest(pickDaily(today), "Aaj ka Daily Test", today));
  document.getElementById("btnRandom").addEventListener("click", () =>
    startTest(pickRandom(), "Random Test — 30 Questions", today));
  document.getElementById("btnByDate").addEventListener("click", () => {
    const d = picker.value || today;
    startTest(pickDaily(d), "Practice Test — " + prettyDate(d), d);
  });
  document.querySelectorAll("[data-practice]").forEach((b) =>
    b.addEventListener("click", () => {
      const s = b.getAttribute("data-practice");
      startTest(pickSubject(s, today), s + " Practice — 20 Questions", today);
    }));
  document.querySelectorAll("[data-nav]").forEach((b) =>
    b.addEventListener("click", () => {
      const nav = b.getAttribute("data-nav");
      // An in-progress test must be confirmed away first (quitTest
      // leaves state set if the user cancels); a submitted test is
      // already saved and clears without a warning.
      if (state) { quitTest(); if (state) return; }
      // "Daily Test" in the top nav starts today's daily test directly:
      // that is what the label promises, and merely showing home would
      // leave the user to hunt for the hero CTA. "Home" and "Subject
      // Practice" still go home (practice scrolls to the subject cards).
      if (nav === "daily") {
        const today = istTodayStr();
        startTest(pickDaily(today), "Aaj ka Daily Test", today);
        return;
      }
      showView("home");
      if (nav === "practice") {
        document.getElementById("subjectCards").scrollIntoView({ behavior: "smooth" });
      }
    }));
  document.getElementById("brandHome").addEventListener("click", (e) => {
    e.preventDefault();
    if (state) { quitTest(); return; }
    showView("home");
  });
  document.getElementById("btnPrev").addEventListener("click", () => {
    if (!state || state.current <= 0) return;
    state.current--; renderQuestion(); renderPalette();
  });
  document.getElementById("btnNext").addEventListener("click", () => {
    if (!state || state.done) return;
    // Last question: submit (with the unanswered confirm), matching
    // the "Submit Karo" label. Otherwise advance to the next question.
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
    startTest(state.questions, state.label, state.dateStr);
  });
  document.getElementById("btnNewRandom").addEventListener("click", () =>
    startTest(pickRandom(), "Random Test — 30 Questions", istTodayStr()));
  document.getElementById("btnHome").addEventListener("click", () => { stopTimer(); state = null; showView("home"); });

  renderHistory();
}
document.addEventListener("DOMContentLoaded", init);
