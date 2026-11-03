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
   BPSC confirms the final pattern. See INTEGRATION.md.
   Saving rule (stated in the quiz view): an answer is saved as soon
   as it is selected. Moving to another question never loses a
   selected answer. */

const EPOCH_DAY = dayNumber("2026-01-01");
const LETTERS = ["A", "B", "C", "D"];
const EXAM_CHOICE_KEY = "examSwitcherChoice"; // UI preference only, never scores
const LOAD_TIMEOUT_MS = 8000;

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
    markingNote: "Negative marking — still to be verified from the BPSC final notification."
  }
};

let BANKS = { stet: [], tre40: [] };
let BANKS_BY_SUBJECT = { stet: {}, tre40: {} };
let BANK_ERRORS = { stet: null, tre40: null };
let BANK_STATE = {
  stet: { loading: false, failed: false, attempted: false, promise: null },
  tre40: { loading: false, failed: false, attempted: false, promise: null }
};
let CURRENT_EXAM = "stet";
// state: {questions, answers, marked:Set, visited:Set, current, label,
//         dateStr, exam, totalSeconds, secondsLeft, timerId, startedAt,
//         done, timerEl, timerBox, optionButtons, palButtons,
//         currentFilter, lastResult, lastNoticeIndex}
let state = null;
let pendingQuitAction = null;
let firstShowView = true;

/* Hoisted formatters: constructing Intl.DateTimeFormat on every call
   is wasteful when renderHistory formats several dates at once. */
const IST_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit"
});
const PRETTY = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata", weekday: "long", day: "numeric", month: "long", year: "numeric"
});

function dayNumber(dateStr) {
  return Math.floor(Date.parse(dateStr + "T00:00:00Z") / 86400000);
}
function istTodayStr() {
  return IST_DAY.format(new Date());
}
function prettyDate(dateStr) {
  return PRETTY.format(new Date(dateStr + "T00:00:00Z"));
}
function el(tag, text, cls) {
  const n = document.createElement(tag);
  if (text !== undefined && text !== null) n.textContent = text;
  if (cls) n.className = cls;
  return n;
}
function prefersReducedMotion() {
  return typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
function scrollToElement(node) {
  if (!node) return;
  node.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
}

/* ---------- announcements (polite, throttled, never timer ticks) ---------- */
let lastAnnounce = { msg: "", at: 0 };
function announce(msg) {
  if (!msg) return;
  const now = Date.now();
  if (msg === lastAnnounce.msg && now - lastAnnounce.at < 1000) return;
  lastAnnounce = { msg, at: now };
  const region = document.getElementById("statusAnnounce");
  if (region) { region.textContent = ""; region.textContent = msg; }
}
function announceTimer(msg) {
  const region = document.getElementById("timerAnnounce");
  if (region) { region.textContent = ""; region.textContent = msg; }
}

function groupBank(exam, bank) {
  const grouped = {};
  for (const s of EXAMS[exam].subjects) grouped[s] = [];
  for (const q of bank) {
    if (grouped[q.subject]) grouped[q.subject].push(q);
  }
  return grouped;
}
function bySubject(subject, exam) {
  const ex = exam || CURRENT_EXAM;
  const grouped = BANKS_BY_SUBJECT[ex];
  if (grouped && grouped[subject]) return grouped[subject];
  const bank = BANKS[ex] || [];
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
function showView(name, opts) {
  const focusView = !opts || opts.focus !== false;
  const target = name === "home" ? homeViewFor(CURRENT_EXAM) : name;
  for (const v of ["home", "home-tre40", "quiz", "result"]) {
    const sec = document.getElementById("view-" + v);
    if (sec) sec.hidden = v !== target;
  }
  document.body.classList.toggle("in-quiz", target === "quiz");
  closePaletteSheet();
  window.scrollTo({ top: 0 });
  // The very first home render (initial load) must not steal focus;
  // every later view switch — including a quiz started while banks
  // are still loading — moves focus to the new view's heading.
  if (focusView && (!firstShowView || name !== "home")) {
    const sec = document.getElementById("view-" + target);
    const heading = sec ? sec.querySelector("h1") : null;
    if (heading) heading.focus({ preventScroll: true });
  }
  firstShowView = false;
}
/* setExam is the ONLY place that touches body[data-exam], title,
   theme-color, switcher state, brand text, or examSwitcherChoice. */
function setExam(exam, opts) {
  if (!EXAMS[exam]) return;
  CURRENT_EXAM = exam;
  document.body.dataset.exam = exam;
  document.title = EXAMS[exam].title;
  const theme = document.querySelector('meta[name="theme-color"]');
  if (theme) theme.content = EXAMS[exam].themeColor;
  document.querySelectorAll("[data-exam-switch]").forEach((b) => {
    const on = b.getAttribute("data-exam-switch") === exam;
    b.classList.toggle("active", on);
    b.setAttribute("aria-selected", on ? "true" : "false");
    b.removeAttribute("aria-pressed");
    if (!b.disabled) b.tabIndex = on ? 0 : -1;
  });
  const mark = document.getElementById("brandMark");
  if (mark) mark.textContent = EXAMS[exam].mark;
  const title = document.getElementById("brandTitle");
  if (title) title.textContent = EXAMS[exam].brandTitle;
  const sub = document.getElementById("brandSub");
  if (sub) sub.textContent = EXAMS[exam].brandSub;
  try { localStorage.setItem(EXAM_CHOICE_KEY, exam); } catch (e) { /* private mode: ignore */ }
  renderExamCards();
  if (!opts || opts.render !== false) {
    renderCounts(exam);
    renderHistory(exam);
  }
}
function renderExamCards() {
  document.querySelectorAll("[data-exam-goto]").forEach((b) => {
    const exam = b.getAttribute("data-exam-goto");
    const st = BANK_STATE[exam];
    if (exam === CURRENT_EXAM) {
      b.textContent = "Current Exam";
      b.disabled = true;
    } else if (st.failed) {
      b.textContent = exam === "tre40" ? "TRE 4.0 Unavailable" : "STET Unavailable";
      b.disabled = true;
    } else if (st.loading || (!BANKS[exam].length && exam === "tre40" && !st.attempted)) {
      b.textContent = exam === "tre40" ? "Load TRE 4.0 Tests" : "Loading…";
      b.disabled = false;
    } else {
      b.textContent = exam === "tre40" ? "View TRE 4.0 Tests" : "View STET Tests";
      b.disabled = false;
    }
  });
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
  try { localStorage.setItem(EXAMS[ex].historyKey, JSON.stringify(h.slice(0, 20))); }
  catch (e) { /* private mode: ignore */ }
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
    line.textContent = "No test has been completed on this device yet.";
    return;
  }
  const last = h[0];
  line.textContent = "Previous score: " + last.score + " / " + last.total +
    " (" + last.label + ", " + prettyDate(last.dateStr) + ")";
  for (const e of h.slice(0, 7)) {
    const li = el("li", prettyDate(e.dateStr) + " — " + e.label + ": " +
      e.score + "/" + e.total + " (" + Math.round((e.score / e.total) * 100) + "%)");
    list.appendChild(li);
  }
}

/* ---------- bank loading: STET eager, TRE deferred, 8s timeout ---------- */
function renderCounts(exam) {
  const cfg = EXAMS[exam];
  const bank = BANKS[exam] || [];
  for (const s of cfg.subjects) {
    const span = document.querySelector("[" + cfg.countAttr + '="' + s + '"]');
    if (span) span.textContent = bySubject(s, exam).length;
  }
  const line = document.getElementById(cfg.todayLineId);
  if (line && bank.length) {
    line.textContent = "Today: " + prettyDate(istTodayStr()) +
      " • Total in bank: " + bank.length + " questions";
  }
}
function showLoadNotice(msg) {
  const notice = document.getElementById("loadNotice");
  const text = document.getElementById("loadNoticeText");
  if (!notice || !text) return;
  text.textContent = msg;
  notice.hidden = false;
}
function hideLoadNotice() {
  const notice = document.getElementById("loadNotice");
  if (notice) notice.hidden = true;
}
function refreshLoadNotice() {
  const failed = ["stet", "tre40"].filter((k) => BANK_STATE[k].failed);
  if (!failed.length) { hideLoadNotice(); return; }
  const names = failed.map((k) => k === "stet" ? "STET" : "TRE 4.0").join(" and ");
  showLoadNotice("The " + names + " question bank could not be loaded. " +
    (BANK_STATE.stet.failed && !BANK_STATE.tre40.failed
      ? "TRE 4.0 tests still work."
      : BANK_STATE.tre40.failed && !BANK_STATE.stet.failed
        ? "STET tests still work."
        : "Please check your connection and retry."));
}
async function fetchWithTimeout(url) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), LOAD_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    if (!res.ok) throw new Error("HTTP " + res.status + " (" + url + ")");
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}
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
  // Fetch parts in parallel; keep every part that loads, and fail only
  // if no part loads at all — one failed TRE file must not discard
  // the questions from the file that did load.
  const results = await Promise.allSettled(files.map((f) => fetchWithTimeout(f)));
  let data = [];
  let lastError = null;
  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      const part = r.value;
      if (Array.isArray(part) && part.length) data = data.concat(part);
      else lastError = new Error("empty question bank (" + files[i] + ")");
    } else {
      lastError = r.reason;
    }
  });
  if (!data.length) throw lastError || new Error("no valid questions");
  const valid = data.filter((q) => isValidQuestion(q, cfg.subjects));
  if (valid.length !== data.length) {
    console.warn((cfg.file || cfg.files.join(", ")) + ": dropped " + (data.length - valid.length) + " invalid question(s)");
  }
  if (!valid.length) throw new Error("no valid questions");
  return valid;
}
function loadBankForExam(exam) {
  const st = BANK_STATE[exam];
  if (BANKS[exam].length) return Promise.resolve(true);
  if (st.promise) return st.promise;
  st.attempted = true;
  st.loading = true;
  st.failed = false;
  BANK_ERRORS[exam] = null;
  renderExamCards();
  st.promise = loadBankFile(EXAMS[exam]).then((bank) => {
    BANKS[exam] = bank;
    BANKS_BY_SUBJECT[exam] = groupBank(exam, bank);
    st.loading = false;
    st.failed = false;
    const errEl = document.getElementById(exam === "stet" ? "stetLoadError" : "tre40LoadError");
    if (errEl) errEl.hidden = true;
    if (exam === "tre40") enableTre40Home();
    renderCounts(exam);
    renderHistory(exam);
    renderExamCards();
    refreshLoadNotice();
    return true;
  }).catch((reason) => {
    BANK_ERRORS[exam] = reason;
    console.error((EXAMS[exam].files || [EXAMS[exam].file]).join(", ") + " load failed:", reason);
    st.loading = false;
    st.failed = true;
    st.promise = null;
    if (exam === "tre40") disableTre40("The TRE 4.0 questions have not loaded yet. You can start a STET test — the TRE section will be back soon.");
    else {
      const line = document.getElementById("todayLine");
      if (line) line.textContent = "questions.json could not be loaded. Run this site from a local server (see README) — fetch may be blocked from file://.";
      const errEl = document.getElementById("stetLoadError");
      if (errEl) errEl.hidden = false;
    }
    renderExamCards();
    refreshLoadNotice();
    return false;
  });
  return st.promise;
}
function ensureTre40Loaded() {
  if (BANKS.tre40.length) return Promise.resolve(true);
  if (BANK_STATE.tre40.failed) return Promise.resolve(false);
  const line = document.getElementById("tre40TodayLine");
  if (line) line.textContent = "Loading TRE 4.0 questions…";
  announce("Loading TRE 4.0 questions.");
  return loadBankForExam("tre40");
}
function reloadBank(exam) {
  const st = BANK_STATE[exam];
  st.failed = false;
  st.promise = null;
  BANK_ERRORS[exam] = null;
  const tab = document.querySelector('[data-exam-switch="tre40"]');
  if (exam === "tre40" && tab) tab.disabled = false;
  announce("Retrying. Loading " + (exam === "tre40" ? "TRE 4.0" : "STET") + " questions.");
  return loadBankForExam(exam).then((ok) => {
    announce(ok
      ? (exam === "tre40" ? "TRE 4.0" : "STET") + " questions loaded."
      : (exam === "tre40" ? "TRE 4.0" : "STET") + " questions still could not be loaded.");
    return ok;
  });
}
function disableTre40(message) {
  const tab = document.querySelector('[data-exam-switch="tre40"]');
  if (tab) {
    tab.disabled = true;
    tab.setAttribute("aria-selected", "false");
    tab.tabIndex = -1;
  }
  const home = document.getElementById("view-home-tre40");
  if (home) home.querySelectorAll("button").forEach((b) => {
    if (b.id !== "btnRetryTre40") b.disabled = true;
  });
  const line = document.getElementById("tre40TodayLine");
  if (line) line.textContent = message;
  const errEl = document.getElementById("tre40LoadError");
  if (errEl) errEl.hidden = false;
  renderExamCards();
}

/* Run fn once the named bank is ready; for TRE this triggers the
   deferred load and runs fn after it succeeds. Returns true if fn
   ran immediately, false if loading (or a failed load) intervened. */
function withBank(exam, fn) {
  if (BANKS[exam].length) { fn(); return true; }
  if (exam === "tre40") {
    if (BANK_STATE.tre40.failed) {
      announce("The TRE 4.0 question bank could not be loaded. STET tests still work.");
      return false;
    }
    announce("Loading TRE 4.0 questions. Your test will start when they have loaded.");
    ensureTre40Loaded().then((ok) => {
      if (ok) fn();
      else announce("The TRE 4.0 question bank could not be loaded. STET tests still work.");
    });
    return false;
  }
  if (BANK_STATE.stet.loading) {
    announce("Questions are still loading. Please wait a moment, then try again.");
  } else if (BANK_STATE.stet.failed) {
    announce("The STET question bank could not be loaded. Please retry loading.");
  } else {
    announce("Questions are still loading. Please wait a moment, then try again.");
  }
  const line = document.getElementById("todayLine");
  if (line && !BANKS.stet.length) line.textContent = "Loading questions…";
  return false;
}

/* ---------- confirmation dialogs (replace window.confirm) ---------- */
let dialogInvoker = null;
let dialogKeyHandler = null;
function dialogFocusables(backdrop) {
  return Array.from(backdrop.querySelectorAll("button:not([disabled])"));
}
function openDialog(backdropId) {
  const backdrop = document.getElementById(backdropId);
  if (!backdrop) return;
  dialogInvoker = document.activeElement;
  backdrop.hidden = false;
  const primary = backdrop.querySelector(".btn-primary");
  const focusables = dialogFocusables(backdrop);
  if (primary) primary.focus();
  else if (focusables[0]) focusables[0].focus();
  dialogKeyHandler = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      const primary = backdrop.querySelector(".btn-primary");
      if (primary) primary.click();
      return;
    }
    if (e.key !== "Tab") return;
    const items = dialogFocusables(backdrop);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault(); first.focus();
    }
  };
  backdrop.addEventListener("keydown", dialogKeyHandler);
}
function closeDialog(backdropId, restoreFocus) {
  const backdrop = document.getElementById(backdropId);
  if (!backdrop) return;
  if (dialogKeyHandler) backdrop.removeEventListener("keydown", dialogKeyHandler);
  dialogKeyHandler = null;
  backdrop.hidden = true;
  if (restoreFocus !== false && dialogInvoker && document.contains(dialogInvoker)) {
    dialogInvoker.focus();
  }
  dialogInvoker = null;
}
function openSubmitDialog() {
  if (!state) return;
  const total = state.questions.length;
  const answered = state.answers.filter((a) => a !== null).length;
  const unansweredIdx = state.answers.map((a, i) => (a === null ? i : -1)).filter((i) => i >= 0);
  const markedIdx = Array.from(state.marked).sort((a, b) => a - b);
  const desc = document.getElementById("submitDialogDesc");
  if (desc) {
    desc.textContent = "Answered " + answered + " of " + total +
      " · Not answered " + unansweredIdx.length +
      " · Marked for review " + markedIdx.length + ". " +
      "You can go back and review, or submit now. Submitted answers cannot be changed.";
  }
  const jump = document.getElementById("submitDialogJump");
  if (jump) {
    jump.innerHTML = "";
    const addGroup = (label, idxs) => {
      if (!idxs.length) return;
      const lab = el("p", label, "dialog-jump-label");
      jump.appendChild(lab);
      for (const i of idxs) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "jump-btn";
        b.textContent = String(i + 1);
        b.setAttribute("aria-label", "Go to question " + (i + 1));
        b.dataset.qIndex = String(i);
        jump.appendChild(b);
      }
    };
    addGroup("Not answered:", unansweredIdx);
    addGroup("Marked for review:", markedIdx);
  }
  openDialog("submitDialogBackdrop");
}
function openQuitDialog(pendingAction) {
  pendingQuitAction = pendingAction || null;
  openDialog("quitDialogBackdrop");
}
function doQuit() {
  stopTimer();
  state = null;
  closePaletteSheet();
  const action = pendingQuitAction;
  pendingQuitAction = null;
  if (action) action();
  else showView("home");
}
/* Returns true when a quit confirmation is now pending (caller must
   wait); false when there is no in-progress test to quit. */
function requestQuitThen(action) {
  if (state && !state.done) {
    openQuitDialog(action);
    return true;
  }
  return false;
}

/* ---------- quiz flow ---------- */
function startTest(questions, label, dateStr, exam) {
  if (!questions.length) return;
  const ex = exam || CURRENT_EXAM;
  stopTimer();
  closePaletteSheet();
  state = {
    questions,
    answers: new Array(questions.length).fill(null),
    marked: new Set(),
    visited: new Set([0]),
    current: 0,
    label,
    dateStr,
    exam: ex,
    totalSeconds: questions.length * 90,
    secondsLeft: questions.length * 90,
    startedAt: Date.now(),
    timerId: null,
    done: false,
    timerEl: null,
    timerBox: null,
    optionButtons: [],
    palButtons: [],
    currentFilter: "all",
    lastResult: null,
    lastNoticeIndex: -1
  };
  CURRENT_EXAM = ex;
  document.body.dataset.exam = ex;
  document.getElementById("quizTitle").textContent = label;
  const present = EXAMS[ex].subjects.filter((s) => questions.some((q) => q.subject === s));
  let meta = questions.length + " questions • " + present.join(", ") +
    " • Answers at the end";
  if (EXAMS[ex].markingNote) meta += " • " + EXAMS[ex].markingNote;
  document.getElementById("quizMeta").textContent = meta;
  const chip = document.getElementById("quizExam");
  if (chip) {
    chip.textContent = EXAMS[ex].short;
    chip.style.display = "";
  }
  const layout = document.getElementById("quizLayout");
  if (layout) layout.classList.remove("palette-collapsed");
  const collapseBtn = document.getElementById("btnPaletteCollapse");
  if (collapseBtn) {
    collapseBtn.textContent = "Hide palette";
    collapseBtn.setAttribute("aria-expanded", "true");
  }
  buildOptionButtons();
  buildPaletteButtons();
  showView("quiz");
  renderQuestion();
  renderPalette();
  updateProgress();
  startTimer();
  announce(label + " started. " + questions.length + " questions, " +
    fmtTime(state.secondsLeft) + " remaining. Answers are saved as soon as you select them.");
}

function stopTimer() {
  if (state && state.timerId) {
    clearInterval(state.timerId);
    state.timerId = null;
  }
}
function startTimer() {
  if (!state) return;
  state.timerEl = document.getElementById("timer");
  state.timerBox = document.querySelector(".timer-box");
  updateTimer();
  state.timerId = setInterval(() => {
    state.secondsLeft -= 1;
    if (state.secondsLeft <= 0) {
      state.secondsLeft = 0;
      updateTimer();
      announceTimer("Time is up. Your test has been submitted.");
      doSubmit();
      return;
    }
    updateTimer();
  }, 1000);
}
function fmtTime(sec) {
  const m = Math.floor(sec / 60), s = sec % 60;
  return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
}
function fmtDuration(sec) {
  const m = Math.floor(sec / 60), s = sec % 60;
  if (m === 0) return s + " sec";
  return m + " min " + s + " sec";
}
function updateTimer() {
  if (!state) return;
  const t = state.timerEl || document.getElementById("timer");
  if (t) t.textContent = fmtTime(state.secondsLeft);
  const box = state.timerBox || document.querySelector(".timer-box");
  const low = state.secondsLeft <= 300;
  if (box) box.classList.toggle("low", low);
  const label = document.getElementById("timerLabel");
  if (label) {
    label.textContent = low && state.secondsLeft > 0
      ? "Time remaining — less than 5 minutes"
      : "Time remaining";
  }
  // Threshold announcements only — never every tick.
  if (state.secondsLeft === 300) announceTimer("5 minutes remaining.");
  if (state.secondsLeft === 60) announceTimer("1 minute remaining.");
}

/* Options and palette are built ONCE per test; afterwards only
   classes, text and aria state are updated in place, so focus is
   never destroyed by answering or navigating. */
function buildOptionButtons() {
  const box = document.getElementById("options");
  box.innerHTML = "";
  state.optionButtons = [];
  for (let i = 0; i < 4; i++) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "option";
    btn.dataset.index = String(i);
    btn.setAttribute("aria-pressed", "false");
    btn.appendChild(el("span", LETTERS[i], "option-letter"));
    btn.appendChild(el("span", "", "option-text"));
    const check = el("span", "✓", "option-check");
    check.setAttribute("aria-hidden", "true");
    check.hidden = true;
    btn.appendChild(check);
    box.appendChild(btn);
    state.optionButtons.push(btn);
  }
}
function updateOptions() {
  if (!state) return;
  const q = state.questions[state.current];
  state.optionButtons.forEach((btn, i) => {
    const selected = state.answers[state.current] === i;
    btn.classList.toggle("selected", selected);
    btn.setAttribute("aria-pressed", selected ? "true" : "false");
    const textSpan = btn.querySelector(".option-text");
    if (textSpan) textSpan.textContent = q.options[i];
    const check = btn.querySelector(".option-check");
    if (check) check.hidden = !selected;
  });
}
function selectOption(i) {
  if (!state || state.done) return;
  state.answers[state.current] = i;
  updateOptions();
  renderPalette();
  updateProgress();
  const answered = state.answers.filter((a) => a !== null).length;
  announce("Option " + LETTERS[i] + " selected and saved for question " +
    (state.current + 1) + ". " + answered + " of " + state.questions.length + " answered.");
}
function buildPaletteButtons() {
  const pal = document.getElementById("palette");
  pal.innerHTML = "";
  state.palButtons = [];
  state.questions.forEach((_, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "pal-btn";
    b.dataset.index = String(i);
    b.appendChild(el("span", String(i + 1), "pal-num"));
    const st = el("span", "", "pal-state");
    st.setAttribute("aria-hidden", "true");
    b.appendChild(st);
    pal.appendChild(b);
    state.palButtons.push(b);
  });
}
function paletteState(i) {
  const answered = state.answers[i] !== null;
  const marked = state.marked.has(i);
  if (answered && marked) return "answered-and-marked";
  if (answered) return "answered";
  if (marked) return "marked";
  if (state.visited.has(i)) return "visited";
  return "not-visited";
}
function renderPalette() {
  if (!state) return;
  state.palButtons.forEach((b, i) => {
    const st = paletteState(i);
    b.classList.toggle("current", i === state.current);
    b.classList.toggle("answered", state.answers[i] !== null);
    b.classList.toggle("marked", state.marked.has(i));
    b.classList.toggle("visited", state.visited.has(i));
    const glyph = st === "answered-and-marked" ? "✓★"
      : st === "answered" ? "✓"
      : st === "marked" ? "★"
      : st === "visited" ? "•" : "";
    const stateSpan = b.querySelector(".pal-state");
    if (stateSpan) stateSpan.textContent = glyph;
    const parts = ["Question " + (i + 1)];
    if (i === state.current) parts.push("current question");
    if (state.answers[i] !== null) parts.push("answered");
    if (state.marked.has(i)) parts.push("marked for review");
    if (state.answers[i] === null && !state.marked.has(i)) {
      parts.push(state.visited.has(i) ? "visited, not answered" : "not visited");
    }
    b.setAttribute("aria-label", parts.join(", "));
    if (i === state.current) b.setAttribute("aria-current", "true");
    else b.removeAttribute("aria-current");
  });
  const answered = state.answers.filter((a) => a !== null).length;
  const summary = document.getElementById("paletteSummary");
  if (summary) {
    summary.textContent =
      "Answered: " + answered + " • Unanswered: " + (state.questions.length - answered) +
      " • Marked: " + state.marked.size;
  }
}
function updateProgress() {
  if (!state) return;
  const total = state.questions.length;
  const answered = state.answers.filter((a) => a !== null).length;
  const counts = document.getElementById("progressCounts");
  if (counts) {
    counts.textContent = "Question " + (state.current + 1) + " of " + total +
      " · Answered " + answered + " · Marked " + state.marked.size +
      " · Left " + (total - answered);
  }
  const bar = document.getElementById("progressBar");
  if (bar) bar.style.width = total ? Math.round((answered / total) * 100) + "%" : "0%";
  const line = document.getElementById("answeredLine");
  if (line) {
    line.textContent = answered + " / " + total + " answered • " +
      state.marked.size + " marked for review";
  }
  const summary = document.getElementById("paletteSummary");
  if (summary && state.palButtons.length) {
    summary.textContent =
      "Answered: " + answered + " • Unanswered: " + (total - answered) +
      " • Marked: " + state.marked.size;
  }
}
function renderQuestion() {
  if (!state) return;
  const q = state.questions[state.current];
  document.getElementById("qNum").textContent =
    "Question " + (state.current + 1) + " / " + state.questions.length;
  document.getElementById("qSubject").textContent = q.subject;
  document.getElementById("qTopic").textContent = q.topic || "";
  document.getElementById("qText").textContent = q.q;
  updateOptions();

  document.getElementById("btnPrev").disabled = state.current === 0;
  const nextBtn = document.getElementById("btnNext");
  nextBtn.textContent = state.current === state.questions.length - 1
    ? "Submit Test" : "Save & Next";
  const markBtn = document.getElementById("btnMark");
  const isMarked = state.marked.has(state.current);
  markBtn.textContent = isMarked ? "Marked — Remove Mark" : "Mark for Review";
  markBtn.setAttribute("aria-pressed", isMarked ? "true" : "false");
  updateProgress();
  if (state.current === state.questions.length - 1 &&
      state.lastNoticeIndex !== state.current) {
    state.lastNoticeIndex = state.current;
    announce("Last question. Save & Next will open the submit confirmation.");
  }
}
function goToQuestion(i) {
  if (!state) return;
  if (i < 0 || i >= state.questions.length) return;
  state.current = i;
  state.visited.add(i);
  renderQuestion();
  renderPalette();
  announce("Question " + (i + 1) + " of " + state.questions.length + ".");
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

function requestSubmit() {
  if (!state || state.done) return;
  openSubmitDialog();
}
function doSubmit() {
  if (!state || state.done) return;
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
function submitTest(auto) {
  // Kept for call-site clarity: auto-submit (timer zero) submits
  // directly; every manual submit goes through the confirmation dialog.
  if (!state || state.done) return;
  if (auto) doSubmit();
  else requestSubmit();
}

function questionStatus(i) {
  if (state.answers[i] === null) return "unattempted";
  return state.answers[i] === state.questions[i].answer ? "correct" : "wrong";
}
function renderResult(result, timeTaken) {
  const total = state.questions.length;
  const attempted = result.correct + result.wrong;
  const unattempted = total - attempted;
  const accuracy = attempted ? Math.round((result.correct / attempted) * 100) : 0;
  state.lastResult = { result, timeTaken, attempted, unattempted, accuracy };
  document.getElementById("resultScore").textContent =
    formatScore(result.raw, result.neg) + " / " + total;
  let summary = state.label + " • Accuracy: " + accuracy + "% • Time taken: " + fmtDuration(timeTaken);
  if (EXAMS[state.exam].markingNote) summary += " • " + EXAMS[state.exam].markingNote;
  if (result.neg) summary += " • Negative marking: " + result.neg + " per wrong answer";
  document.getElementById("resultSummary").textContent = summary;
  const statRow = document.getElementById("statRow");
  statRow.innerHTML = "";
  const stats = [
    ["Score", formatScore(result.raw, result.neg) + " / " + total],
    ["Attempted", attempted],
    ["Correct", result.correct],
    ["Wrong", result.wrong],
    ["Unattempted", unattempted],
    ["Accuracy", accuracy + "%"],
    ["Time Taken", fmtDuration(timeTaken)]
  ];
  for (const [label, val] of stats) {
    const d = el("div", null, "stat");
    d.appendChild(el("b", String(val)));
    d.appendChild(el("span", label));
    statRow.appendChild(d);
  }

  // Subject-wise (exam's own subject list), with raw counts beside accuracy.
  const subBox = document.getElementById("subjectResult");
  subBox.innerHTML = "";
  const table = document.createElement("table");
  table.className = "subject-table";
  const caption = document.createElement("caption");
  caption.textContent = "Subject-wise result";
  caption.className = "visually-hidden";
  table.appendChild(caption);
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  for (const h of ["Subject", "Total", "Correct", "Wrong", "Skipped", "Accuracy"]) {
    const th = el("th", h);
    th.setAttribute("scope", "col");
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);
  const tbody = document.createElement("tbody");
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
    const acc = Math.round((ok / tot) * 100);
    for (const v of [s, tot, ok, wrong, skip, acc + "% (" + ok + " of " + tot + ")"]) {
      row.appendChild(el("td", String(v)));
    }
    tbody.appendChild(row);
  }
  table.appendChild(tbody);
  subBox.appendChild(table);

  renderFocusNext();
  updateFilterCounts();
  renderReview(state.currentFilter || "all");
  renderResultHistory();
  announce("Test complete. You scored " + formatScore(result.raw, result.neg) +
    " out of " + total + ". Accuracy " + accuracy + " percent.");
}
function renderFocusNext() {
  const textEl = document.getElementById("focusNextText");
  const actions = document.getElementById("focusNextActions");
  if (!textEl || !actions) return;
  actions.innerHTML = "";
  const perSubject = [];
  for (const s of EXAMS[state.exam].subjects) {
    let tot = 0, ok = 0;
    state.questions.forEach((q, i) => {
      if (q.subject !== s) return;
      tot++;
      if (state.answers[i] === q.answer) ok++;
    });
    if (tot) perSubject.push({ subject: s, tot, ok, acc: Math.round((ok / tot) * 100) });
  }
  if (!perSubject.length) {
    textEl.textContent = "No subject breakdown is available for this test.";
    return;
  }
  const lowest = Math.min(...perSubject.map((p) => p.acc));
  const weakest = perSubject.filter((p) => p.acc === lowest);
  if (lowest === 100) {
    textEl.textContent = "Full marks in every subject (" +
      perSubject.map((p) => p.subject + " " + p.ok + "/" + p.tot).join(", ") +
      "). Try a new random test to keep the practice going.";
    const b = document.createElement("button");
    b.type = "button";
    b.className = "btn btn-outline";
    b.textContent = "New Random Test";
    b.dataset.focusRandom = "1";
    actions.appendChild(b);
    return;
  }
  const names = weakest.map((p) => p.subject + " (" + p.ok + "/" + p.tot + " — " + p.acc + "%)");
  textEl.textContent = "Weakest subject" + (weakest.length > 1 ? "s" : "") +
    " in this test: " + names.join(", ") +
    ". Practise " + (weakest.length > 1 ? "these subjects" : "this subject") + " next.";
  for (const w of weakest) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "btn btn-outline";
    b.textContent = "Practice " + w.subject;
    b.dataset.focusPractice = w.subject;
    actions.appendChild(b);
  }
}
function updateFilterCounts() {
  const counts = { all: state.questions.length, correct: 0, wrong: 0, unattempted: 0 };
  state.questions.forEach((_, i) => { counts[questionStatus(i)] += 1; });
  document.querySelectorAll("[data-filter-count]").forEach((span) => {
    const key = span.getAttribute("data-filter-count");
    span.textContent = "(" + (counts[key] || 0) + ")";
  });
  document.querySelectorAll("[data-filter]").forEach((b) => {
    b.setAttribute("aria-pressed", b.getAttribute("data-filter") === (state.currentFilter || "all") ? "true" : "false");
  });
  return counts;
}
function renderReview(filter) {
  const list = document.getElementById("reviewList");
  if (!list || !state) return;
  list.innerHTML = "";
  let shown = 0;
  state.questions.forEach((q, i) => {
    const status = questionStatus(i);
    if (filter && filter !== "all" && status !== filter) return;
    shown++;
    const item = el("div", null, "review-item");
    const head = el("p", (i + 1) + ". " + q.q, "review-q");
    item.appendChild(head);
    const badgeText = status === "correct" ? "Correct"
      : status === "wrong" ? "Wrong" : "Not attempted";
    const badgeGlyph = status === "correct" ? "✓" : status === "wrong" ? "✗" : "—";
    const badge = el("span", null, "review-status " + (status === "correct" ? "ok" : status === "wrong" ? "bad" : "skip"));
    const glyph = el("span", badgeGlyph);
    glyph.setAttribute("aria-hidden", "true");
    badge.appendChild(glyph);
    badge.appendChild(document.createTextNode(" " + badgeText));
    item.appendChild(badge);
    item.appendChild(el("span", q.subject + " • " + (q.topic || ""), "chip chip-topic"));
    const mine = state.answers[i];
    q.options.forEach((opt, oi) => {
      const row = el("div", null, "review-opt" +
        (oi === q.answer ? " correct" : "") +
        (mine === oi && oi !== q.answer ? " wrong" : ""));
      row.appendChild(document.createTextNode(LETTERS[oi] + ". " + opt));
      const tags = [];
      if (mine === oi) tags.push("Your answer");
      if (oi === q.answer) tags.push("Correct answer");
      if (tags.length) {
        row.appendChild(document.createTextNode(" "));
        row.appendChild(el("span", "— " + tags.join(" · "), "review-tag"));
      }
      item.appendChild(row);
    });
    const verdict = mine === null
      ? el("p", "You did not answer. Correct answer: " + LETTERS[q.answer], "review-verdict skip")
      : mine === q.answer
        ? el("p", "Correct — your answer: " + LETTERS[mine], "review-verdict ok")
        : el("p", "Wrong — your answer: " + LETTERS[mine] + " • Correct answer: " + LETTERS[q.answer], "review-verdict bad");
    item.appendChild(verdict);
    if (q.explanation) {
      const ex = el("p", null, "explain");
      ex.appendChild(el("strong", "Explanation: "));
      ex.appendChild(document.createTextNode(q.explanation));
      item.appendChild(ex);
    }
    list.appendChild(item);
  });
  if (!shown) {
    list.appendChild(el("p", "No questions in this category.", "muted"));
  }
}
function renderResultHistory() {
  const list = document.getElementById("resultHistoryList");
  if (!list || !state) return;
  list.innerHTML = "";
  const h = loadHistory(state.exam);
  if (!h.length) {
    list.appendChild(el("li", "No previous attempts on this device yet."));
    return;
  }
  for (const e of h.slice(0, 7)) {
    list.appendChild(el("li", prettyDate(e.dateStr) + " — " + e.label + ": " +
      e.score + "/" + e.total + " (" + Math.round((e.score / e.total) * 100) + "%)"));
  }
}

/* ---------- palette sheet (mobile) / collapse (desktop) ---------- */
function openPaletteSheet() {
  const card = document.getElementById("paletteCard");
  const backdrop = document.getElementById("paletteBackdrop");
  const toggle = document.getElementById("btnPaletteToggle");
  if (card) card.classList.add("sheet-open");
  if (backdrop) backdrop.hidden = false;
  if (toggle) toggle.setAttribute("aria-expanded", "true");
}
function closePaletteSheet() {
  const card = document.getElementById("paletteCard");
  const backdrop = document.getElementById("paletteBackdrop");
  const toggle = document.getElementById("btnPaletteToggle");
  if (card) card.classList.remove("sheet-open");
  if (backdrop) backdrop.hidden = true;
  if (toggle) toggle.setAttribute("aria-expanded", "false");
}
function paletteSheetOpen() {
  const card = document.getElementById("paletteCard");
  return !!(card && card.classList.contains("sheet-open"));
}

/* ---------- controls (bound BEFORE any fetch, so early clicks show
   a loading state instead of doing nothing) ---------- */
function handleNext() {
  if (!state || state.done) return;
  if (state.current === state.questions.length - 1) { requestSubmit(); return; }
  goToQuestion(state.current + 1);
}
function handlePrev() {
  if (!state || state.done) return;
  if (state.current > 0) goToQuestion(state.current - 1);
}
function handleMarkToggle() {
  if (!state || state.done) return;
  if (state.marked.has(state.current)) {
    state.marked.delete(state.current);
    announce("Mark removed from question " + (state.current + 1) + ".");
  } else {
    state.marked.add(state.current);
    announce("Question " + (state.current + 1) + " marked for review.");
  }
  renderQuestion();
  renderPalette();
}
function enableTre40Home() {
  const home = document.getElementById("view-home-tre40");
  if (home) home.querySelectorAll("button").forEach((b) => { b.disabled = false; });
  const tab = document.querySelector('[data-exam-switch="tre40"]');
  if (tab) tab.disabled = false;
}
function handleExamSwitch(exam) {
  if (!EXAMS[exam]) return;
  if (requestQuitThen(() => handleExamSwitch(exam))) return;
  if (exam === CURRENT_EXAM) { showView("home"); return; }
  if (exam === "tre40" && !BANKS.tre40.length) {
    if (BANK_STATE.tre40.failed) {
      announce("The TRE 4.0 question bank could not be loaded. STET tests still work.");
      return;
    }
    const tab = document.querySelector('[data-exam-switch="tre40"]');
    if (tab) tab.setAttribute("aria-busy", "true");
    ensureTre40Loaded().then((ok) => {
      if (tab) tab.removeAttribute("aria-busy");
      if (ok) { setExam("tre40"); showView("home"); }
      else announce("The TRE 4.0 question bank could not be loaded. STET tests still work.");
    });
    return;
  }
  setExam(exam);
  showView("home");
}
function bindControls() {
  // Exam switcher: tab pattern with roving tabindex and arrow keys.
  const switcher = document.getElementById("examSwitcher");
  document.querySelectorAll("[data-exam-switch]").forEach((b) =>
    b.addEventListener("click", () => handleExamSwitch(b.getAttribute("data-exam-switch"))));
  if (switcher) {
    switcher.addEventListener("keydown", (e) => {
      const tabs = Array.from(switcher.querySelectorAll('[role="tab"]:not([disabled])'));
      const idx = tabs.indexOf(document.activeElement);
      if (idx < 0) return;
      let next = null;
      if (e.key === "ArrowRight") next = tabs[(idx + 1) % tabs.length];
      else if (e.key === "ArrowLeft") next = tabs[(idx - 1 + tabs.length) % tabs.length];
      else if (e.key === "Home") next = tabs[0];
      else if (e.key === "End") next = tabs[tabs.length - 1];
      else return;
      e.preventDefault();
      next.focus();
      handleExamSwitch(next.getAttribute("data-exam-switch"));
    });
  }
  // Exam cards on both home views.
  document.querySelectorAll("[data-exam-goto]").forEach((b) =>
    b.addEventListener("click", () => handleExamSwitch(b.getAttribute("data-exam-goto"))));

  // Top nav — exam-aware.
  document.querySelectorAll("[data-nav]").forEach((b) =>
    b.addEventListener("click", () => {
      const nav = b.getAttribute("data-nav");
      const action = () => {
        if (nav === "daily") {
          const d = istTodayStr();
          withBank(CURRENT_EXAM, () =>
            startTest(pickDaily(d, CURRENT_EXAM), "Today's Daily Test", d, CURRENT_EXAM));
          return;
        }
        showView("home");
        if (nav === "practice") {
          const cards = document.getElementById(EXAMS[CURRENT_EXAM].subjectCardsId);
          if (cards) scrollToElement(cards);
        }
      };
      if (!requestQuitThen(action)) action();
    }));
  document.getElementById("brandHome").addEventListener("click", () => {
    if (!requestQuitThen(() => showView("home"))) showView("home");
  });

  const today = istTodayStr();
  const stetPicker = document.getElementById("datePicker");
  const trePicker = document.getElementById("tre40DatePicker");

  // STET home controls.
  document.getElementById("btnStartDaily").addEventListener("click", () =>
    withBank("stet", () => startTest(pickDaily(today, "stet"), "Today's Daily Test", today, "stet")));
  document.getElementById("btnRandom").addEventListener("click", () =>
    withBank("stet", () => startTest(pickRandom("stet"), "Random Test — 30 Questions", today, "stet")));
  document.getElementById("btnByDate").addEventListener("click", () => {
    const d = stetPicker && stetPicker.value ? stetPicker.value : today;
    if (!stetPicker || !stetPicker.value) {
      announce("No date chosen — today's test will start.");
    }
    withBank("stet", () => startTest(pickDaily(d, "stet"), "Practice Test — " + prettyDate(d), d, "stet"));
  });
  document.querySelectorAll("[data-practice]").forEach((b) =>
    b.addEventListener("click", () => {
      const s = b.getAttribute("data-practice");
      withBank("stet", () => startTest(pickSubject(s, today, "stet"), s + " Practice — 20 Questions", today, "stet"));
    }));

  // TRE home controls.
  document.getElementById("btnTre40StartDaily").addEventListener("click", () =>
    withBank("tre40", () => startTest(pickDaily(today, "tre40"), "Today's Daily Test", today, "tre40")));
  document.getElementById("btnTre40Random").addEventListener("click", () =>
    withBank("tre40", () => startTest(pickRandom("tre40"), "Random Test — 30 Questions", today, "tre40")));
  document.getElementById("btnTre40ByDate").addEventListener("click", () => {
    const d = trePicker && trePicker.value ? trePicker.value : today;
    if (!trePicker || !trePicker.value) {
      announce("No date chosen — today's test will start.");
    }
    withBank("tre40", () => startTest(pickDaily(d, "tre40"), "Practice Test — " + prettyDate(d), d, "tre40"));
  });
  document.querySelectorAll("[data-practice-tre40]").forEach((b) =>
    b.addEventListener("click", () => {
      const s = b.getAttribute("data-practice-tre40");
      withBank("tre40", () => startTest(pickSubject(s, today, "tre40"), s + " Practice — 20 Questions", today, "tre40"));
    }));

  // Retry controls for failed bank loads.
  document.getElementById("btnRetryStet").addEventListener("click", () => reloadBank("stet"));
  document.getElementById("btnRetryTre40").addEventListener("click", () => reloadBank("tre40"));
  document.getElementById("btnRetryBanks").addEventListener("click", () => {
    const jobs = [];
    if (BANK_STATE.stet.failed) jobs.push(reloadBank("stet"));
    if (BANK_STATE.tre40.failed) jobs.push(reloadBank("tre40"));
    if (!jobs.length && !BANKS.tre40.length) jobs.push(ensureTre40Loaded());
  });

  // Quiz controls.
  document.getElementById("btnPrev").addEventListener("click", handlePrev);
  document.getElementById("btnNext").addEventListener("click", handleNext);
  document.getElementById("btnMark").addEventListener("click", handleMarkToggle);
  document.getElementById("btnClear").addEventListener("click", () => {
    if (!state) return;
    state.answers[state.current] = null;
    renderQuestion();
    renderPalette();
    announce("Answer cleared for question " + (state.current + 1) + ".");
  });
  document.getElementById("btnSubmit").addEventListener("click", requestSubmit);
  document.getElementById("btnSubmitTop").addEventListener("click", requestSubmit);
  document.getElementById("btnQuit").addEventListener("click", () => {
    if (state && !state.done) openQuitDialog(null);
  });

  // Options: delegated clicks + arrow/digit keyboard support.
  const optionsBox = document.getElementById("options");
  optionsBox.addEventListener("click", (e) => {
    const btn = e.target.closest(".option");
    if (!btn || !state) return;
    selectOption(Number(btn.dataset.index));
  });
  optionsBox.addEventListener("keydown", (e) => {
    if (!state) return;
    const btns = state.optionButtons;
    if (!btns.length) return;
    const current = btns.indexOf(document.activeElement);
    if (e.key === "ArrowDown" || e.key === "ArrowRight") {
      e.preventDefault();
      btns[(current + 1) % btns.length].focus();
    } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
      e.preventDefault();
      btns[(current - 1 + btns.length) % btns.length].focus();
    } else if (e.key === "Home") {
      e.preventDefault(); btns[0].focus();
    } else if (e.key === "End") {
      e.preventDefault(); btns[btns.length - 1].focus();
    } else if (/^[1-4]$/.test(e.key)) {
      e.preventDefault();
      const i = Number(e.key) - 1;
      selectOption(i);
      btns[i].focus();
    } else if (/^[a-dA-D]$/.test(e.key)) {
      e.preventDefault();
      const i = "abcd".indexOf(e.key.toLowerCase());
      selectOption(i);
      btns[i].focus();
    }
  });

  // Palette: delegated clicks; tapping a number jumps and closes the sheet.
  const paletteBox = document.getElementById("palette");
  paletteBox.addEventListener("click", (e) => {
    const btn = e.target.closest(".pal-btn");
    if (!btn || !state) return;
    goToQuestion(Number(btn.dataset.index));
    closePaletteSheet();
  });
  document.getElementById("btnPaletteToggle").addEventListener("click", () => {
    if (paletteSheetOpen()) closePaletteSheet();
    else openPaletteSheet();
  });
  document.getElementById("paletteBackdrop").addEventListener("click", closePaletteSheet);
  document.getElementById("btnPaletteCollapse").addEventListener("click", () => {
    const layout = document.getElementById("quizLayout");
    const collapseBtn = document.getElementById("btnPaletteCollapse");
    if (!layout || !collapseBtn) return;
    const collapsed = layout.classList.toggle("palette-collapsed");
    collapseBtn.textContent = collapsed ? "Show palette" : "Hide palette";
    collapseBtn.setAttribute("aria-expanded", collapsed ? "false" : "true");
  });

  // Dialog buttons.
  document.getElementById("btnDialogBack").addEventListener("click", () => closeDialog("submitDialogBackdrop", true));
  document.getElementById("btnDialogSubmit").addEventListener("click", () => {
    closeDialog("submitDialogBackdrop", false);
    doSubmit();
  });
  document.getElementById("submitDialogJump").addEventListener("click", (e) => {
    const btn = e.target.closest(".jump-btn");
    if (!btn || !state) return;
    closeDialog("submitDialogBackdrop", false);
    closePaletteSheet();
    goToQuestion(Number(btn.dataset.qIndex));
    const target = state.optionButtons[state.answers[state.current]] || state.optionButtons[0];
    if (target) target.focus();
  });
  document.getElementById("btnQuitDialogStay").addEventListener("click", () => {
    pendingQuitAction = null;
    closeDialog("quitDialogBackdrop", true);
  });
  document.getElementById("btnQuitDialogConfirm").addEventListener("click", () => {
    closeDialog("quitDialogBackdrop", false);
    doQuit();
  });

  // Result controls.
  document.getElementById("btnRetry").addEventListener("click", () => {
    if (!state) return;
    startTest(state.questions, state.label, state.dateStr, state.exam);
  });
  document.getElementById("btnReviewWrong").addEventListener("click", () => {
    if (!state) return;
    state.currentFilter = "wrong";
    updateFilterCounts();
    renderReview("wrong");
    const heading = document.getElementById("reviewHeading");
    if (heading) {
      heading.setAttribute("tabindex", "-1");
      scrollToElement(heading);
      heading.focus({ preventScroll: true });
    }
    announce("Showing wrong answers only.");
  });
  document.getElementById("btnNewRandom").addEventListener("click", () => {
    const ex = (state && state.exam) || CURRENT_EXAM;
    withBank(ex, () => startTest(pickRandom(ex), "Random Test — 30 Questions", istTodayStr(), ex));
  });
  document.getElementById("btnHome").addEventListener("click", () => {
    stopTimer();
    state = null;
    showView("home");
  });
  document.getElementById("reviewFilters").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-filter]");
    if (!btn || !state) return;
    state.currentFilter = btn.getAttribute("data-filter");
    updateFilterCounts();
    renderReview(state.currentFilter);
    const counts = { all: state.questions.length, correct: 0, wrong: 0, unattempted: 0 };
    state.questions.forEach((_, i) => { counts[questionStatus(i)] += 1; });
    announce("Showing " + counts[state.currentFilter] + " " + state.currentFilter + " questions.");
  });
  document.getElementById("focusNextActions").addEventListener("click", (e) => {
    const practiceBtn = e.target.closest("[data-focus-practice]");
    const randomBtn = e.target.closest("[data-focus-random]");
    const ex = (state && state.exam) || CURRENT_EXAM;
    const d = istTodayStr();
    if (practiceBtn) {
      const s = practiceBtn.getAttribute("data-focus-practice");
      withBank(ex, () => startTest(pickSubject(s, d, ex), s + " Practice — 20 Questions", d, ex));
    } else if (randomBtn) {
      withBank(ex, () => startTest(pickRandom(ex), "Random Test — 30 Questions", d, ex));
    }
  });

  // Keyboard shortcuts during a test (progressive enhancement; every
  // action also has a visible button). Never active in a dialog or input.
  document.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (!state || state.done) return;
    if (!document.getElementById("submitDialogBackdrop").hidden ||
        !document.getElementById("quitDialogBackdrop").hidden) return;
    const target = e.target;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" || target.isContentEditable)) return;
    if (e.key === "n" || e.key === "N") { e.preventDefault(); handleNext(); }
    else if (e.key === "p" || e.key === "P") { e.preventDefault(); handlePrev(); }
    else if (e.key === "f" || e.key === "F") { e.preventDefault(); handleMarkToggle(); }
  });
}

/* ---------- init ---------- */
async function init() {
  // Bind every control synchronously, before any fetch, so the home
  // page is interactive (with a loading state) while banks load.
  bindControls();
  const today = istTodayStr();
  const stetPicker = document.getElementById("datePicker");
  if (stetPicker) stetPicker.value = today;
  const trePicker = document.getElementById("tre40DatePicker");
  if (trePicker) trePicker.value = today;
  renderHistory("stet");
  renderHistory("tre40");
  renderExamCards();

  // STET loads eagerly. TRE loads only when first needed: the TRE tab
  // or a TRE button, or a saved TRE choice being restored.
  const stetLoad = loadBankForExam("stet");
  let saved = null;
  try { saved = localStorage.getItem(EXAM_CHOICE_KEY); } catch (e) { saved = null; }
  const wantTre = saved === "tre40";
  await stetLoad;
  if (wantTre) await ensureTre40Loaded();
  const initial = (wantTre && BANKS.tre40.length) ? "tre40"
    : (BANKS.stet.length ? "stet" : "tre40");
  setExam(initial, { render: false });
  renderHistory("stet");
  renderHistory("tre40");
  renderExamCards();
  if (BANK_STATE.tre40.failed && initial === "stet") {
    // The TRE tab is already disabled by disableTre40; keep the STET
    // home visible with the failure notice.
    refreshLoadNotice();
  }
  showView("home", { focus: false });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
