/* ============================================================================
   ClassMark — Online Quiz & Assessment System
   ----------------------------------------------------------------------------
   A web-based quiz delivery platform with:
     • Role-based access (teacher / student)
     • Timed, server-authoritative quiz attempts
     • Automated grading the instant a student submits (or when time expires)
     • Real-time monitoring of in-progress attempts (lightweight polling)
     • Analytics: score distribution, pass rate and per-question item analysis
   ----------------------------------------------------------------------------
   Stack: zero-dependency Node.js (built-in http / fs / crypto only).
   Storage: JSON document store (data/db.json) with atomic writes.
   ============================================================================ */
'use strict';

const http   = require('http');
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const PORT          = Number(process.env.PORT || 3000);
const PUB           = path.join(__dirname, 'public');
const DB_FILE       = path.join(__dirname, 'data', 'db.json');
const GRACE_MS      = 15000;                 // network grace window after timer ends
const SESSION_TTL   = 90 * 24 * 3600 * 1000; // 90 days — persistent logins

/* ---------------------------------------------------------------- utilities */
const uid    = (p) => p + '_' + crypto.randomBytes(6).toString('hex');
const now    = () => Date.now();
const sha    = (s) => crypto.createHash('sha256').update(s).digest('hex');
const hashPw = (pw, salt) => sha(salt + '::' + pw);
const clamp  = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const byId   = (arr, id) => arr.find((x) => x.id === id);

function publicUser(u) {
  return u && { id: u.id, name: u.name, email: u.email, role: u.role, createdAt: u.createdAt };
}
function meta(q) { // safe quiz summary (no answers involved)
  return q && {
    id: q.id, title: q.title, subject: q.subject, description: q.description,
    durationMin: q.durationMin, passMark: q.passMark, attemptsAllowed: q.attemptsAllowed,
    shuffle: !!q.shuffle, shuffleOptions: !!q.shuffleOptions,
    tabSwitchPolicy: ['off', 'warn', 'autosubmit'].includes(q.tabSwitchPolicy) ? q.tabSwitchPolicy : 'warn',
    published: !!q.published, createdAt: q.createdAt, classes: q.classes || []
  };
}
function publicQuestion(q) { // what a student may see BEFORE grading
  return q && { id: q.id, type: q.type, text: q.text, options: q.options, points: q.points, img: q.img || '' };
}

/* ------------------------------------------------------------- data & seed  */
let db;
let dbSeeded = false; // true when this boot started from the seed (no db.json)

function saveDb() {
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  db.updatedAt = now();
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 1));
  fs.renameSync(tmp, DB_FILE); // atomic replace
  scheduleCloudSave(); // debounced push to cloud storage (no-op when not connected)
}

function seed() {
  // fresh install: completely empty — the first teacher registers from the login page
  db = { users: [], quizzes: [], questions: {}, attempts: [], notifications: [], classes: [], sessions: {} };
}

function loadDb() {
  try {
    db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    if (!db || !Array.isArray(db.users)) throw new Error('corrupt');
  } catch (e) {
    seed();
    dbSeeded = true;
  }
  if (!db.notifications) db.notifications = []; // migration for older stores
  if (!db.classes) db.classes = []; // migration for older stores
}

/* -------------------------------------------------------- grading engine    */
function orderedQuestions(a) {
  const all = (db.questions[a.quizId] || []).filter((q) => !q.draft);
  if (!a.questionOrder) return all;
  const m = new Map(all.map((q) => [q.id, q]));
  return a.questionOrder.map((id) => m.get(id)).filter(Boolean);
}

function sameSet(x, y) {
  return Array.isArray(x) && Array.isArray(y) &&
    x.length === y.length && x.every((v) => y.includes(v));
}

/** Grade an attempt: computes score, snapshot review with correct answers. */
function finishAttempt(a) {
  const quiz = byId(db.quizzes, a.quizId);
  const qs = orderedQuestions(a);
  let score = 0, maxScore = 0;
  const review = [];
  for (const q of qs) {
    maxScore += q.points;
    const given = a.answers ? a.answers[q.id] : undefined;
    const has = given !== undefined && given !== null;
    let correct = false;
    if (has) {
      correct = (q.type === 'multiple')
        ? sameSet(given, q.answer)
        : Number(given) === Number(q.answer);
    }
    if (correct) score += q.points;
    review.push({
      questionId: q.id, text: q.text, type: q.type, options: q.options,
      answer: q.answer, given: has ? given : null, correct, points: q.points,
      explanation: q.explanation || '', img: q.img || ''
    });
  }
  a.score = score;
  a.maxScore = maxScore;
  a.percent = maxScore ? Math.round((score / maxScore) * 1000) / 10 : 0;
  a.passed = quiz ? a.percent >= quiz.passMark : false;
  a.durationUsedSec = Math.max(1, Math.round(((a.submittedAt || now()) - a.startedAt) / 1000));
  a.review = review; // snapshot for the result sheet
}

/** Push a notification to the teacher who owns the quiz.
    Types: 'submitted' | 'expired' | 'tabswitch' */
function notifySubmission(quiz, a, type) {
  if (!quiz) return;
  const teacher = byId(db.users, quiz.createdBy);
  if (!teacher) return;
  const student = byId(db.users, a.userId) || { name: 'Unknown' };
  db.notifications.push({
    id: uid('n'), userId: teacher.id, quizId: quiz.id, quizTitle: quiz.title,
    attemptId: a.id, studentName: student.name, type,
    percent: a.percent, score: a.score, maxScore: a.maxScore, passed: a.passed,
    createdAt: now(), read: false
  });
  if (db.notifications.length > 400) db.notifications = db.notifications.slice(-400);
}

/** Background sweeper: auto-grade attempts whose time has expired.
    This is what makes results "process in real time" even if a student
    closes the browser without submitting. */
function expireStale() {
  let changed = false;
  for (const a of db.attempts) {
    if (a.status === 'in_progress' && now() > a.endsAt + GRACE_MS) {
      a.status = 'expired';
      a.submittedAt = a.endsAt;
      finishAttempt(a);
      notifySubmission(byId(db.quizzes, a.quizId), a, 'expired');
      changed = true;
    }
  }
  if (changed) saveDb();
}
setInterval(() => { try { expireStale(); } catch (e) { /* keep alive */ } }, 10000).unref();

/* ------------------------------------------------------------- http basics  */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon'
};

function send(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 5e6) { reject(new Error('Payload too large')); req.destroy(); }
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch (e) { resolve({}); }
    });
    req.on('error', reject);
  });
}

function getUser(req) {
  const m = String(req.headers['authorization'] || '').match(/^Bearer (.+)$/);
  if (!m) return null;
  const s = db.sessions[m[1]];
  if (!s || now() - s.createdAt > SESSION_TTL) return null;
  return byId(db.users, s.userId) || null;
}
const isTeacher = (u) => !!u && u.role === 'teacher';

function serveStatic(p, res) {
  const rel = (p === '/') ? '/index.html' : p;
  const file = path.normalize(path.join(PUB, rel));
  if (!file.startsWith(PUB)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(data);
  });
}

/* ------------------------------------------------------- classes & visibility */
function classPublic(c) {
  const t = byId(db.users, c.teacherId);
  return c && {
    id: c.id, name: c.name, code: c.code, color: c.color || null,
    teacherId: c.teacherId, teacherName: t ? t.name : 'Teacher',
    memberCount: (c.studentIds || []).length, createdAt: c.createdAt
  };
}
function genClassCode() {
  const CH = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  for (;;) {
    let code = '';
    for (let i = 0; i < 6; i++) code += CH[Math.floor(Math.random() * CH.length)];
    if (!db.classes.some((c) => c.code === code)) return code;
  }
}
function myClassIds(u) {
  return db.classes.filter((c) => (c.studentIds || []).includes(u.id)).map((c) => c.id);
}
function canSeeQuiz(u, q) {
  if (!u || u.role === 'teacher') return true;
  return (q.classes || []).some((id) => myClassIds(u).includes(id)); // class members only — never public
}
function sanitizeClasses(list, teacher) {
  if (!Array.isArray(list)) return [];
  const mine = db.classes.filter((c) => c.teacherId === teacher.id).map((c) => c.id);
  return [...new Set(list)].filter((id) => mine.includes(id));
}
function notifyQuizPublished(quiz, teacher) { // members of the quiz's classes only
  const ids = new Set();
  for (const cid of (quiz.classes || [])) {
    const c = byId(db.classes, cid);
    if (c) (c.studentIds || []).forEach((sid) => ids.add(sid));
  }
  const targets = [...ids].map((sid) => byId(db.users, sid)).filter((u) => u && u.role === 'student');
  for (const st of targets) {
    db.notifications.push({
      id: uid('n'), userId: st.id, quizId: quiz.id, quizTitle: quiz.title,
      type: 'published', teacherName: teacher.name, createdAt: now(), read: false
    });
  }
}
function studentStat(u) { // aggregate performance for one student
  const atts = db.attempts.filter((a) => a.userId === u.id);
  const done = atts.filter((a) => a.status !== 'in_progress');
  const last = done.length ? Math.max(...done.map((a) => a.submittedAt || a.startedAt)) : null;
  return {
    id: u.id, name: u.name, email: u.email, createdAt: u.createdAt,
    attempts: done.length,
    quizzesTaken: new Set(done.map((a) => a.quizId)).size,
    avgPercent: done.length ? Math.round(done.reduce((x, a) => x + a.percent, 0) / done.length * 10) / 10 : null,
    bestPercent: done.length ? Math.max(...done.map((a) => a.percent)) : null,
    lastActivity: last,
    inProgress: atts.some((a) => a.status === 'in_progress')
  };
}

/* --------------------------------------------------------------- routing    */
const routes = [];
function route(method, pattern, handler) {
  routes.push({ method, re: new RegExp('^' + pattern + '$'), handler });
}

/* ======== AUTH ======== */
route('POST', '/api/auth/register', async ({ body, res }) => {
  const name  = String(body.name || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const pw    = String(body.password || '');
  const role  = body.role === 'teacher' ? 'teacher' : 'student';
  if (name.length < 2)                 return send(res, 400, { error: 'Please enter your full name.' });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return send(res, 400, { error: 'Please enter a valid email address.' });
  if (pw.length < 6)                   return send(res, 400, { error: 'Password must be at least 6 characters.' });
  if (db.users.some((u) => u.email === email)) return send(res, 409, { error: 'An account with this email already exists.' });
  const salt = crypto.randomBytes(8).toString('hex');
  const user = { id: uid('u'), name, email, salt, pass: hashPw(pw, salt), role, createdAt: now() };
  db.users.push(user);
  if (role === 'teacher' && String(body.className || '').trim().length >= 2) {
    db.classes.push({
      id: uid('cls'), name: String(body.className).trim(), code: genClassCode(),
      teacherId: user.id, studentIds: [], createdAt: now()
    });
  }
  const token = crypto.randomBytes(24).toString('hex');
  db.sessions[token] = { userId: user.id, createdAt: now() };
  saveDb();
  // a brand-new account must reach the cloud at once — no debounce window
  cloudSaveNow().catch((e) => console.error('cloud: register save failed -', e.message));
  send(res, 201, { token, user: publicUser(user) });
});

route('POST', '/api/auth/login', async ({ body, res }) => {
  const email = String(body.email || '').trim().toLowerCase();
  const pw    = String(body.password || '');
  const user  = db.users.find((u) => u.email === email);
  if (!user || user.pass !== hashPw(pw, user.salt)) {
    return send(res, 401, { error: 'Invalid email or password.' });
  }
  const token = crypto.randomBytes(24).toString('hex');
  db.sessions[token] = { userId: user.id, createdAt: now() };
  saveDb();
  send(res, 200, { token, user: publicUser(user) });
});

route('POST', '/api/auth/logout', async ({ user, res }) => {
  const m = String(res.req.headers['authorization'] || '').match(/^Bearer (.+)$/);
  if (m && db.sessions[m[1]]) { delete db.sessions[m[1]]; saveDb(); }
  send(res, 200, { ok: true, user: user ? user.name : null });
});

route('GET', '/api/auth/me', async ({ user, res }) => {
  if (!user) return send(res, 401, { error: 'Not signed in.' });
  send(res, 200, { user: publicUser(user) });
});

/* ======== USERS (teacher) ======== */
route('GET', '/api/users', async ({ user, res }) => {
  if (!user) return send(res, 401, { error: 'Sign in required.' });
  if (!isTeacher(user)) return send(res, 403, { error: 'Teachers only.' });
  send(res, 200, { users: db.users.map(publicUser) });
});

/* ======== QUIZZES ======== */
function quizFor(q, user) { // meta + counters, personalised for the viewer
  const classInfo = (q.classes || [])
    .map((id) => byId(db.classes, id))
    .filter(Boolean)
    .map((c) => ({ id: c.id, name: c.name, color: c.color || null }));
  const qs = db.questions[q.id] || [];
  const live = qs.filter((x) => !x.draft);
  const atts = db.attempts.filter((a) => a.quizId === q.id);
  const done = atts.filter((a) => a.status !== 'in_progress');
  const mine = atts.filter((a) => a.userId === user.id);
  const myDone = mine.filter((a) => a.status !== 'in_progress');
  const inprog = mine.find((a) => a.status === 'in_progress');
  return Object.assign(meta(q), {
    opensAt: q.opensAt || null, closesAt: q.closesAt || null,
    classInfo,
    questionCount: live.length,
    draftCount: qs.length - live.length,
    totalPoints: live.reduce((s, x) => s + x.points, 0),
    attemptCount: atts.length,
    finishedCount: done.length,
    avgPercent: done.length ? Math.round(done.reduce((s, a) => s + a.percent, 0) / done.length * 10) / 10 : null,
    attemptsUsed: myDone.length,
    attemptsAllowed: q.attemptsAllowed,
    bestPercent: myDone.length ? Math.max(...myDone.map((a) => a.percent)) : null,
    bestPassed: myDone.length ? myDone.some((a) => a.passed) : null,
    inProgressAttemptId: inprog ? inprog.id : null,
    latestAttemptId: myDone.length ? myDone[myDone.length - 1].id : null
  });
}
route('GET', '/api/quizzes', async ({ user, res }) => {
  if (!user) return send(res, 401, { error: 'Sign in required.' });
  expireStale();
  const out = [];
  for (const q of db.quizzes) {
    if (user.role !== 'teacher' && !q.published) continue;
    if (user.role !== 'teacher' && !canSeeQuiz(user, q)) continue; // class-scoped quiz
    out.push(quizFor(q, user));
  }
  out.sort((a, b) => b.createdAt - a.createdAt);
  send(res, 200, { quizzes: out });
});

function fmtTs(ts) { // server-side timestamp for window messages
  return new Date(ts).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
function validQuizBody(body) {
  const title = String(body.title || '').trim();
  if (title.length < 3) return { error: 'Title must be at least 3 characters.' };
  const opensAt = body.opensAt == null ? null : (Number(body.opensAt) || null);
  const closesAt = body.closesAt == null ? null : (Number(body.closesAt) || null);
  if (opensAt && closesAt && closesAt <= opensAt) return { error: 'The closing time must be after the opening time.' };
  return {
    title,
    subject: String(body.subject || '').trim() || 'General',
    description: String(body.description || '').trim(),
    durationMin: clamp(Math.round(Number(body.durationMin) || 15), 1, 180),
    passMark: clamp(Math.round(Number(body.passMark) || 50), 0, 100),
    attemptsAllowed: clamp(Math.round(Number(body.attemptsAllowed) || 2), 1, 10),
    shuffle: !!body.shuffle,
    shuffleOptions: !!body.shuffleOptions,
    tabSwitchPolicy: ['off', 'warn', 'autosubmit'].includes(body.tabSwitchPolicy) ? body.tabSwitchPolicy : 'warn',
    published: !!body.published,
    opensAt, closesAt
  };
}

route('POST', '/api/quizzes', async ({ user, body, res }) => {
  if (!user) return send(res, 401, { error: 'Sign in required.' });
  if (!isTeacher(user)) return send(res, 403, { error: 'Teachers only.' });
  const v = validQuizBody(body);
  if (v.error) return send(res, 400, { error: v.error });
  const quiz = Object.assign({ id: uid('qz'), createdAt: now(), createdBy: user.id }, v);
  quiz.classes = sanitizeClasses(body.classes, user);
  if (!quiz.classes.length) return send(res, 400, { error: 'Pick at least one class — only its members can see the quiz.' });
  db.quizzes.push(quiz);
  db.questions[quiz.id] = [];
  if (quiz.published) notifyQuizPublished(quiz, user);
  saveDb();
  send(res, 201, { quiz: meta(quiz) });
});

route('GET', '/api/quizzes/([A-Za-z0-9_]+)/questions', async ({ user, params, res }) => {
  if (!isTeacher(user)) return send(res, user ? 403 : 401, { error: 'Teachers only.' });
  const quiz = byId(db.quizzes, params[0]);
  if (!quiz) return send(res, 404, { error: 'Quiz not found.' });
  send(res, 200, { quiz: meta(quiz), questions: db.questions[quiz.id] || [] });
});

route('POST', '/api/quizzes/([A-Za-z0-9_]+)/questions', async ({ user, params, body, res }) => {
  if (!isTeacher(user)) return send(res, user ? 403 : 401, { error: 'Teachers only.' });
  const quiz = byId(db.quizzes, params[0]);
  if (!quiz) return send(res, 404, { error: 'Quiz not found.' });
  const v = validQuestion(body);
  if (v.error) return send(res, 400, { error: v.error });
  db.questions[quiz.id] = db.questions[quiz.id] || [];
  db.questions[quiz.id].push(v.q);
  saveDb();
  send(res, 201, { question: v.q, count: db.questions[quiz.id].length });
});

function validQuestion(body) {
  const type = ['single', 'multiple', 'truefalse'].includes(body.type) ? body.type : null;
  if (!type) return { error: 'Invalid question type.' };
  const draft = !!body.draft; // drafts may be incomplete — they never reach students
  const text = String(body.text || '').trim();
  if (!draft && text.length < 3) return { error: 'Question text is too short.' };
  let options, answer;
  if (type === 'truefalse') {
    options = ['True', 'False'];
    answer = (Number(body.answer) === 0 || Number(body.answer) === 1) ? Number(body.answer) : (draft ? null : 1);
  } else {
    options = (Array.isArray(body.options) ? body.options : []).map((o) => String(o || '').trim()).filter(Boolean);
    if (!draft && options.length < 2) return { error: 'Provide at least 2 non-empty options.' };
    if (options.length > 6) return { error: 'Maximum of 6 options.' };
    if (type === 'single') {
      answer = Number(body.answer);
      if (!(answer >= 0 && answer < options.length)) answer = draft ? null : undefined;
    } else {
      answer = Array.isArray(body.answer)
        ? [...new Set(body.answer.map(Number))].filter((x) => Number.isInteger(x) && x >= 0 && x < options.length).sort((a, b) => a - b)
        : [];
      if (draft && !answer.length) answer = null;
    }
  }
  if (!draft) {
    if (type === 'single' && !(answer >= 0)) return { error: 'Mark one correct option.' };
    if (type === 'multiple' && (!Array.isArray(answer) || !answer.length)) return { error: 'Mark at least one correct option.' };
    if (type === 'truefalse' && !(answer === 0 || answer === 1)) return { error: 'Mark the correct answer.' };
  }
  const img = typeof body.img === 'string' && body.img.startsWith('data:image/')
    ? (body.img.length > 900000 ? null : body.img)
    : '';
  if (body.img && img === null) return { error: 'Image is too large — attach a smaller picture (under ~700 KB).' };
  return { q: {
    id: body.id || uid('qn'), type, text, options, answer,
    points: clamp(Math.round(Number(body.points) || 1), 1, 10),
    explanation: String(body.explanation || '').trim(),
    img, draft
  } };
}

route('PUT', '/api/questions/([A-Za-z0-9_]+)', async ({ user, params, body, res }) => {
  if (!isTeacher(user)) return send(res, user ? 403 : 401, { error: 'Teachers only.' });
  let quizId = null, q = null;
  for (const [zid, list] of Object.entries(db.questions)) {
    const found = list.find((x) => x.id === params[0]);
    if (found) { quizId = zid; q = found; break; }
  }
  if (!q) return send(res, 404, { error: 'Question not found.' });
  const v = validQuestion(Object.assign({}, body, { id: q.id }));
  if (v.error) return send(res, 400, { error: v.error });
  const i = db.questions[quizId].indexOf(q);
  db.questions[quizId][i] = v.q;
  saveDb();
  send(res, 200, { question: v.q });
});

route('DELETE', '/api/questions/([A-Za-z0-9_]+)', async ({ user, params, res }) => {
  if (!isTeacher(user)) return send(res, user ? 403 : 401, { error: 'Teachers only.' });
  for (const list of Object.values(db.questions)) {
    const i = list.findIndex((x) => x.id === params[0]);
    if (i >= 0) { list.splice(i, 1); saveDb(); return send(res, 200, { ok: true }); }
  }
  send(res, 404, { error: 'Question not found.' });
});

route('GET', '/api/quizzes/([A-Za-z0-9_]+)', async ({ user, params, res }) => {
  if (!user) return send(res, 401, { error: 'Sign in required.' });
  const quiz = byId(db.quizzes, params[0]);
  if (!quiz) return send(res, 404, { error: 'Quiz not found.' });
  const qs = db.questions[quiz.id] || [];
  if (isTeacher(user)) {
    return send(res, 200, { quiz: meta(quiz), questions: qs });
  }
  if (!quiz.published || !canSeeQuiz(user, quiz)) return send(res, 404, { error: 'Quiz not found.' });
  send(res, 200, { quiz: meta(quiz), questionCount: qs.filter((x) => !x.draft).length });
});

route('PUT', '/api/quizzes/([A-Za-z0-9_]+)', async ({ user, params, body, res }) => {
  if (!isTeacher(user)) return send(res, user ? 403 : 401, { error: 'Teachers only.' });
  const quiz = byId(db.quizzes, params[0]);
  if (!quiz) return send(res, 404, { error: 'Quiz not found.' });
  const v = validQuizBody(Object.assign({}, quiz, body));
  if (v.error) return send(res, 400, { error: v.error });
  const nextClasses = body.classes !== undefined ? sanitizeClasses(body.classes, user) : (quiz.classes || []);
  if (!nextClasses.length) return send(res, 400, { error: 'Pick at least one class — only its members can see the quiz.' });
  const wasPublished = quiz.published;
  Object.assign(quiz, v);
  quiz.classes = nextClasses;
  if (!wasPublished && quiz.published) notifyQuizPublished(quiz, user);
  saveDb();
  send(res, 200, { quiz: meta(quiz) });
});

route('DELETE', '/api/quizzes/([A-Za-z0-9_]+)', async ({ user, params, res }) => {
  if (!isTeacher(user)) return send(res, user ? 403 : 401, { error: 'Teachers only.' });
  const i = db.quizzes.findIndex((q) => q.id === params[0]);
  if (i < 0) return send(res, 404, { error: 'Quiz not found.' });
  const id = db.quizzes[i].id;
  db.quizzes.splice(i, 1);
  delete db.questions[id];
  db.attempts = db.attempts.filter((a) => a.quizId !== id);
  saveDb();
  send(res, 200, { ok: true });
});

/* ======== ATTEMPTS (quiz taking) ======== */
function attemptPayload(a) {
  const quiz = byId(db.quizzes, a.quizId);
  return {
    attempt: { id: a.id, status: a.status, answers: a.answers || {}, startedAt: a.startedAt, endsAt: a.endsAt },
    quiz: meta(quiz),
    questions: orderedQuestions(a).map((q) => {
      const pq = publicQuestion(q);
      const perm = a.optionOrder && a.optionOrder[q.id];
      if (perm) pq.options = perm.map((i) => q.options[i]); // display order maps to original index
      return pq;
    }),
    serverNow: now()
  };
}

route('POST', '/api/attempts', async ({ user, body, res }) => {
  if (!user) return send(res, 401, { error: 'Sign in required.' });
  if (user.role !== 'student') return send(res, 403, { error: 'Teachers cannot take quizzes — use a student account.' });
  expireStale();
  const quiz = byId(db.quizzes, body.quizId);
  if (!quiz || !quiz.published || !canSeeQuiz(user, quiz)) return send(res, 404, { error: 'Quiz not found.' });
  const allQs = db.questions[quiz.id] || [];
  const qs = allQs.filter((q) => !q.draft); // drafts never reach students
  if (!qs.length) return send(res, 400, { error: 'This quiz has no questions yet (only drafts or empty).' });
  const tNow = now(); // availability window — e.g. Friday 8 PM to 9 PM
  if (quiz.opensAt && tNow < quiz.opensAt) {
    return send(res, 403, { error: 'This quiz is not open yet — it opens ' + fmtTs(quiz.opensAt) + '.' });
  }
  if (quiz.closesAt && tNow > quiz.closesAt) {
    return send(res, 403, { error: 'This quiz closed on ' + fmtTs(quiz.closesAt) + '.' });
  }
  const existing = db.attempts.find((a) => a.userId === user.id && a.quizId === quiz.id && a.status === 'in_progress');
  if (existing) return send(res, 200, attemptPayload(existing)); // resume
  const myDone = db.attempts.filter((a) => a.userId === user.id && a.quizId === quiz.id && a.status !== 'in_progress');
  if (myDone.length >= quiz.attemptsAllowed) {
    return send(res, 409, { error: `Attempt limit reached (${myDone.length}/${quiz.attemptsAllowed}).` });
  }
  let order = qs.map((q) => q.id);
  if (quiz.shuffle) { // Fisher–Yates shuffle — per-attempt question order
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
  }
  // per-attempt option order (anti-cheat: neighbours can't copy answer positions)
  let optionOrder = null;
  if (quiz.shuffleOptions) {
    optionOrder = {};
    for (const q of qs) {
      if ((q.options || []).length > 2) {
        const perm = q.options.map((_, i) => i);
        for (let i = perm.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [perm[i], perm[j]] = [perm[j], perm[i]];
        }
        optionOrder[q.id] = perm;
      }
    }
  }
  const a = {
    id: uid('a'), quizId: quiz.id, userId: user.id, startedAt: now(),
    // the attempt also expires when the quiz window closes, whichever comes first
    endsAt: Math.min(now() + quiz.durationMin * 60000, quiz.closesAt || Infinity), status: 'in_progress',
    answers: {}, tabSwitches: 0, questionOrder: order, optionOrder
  };
  db.attempts.push(a);
  saveDb();
  send(res, 201, attemptPayload(a));
});

route('GET', '/api/attempts/([A-Za-z0-9_]+)', async ({ user, params, res }) => {
  if (!user) return send(res, 401, { error: 'Sign in required.' });
  const a = db.attempts.find((x) => x.id === params[0]);
  if (!a) return send(res, 404, { error: 'Attempt not found.' });
  if (user.role !== 'teacher' && a.userId !== user.id) return send(res, 403, { error: 'Not your attempt.' });
  const quiz = byId(db.quizzes, a.quizId);
  if (a.status === 'in_progress') {
    if (user.role === 'teacher') {
      return send(res, 200, { attempt: { id: a.id, status: a.status }, quiz: meta(quiz), serverNow: now() });
    }
    if (now() > a.endsAt + GRACE_MS) { // lazy expiry
      a.status = 'expired'; a.submittedAt = a.endsAt; finishAttempt(a); saveDb();
    } else {
      return send(res, 200, attemptPayload(a));
    }
  }
  send(res, 200, {
    attempt: {
      id: a.id, status: a.status, score: a.score, maxScore: a.maxScore, percent: a.percent,
      passed: a.passed, submittedAt: a.submittedAt, startedAt: a.startedAt,
      durationUsedSec: a.durationUsedSec, tabSwitches: a.tabSwitches || 0,
      autoSubmittedReason: a.autoSubmittedReason || null, review: a.review || []
    },
    quiz: meta(quiz),
    student: (byId(db.users, a.userId) || {}).name || 'Unknown',
    serverNow: now()
  });
});

route('POST', '/api/attempts/([A-Za-z0-9_]+)/answer', async ({ user, params, body, res }) => {
  if (!user) return send(res, 401, { error: 'Sign in required.' });
  const a = db.attempts.find((x) => x.id === params[0]);
  if (!a) return send(res, 404, { error: 'Attempt not found.' });
  if (a.userId !== user.id) return send(res, 403, { error: 'Not your attempt.' });
  if (a.status !== 'in_progress') return send(res, 409, { error: 'This attempt is no longer active.' });
  if (now() > a.endsAt + GRACE_MS) { expireStale(); return send(res, 409, { error: 'Time is up.' }); }
  const q = (db.questions[a.quizId] || []).find((x) => x.id === body.questionId);
  if (!q) return send(res, 404, { error: 'Question not found.' });
  let val = body.answer;
  // client sends positions in the (possibly shuffled) display order -> map to original indexes
  const perm = (a.optionOrder && a.optionOrder[q.id]) || null;
  if (perm) {
    if (q.type === 'multiple') val = Array.isArray(val) ? val.map((d) => perm[Number(d)]) : [];
    else val = perm[Number(val)];
  }
  if (q.type === 'multiple') {
    val = Array.isArray(val)
      ? [...new Set(val.map(Number))].filter((x) => Number.isInteger(x) && x >= 0 && x < q.options.length).sort((x, y) => x - y)
      : [];
  } else {
    val = Number(val);
    if (!(val >= 0 && val < q.options.length)) val = null;
  }
  a.answers = a.answers || {};
  a.answers[q.id] = val;
  saveDb();
  send(res, 200, { saved: true, remainingSec: Math.max(0, Math.round((a.endsAt - now()) / 1000)) });
});

route('POST', '/api/attempts/([A-Za-z0-9_]+)/submit', async ({ user, params, body, res }) => {
  if (!user) return send(res, 401, { error: 'Sign in required.' });
  const a = db.attempts.find((x) => x.id === params[0]);
  if (!a) return send(res, 404, { error: 'Attempt not found.' });
  if (a.userId !== user.id) return send(res, 403, { error: 'Not your attempt.' });
  if (a.status !== 'in_progress') {
    return send(res, 200, { attemptId: a.id, alreadyFinished: true, percent: a.percent, passed: a.passed });
  }
  if (typeof body.tabSwitches === 'number') a.tabSwitches = Math.max(0, Math.round(body.tabSwitches));
  a.submittedAt = now();
  a.status = now() > a.endsAt ? 'expired' : 'submitted';
  finishAttempt(a); // ---- instant, automated grading happens HERE ----
  notifySubmission(byId(db.quizzes, a.quizId), a, a.status === 'expired' ? 'expired' : 'submitted');
  saveDb();
  send(res, 200, {
    attemptId: a.id, status: a.status, score: a.score, maxScore: a.maxScore,
    percent: a.percent, passed: a.passed
  });
});

/* Tab-switch signal from the quiz runner — enforces the quiz's anti-cheat policy. */
route('POST', '/api/attempts/([A-Za-z0-9_]+)/tabswitch', async ({ user, params, body, res }) => {
  if (!user) return send(res, 401, { error: 'Sign in required.' });
  const a = db.attempts.find((x) => x.id === params[0]);
  if (!a) return send(res, 404, { error: 'Attempt not found.' });
  if (a.userId !== user.id) return send(res, 403, { error: 'Not your attempt.' });
  if (typeof body.tabSwitches === 'number') a.tabSwitches = Math.max(a.tabSwitches || 0, Math.round(body.tabSwitches));
  if (a.status !== 'in_progress') { saveDb(); return send(res, 200, { autoSubmitted: false, alreadyFinished: true }); }
  const quiz = byId(db.quizzes, a.quizId);
  if (quiz && quiz.tabSwitchPolicy === 'autosubmit') {
    a.status = 'submitted';
    a.submittedAt = now();
    a.autoSubmittedReason = 'tab_switch';
    finishAttempt(a);
    notifySubmission(quiz, a, 'tabswitch');
    saveDb();
    return send(res, 200, { autoSubmitted: true, attemptId: a.id, percent: a.percent, passed: a.passed });
  }
  saveDb();
  send(res, 200, { autoSubmitted: false });
});

route('GET', '/api/me/attempts', async ({ user, res }) => {
  if (!user) return send(res, 401, { error: 'Sign in required.' });
  expireStale();
  const rows = db.attempts
    .filter((a) => a.userId === user.id)
    .map((a) => ({
      id: a.id, quizId: a.quizId, quizTitle: (byId(db.quizzes, a.quizId) || {}).title || '(deleted quiz)',
      status: a.status, score: a.score, maxScore: a.maxScore, percent: a.percent, passed: a.passed,
      submittedAt: a.submittedAt || null, startedAt: a.startedAt, durationUsedSec: a.durationUsedSec || null
    }))
    .sort((x, y) => (y.submittedAt || y.startedAt) - (x.submittedAt || x.startedAt));
  send(res, 200, { attempts: rows });
});

/* ======== MONITORING / ANALYTICS (teacher) ======== */
route('GET', '/api/quizzes/([A-Za-z0-9_]+)/monitor', async ({ user, params, res }) => {
  if (!isTeacher(user)) return send(res, user ? 403 : 401, { error: 'Teachers only.' });
  expireStale();
  const quiz = byId(db.quizzes, params[0]);
  if (!quiz) return send(res, 404, { error: 'Quiz not found.' });
  const qs = (db.questions[quiz.id] || []).filter((q) => !q.draft);
  const atts = db.attempts.filter((a) => a.quizId === quiz.id);
  const rows = atts.map((a) => {
    const u = byId(db.users, a.userId) || { name: 'Unknown' };
    const answered = Object.values(a.answers || {}).filter((v) => v !== null && v !== undefined).length;
    return {
      id: a.id, student: u.name, status: a.status, answered, total: qs.length, endsAt: a.endsAt,
      percent: a.status !== 'in_progress' ? a.percent : null,
      passed: a.status !== 'in_progress' ? a.passed : null,
      score: a.status !== 'in_progress' ? (a.score + '/' + a.maxScore) : null,
      durationUsedSec: a.durationUsedSec || null, submittedAt: a.submittedAt || null,
      tabSwitches: a.tabSwitches || 0
    };
  }).sort((x, y) => (x.status === 'in_progress' ? 0 : 1) - (y.status === 'in_progress' ? 0 : 1) || (y.percent ?? -1) - (x.percent ?? -1));
  const done = atts.filter((a) => a.status !== 'in_progress');
  const notStarted = db.users
    .filter((u) => u.role === 'student' && !atts.some((a) => a.userId === u.id))
    .map((u) => u.name);
  send(res, 200, {
    quiz: meta(quiz), serverNow: now(),
    summary: {
      total: atts.length, inProgress: atts.length - done.length,
      submitted: done.filter((a) => a.status === 'submitted').length,
      expired: done.filter((a) => a.status === 'expired').length,
      avgPercent: done.length ? Math.round(done.reduce((s, a) => s + a.percent, 0) / done.length * 10) / 10 : null
    },
    rows, notStarted
  });
});

route('GET', '/api/quizzes/([A-Za-z0-9_]+)/attempts', async ({ user, params, res }) => {
  if (!isTeacher(user)) return send(res, user ? 403 : 401, { error: 'Teachers only.' });
  expireStale();
  const quiz = byId(db.quizzes, params[0]);
  if (!quiz) return send(res, 404, { error: 'Quiz not found.' });
  const rows = db.attempts
    .filter((a) => a.quizId === quiz.id && a.status !== 'in_progress')
    .map((a) => ({
      id: a.id, student: (byId(db.users, a.userId) || { name: 'Unknown' }).name,
      status: a.status, score: a.score, maxScore: a.maxScore, percent: a.percent, passed: a.passed,
      durationUsedSec: a.durationUsedSec, submittedAt: a.submittedAt, tabSwitches: a.tabSwitches || 0
    }))
    .sort((x, y) => y.submittedAt - x.submittedAt);
  send(res, 200, { quiz: meta(quiz), rows });
});

route('GET', '/api/quizzes/([A-Za-z0-9_]+)/analytics', async ({ user, params, res }) => {
  if (!isTeacher(user)) return send(res, user ? 403 : 401, { error: 'Teachers only.' });
  expireStale();
  const quiz = byId(db.quizzes, params[0]);
  if (!quiz) return send(res, 404, { error: 'Quiz not found.' });
  const qs = (db.questions[quiz.id] || []).filter((q) => !q.draft);
  const done = db.attempts.filter((a) => a.quizId === quiz.id && a.status !== 'in_progress');

  // score distribution (5 bands)
  const bands = [0, 0, 0, 0, 0];
  done.forEach((a) => { bands[clamp(Math.floor(a.percent / 20), 0, 4)]++; });
  const labels = ['0–19%', '20–39%', '40–59%', '60–79%', '80–100%'];

  // per-question item analysis (facility index = fraction correct)
  const items = qs.map((q, i) => {
    let correct = 0, skipped = 0;
    for (const a of done) {
      const r = (a.review || []).find((x) => x.questionId === q.id);
      if (!r) continue;
      if (r.correct) correct++;
      else if (r.given === null) skipped++;
    }
    const facility = done.length ? correct / done.length : 0;
    return {
      index: i + 1, id: q.id, text: q.text, type: q.type, points: q.points,
      attempts: done.length, correct, skipped, wrong: done.length - correct - skipped,
      facility: Math.round(facility * 100),
      difficulty: facility >= 0.7 ? 'Easy' : facility >= 0.4 ? 'Moderate' : 'Hard'
    };
  });

  // leaderboard — best attempt per student
  const bestByUser = {};
  for (const a of done) {
    const b = bestByUser[a.userId];
    if (!b || a.percent > b.percent || (a.percent === b.percent && a.durationUsedSec < b.durationUsedSec)) bestByUser[a.userId] = a;
  }
  const leaderboard = Object.values(bestByUser)
    .map((a) => ({
      name: (byId(db.users, a.userId) || { name: 'Unknown' }).name,
      score: a.score, maxScore: a.maxScore, percent: a.percent, passed: a.passed,
      durationUsedSec: a.durationUsedSec, submittedAt: a.submittedAt
    }))
    .sort((x, y) => y.percent - x.percent || x.durationUsedSec - y.durationUsedSec)
    .slice(0, 10);

  send(res, 200, {
    quiz: meta(quiz),
    stats: {
      attempts: done.length,
      avgPercent: done.length ? Math.round(done.reduce((s, a) => s + a.percent, 0) / done.length * 10) / 10 : null,
      highest: done.length ? Math.max(...done.map((a) => a.percent)) : null,
      lowest: done.length ? Math.min(...done.map((a) => a.percent)) : null,
      passRate: done.length ? Math.round(done.filter((a) => a.passed).length / done.length * 1000) / 10 : null,
      avgDurationSec: done.length ? Math.round(done.reduce((s, a) => s + a.durationUsedSec, 0) / done.length) : null
    },
    distribution: bands.map((count, i) => ({ label: labels[i], count })),
    items, leaderboard
  });
});

/* ======== STUDENTS (teacher) ======== */
route('GET', '/api/students', async ({ user, res }) => {
  if (!isTeacher(user)) return send(res, user ? 403 : 401, { error: 'Teachers only.' });
  expireStale();
  const students = db.users
    .filter((u) => u.role === 'student')
    .map((u) => {
      const mine = db.attempts.filter((a) => a.userId === u.id && a.status !== 'in_progress');
      const quizIds = [...new Set(mine.map((a) => a.quizId))];
      let sumBest = 0;
      for (const qid of quizIds) sumBest += Math.max(...mine.filter((a) => a.quizId === qid).map((a) => a.percent));
      return {
        id: u.id, name: u.name, email: u.email, createdAt: u.createdAt,
        classes: db.classes
          .filter((c) => (c.studentIds || []).includes(u.id))
          .map((c) => ({ id: c.id, name: c.name, color: c.color || null })),
        attempts: mine.length, quizzesTaken: quizIds.length,
        avgPercent: mine.length ? Math.round(mine.reduce((s2, a) => s2 + a.percent, 0) / mine.length * 10) / 10 : null,
        bestPercent: mine.length ? Math.max(...mine.map((a) => a.percent)) : null,
        lastActivity: mine.length ? Math.max(...mine.map((a) => a.submittedAt || a.startedAt)) : null,
        inProgress: db.attempts.some((a) => a.userId === u.id && a.status === 'in_progress')
      };
    })
    .sort((a, b) => (b.lastActivity || 0) - (a.lastActivity || 0) || a.name.localeCompare(b.name));
  send(res, 200, { students });
});

route('GET', '/api/students/([A-Za-z0-9_]+)/history', async ({ user, params, res }) => {
  if (!isTeacher(user)) return send(res, user ? 403 : 401, { error: 'Teachers only.' });
  expireStale();
  const stu = byId(db.users, params[0]);
  if (!stu || stu.role !== 'student') return send(res, 404, { error: 'Student not found.' });
  const attempts = db.attempts
    .filter((a) => a.userId === stu.id)
    .map((a) => ({
      id: a.id, quizId: a.quizId, quizTitle: (byId(db.quizzes, a.quizId) || { title: '(deleted quiz)' }).title,
      status: a.status, score: a.score, maxScore: a.maxScore, percent: a.percent, passed: a.passed,
      submittedAt: a.submittedAt || null, startedAt: a.startedAt,
      durationUsedSec: a.durationUsedSec || null, tabSwitches: a.tabSwitches || 0
    }))
    .sort((x, y) => (y.submittedAt || y.startedAt) - (x.submittedAt || x.startedAt));
  send(res, 200, { student: publicUser(stu), attempts });
});

/* ======== DATA BACKUP (teacher) ======== */
route('GET', '/api/admin/export', async ({ user, res }) => {
  if (!isTeacher(user)) return send(res, user ? 403 : 401, { error: 'Teachers only.' });
  const copy = Object.assign({}, db, { sessions: {} }); // never export session tokens
  send(res, 200, copy);
});

route('POST', '/api/admin/import', async ({ user, req, body, res }) => {
  if (!isTeacher(user)) return send(res, user ? 403 : 401, { error: 'Teachers only.' });
  const b = (body && body.data && body.data.users) ? body.data : body;
  if (!b || !Array.isArray(b.users) || !Array.isArray(b.quizzes) ||
      typeof b.questions !== 'object' || !Array.isArray(b.attempts)) {
    return send(res, 400, { error: 'Invalid backup file — expected a ClassMark database export (JSON).' });
  }
  applyDbData(b);
  // keep the importing teacher signed in after the swap
  const m = String(req.headers['authorization'] || '').match(/^Bearer (.+)$/);
  if (m && db.users.some((u) => u.id === user.id)) db.sessions[m[1]] = { userId: user.id, createdAt: now() };
  for (const k of Object.keys(db.sessions)) {
    if (!db.users.some((u) => u.id === db.sessions[k].userId)) delete db.sessions[k];
  }
  saveDb();
  send(res, 200, { ok: true, users: db.users.length, quizzes: db.quizzes.length, attempts: db.attempts.length });
});

function applyDbData(b) { // swap in a validated database (sessions handled by caller)
  db = {
    users: b.users,
    quizzes: b.quizzes,
    questions: b.questions || {},
    attempts: b.attempts,
    notifications: Array.isArray(b.notifications) ? b.notifications : [],
    classes: Array.isArray(b.classes) ? b.classes : [],
    sessions: (b.sessions && typeof b.sessions === 'object' && !Array.isArray(b.sessions)) ? b.sessions : {}
  };
}

/* ======== NOTIFICATIONS (teacher) ======== */
route('GET', '/api/notifications', async ({ user, res }) => {
  if (!user) return send(res, 401, { error: 'Sign in required.' });
  expireStale();
  const mine = db.notifications
    .filter((n) => n.userId === user.id)
    .sort((x, y) => y.createdAt - x.createdAt);
  // group by quiz, newest activity first — multiple notifications stay sorted by quiz
  const seen = new Map();
  const groups = [];
  for (const n of mine) {
    let g = seen.get(n.quizId);
    if (!g) {
      const qz = byId(db.quizzes, n.quizId);
      const cls = qz && (qz.classes || []).length ? byId(db.classes, qz.classes[0]) : null;
      g = { quizId: n.quizId, quizTitle: n.quizTitle || '(deleted quiz)', unread: 0, latestAt: n.createdAt, color: cls ? (cls.color || null) : null, items: [] };
      seen.set(n.quizId, g);
      groups.push(g);
    }
    if (!n.read) g.unread++;
    g.items.push(n);
  }
  send(res, 200, { unread: mine.filter((n) => !n.read).length, groups, serverNow: now() });
});

route('POST', '/api/notifications/read', async ({ user, body, res }) => {
  if (!user) return send(res, 401, { error: 'Sign in required.' });
  let changed = 0;
  for (const n of db.notifications) {
    if (n.userId !== user.id || n.read) continue;
    if (!body.id || n.id === body.id) { n.read = true; changed++; }
  }
  if (changed) saveDb();
  send(res, 200, { ok: true, changed });
});

route('DELETE', '/api/notifications', async ({ user, res }) => {
  if (!user) return send(res, 401, { error: 'Sign in required.' });
  const before = db.notifications.length;
  db.notifications = db.notifications.filter((n) => n.userId !== user.id);
  if (db.notifications.length !== before) saveDb();
  send(res, 200, { ok: true });
});


/* ======== PROFILE (self-service editing) ======== */
route('PUT', '/api/auth/profile', async ({ user, body, req, res }) => {
  if (!user) return send(res, 401, { error: 'Sign in required.' });
  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const curPw = String(body.currentPassword || '');
  const newPw = String(body.newPassword || '');
  if (name.length < 2) return send(res, 400, { error: 'Please enter your full name (at least 2 characters).' });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return send(res, 400, { error: 'Please enter a valid email address.' });
  if (user.pass !== hashPw(curPw, user.salt)) return send(res, 403, { error: 'Current password is incorrect.' });
  if (db.users.some((u) => u.email === email && u.id !== user.id)) {
    return send(res, 409, { error: 'Another account already uses that email address.' });
  }
  if (newPw && newPw.length < 6) return send(res, 400, { error: 'New password must be at least 6 characters.' });
  const emailChanged = email !== user.email;
  user.name = name;
  user.email = email;
  if (newPw) {
    const salt = crypto.randomBytes(8).toString('hex');
    user.salt = salt;
    user.pass = hashPw(newPw, salt);
    // a password change signs out every other device; this one stays signed in
    const keepTok = String(req.headers['authorization'] || '').match(/^Bearer (.+)$/);
    for (const k of Object.keys(db.sessions)) {
      if (db.sessions[k].userId === user.id && (!keepTok || k !== keepTok[1])) delete db.sessions[k];
    }
  }
  saveDb();
  send(res, 200, { user: publicUser(user), emailChanged, passwordChanged: !!newPw });
});

/* ======== CLASSES ======== */
route('GET', '/api/classes/mine', async ({ user, res }) => {
  if (!user) return send(res, 401, { error: 'Sign in required.' });
  if (!isTeacher(user)) return send(res, 403, { error: 'Teachers only.' });
  const mine = db.classes.filter((x) => x.teacherId === user.id).map(classPublic);
  send(res, 200, { classes: mine });
});

route('POST', '/api/classes', async ({ user, body, res }) => {
  if (!user) return send(res, 401, { error: 'Sign in required.' });
  if (!isTeacher(user)) return send(res, 403, { error: 'Teachers only.' });
  if (db.classes.filter((x) => x.teacherId === user.id).length >= 12) {
    return send(res, 400, { error: 'Class limit reached (12).' });
  }
  const name = String(body.name || '').trim();
  if (name.length < 2) return send(res, 400, { error: 'Please enter a class name (at least 2 characters).' });
  const c = { id: uid('cls'), name, code: genClassCode(), teacherId: user.id, studentIds: [], createdAt: now() };
  db.classes.push(c);
  saveDb();
  send(res, 201, { class: classPublic(c) });
});

route('GET', '/api/classes', async ({ user, res }) => {
  if (!user) return send(res, 401, { error: 'Sign in required.' });
  if (isTeacher(user)) {
    const own = db.classes.filter((c) => c.teacherId === user.id).map(classPublic);
    return send(res, 200, { classes: own });
  }
  const mine = db.classes.filter((c) => (c.studentIds || []).includes(user.id)).map(classPublic);
  send(res, 200, { classes: mine });
});

route('POST', '/api/classes/join', async ({ user, body, res }) => {
  if (!user) return send(res, 401, { error: 'Sign in required.' });
  if (isTeacher(user)) return send(res, 403, { error: 'Only students join classes with a code.' });
  const code = String(body.code || '').trim().toUpperCase();
  if (code.length < 4) return send(res, 400, { error: 'Enter the class code from your teacher.' });
  const c = db.classes.find((x) => x.code === code);
  if (!c) return send(res, 404, { error: 'Class code not found — check it with your teacher.' });
  if ((c.studentIds || []).includes(user.id)) {
    return send(res, 400, { error: 'You have already joined ' + c.name + '.' });
  }
  c.studentIds = c.studentIds || [];
  c.studentIds.push(user.id);
  // welcome alerts: quizzes already published in this class, so a late joiner misses nothing
  const teacher = byId(db.users, c.teacherId);
  for (const q of db.quizzes) {
    if (q.published && (q.classes || []).includes(c.id)) {
      db.notifications.push({
        id: uid('n'), userId: user.id, quizId: q.id, quizTitle: q.title,
        type: 'published', teacherName: teacher ? teacher.name : 'Your teacher',
        createdAt: now(), read: false
      });
    }
  }
  saveDb();
  send(res, 200, { class: classPublic(c) });
});

route('GET', '/api/classes/([A-Za-z0-9_]+)', async ({ user, params, res }) => {
  if (!user) return send(res, 401, { error: 'Sign in required.' });
  const c = byId(db.classes, params[0]);
  if (!c) return send(res, 404, { error: 'Class not found.' });
  const isOwner = isTeacher(user) && c.teacherId === user.id;
  const isMember = (c.studentIds || []).includes(user.id);
  if (!isOwner && !isMember) return send(res, 403, { error: 'You are not a member of this class.' });
  const quizzes = db.quizzes
    .filter((q) => (q.classes || []).includes(c.id))
    .filter((q) => isOwner || (q.published && canSeeQuiz(user, q)))
    .map((q) => quizFor(q, user))
    .sort((a, b) => b.createdAt - a.createdAt);
  const out = { class: classPublic(c), quizzes };
  if (isOwner) {
    out.members = (c.studentIds || [])
      .map((sid) => byId(db.users, sid))
      .filter(Boolean)
      .map(studentStat)
      .sort((a, b) => (b.lastActivity || 0) - (a.lastActivity || 0));
  }
  send(res, 200, out);
});

route('PUT', '/api/classes/([A-Za-z0-9_]+)', async ({ user, params, body, res }) => {
  if (!isTeacher(user)) return send(res, user ? 403 : 401, { error: 'Teachers only.' });
  const c = byId(db.classes, params[0]);
  if (!c) return send(res, 404, { error: 'Class not found.' });
  if (c.teacherId !== user.id) return send(res, 403, { error: 'This class belongs to another teacher.' });
  if (body.name !== undefined) {
    const name = String(body.name || '').trim();
    if (name.length < 2) return send(res, 400, { error: 'Class name must be at least 2 characters.' });
    c.name = name;
  }
  if (body.color !== undefined) {
    const color = String(body.color || '').trim();
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) return send(res, 400, { error: 'Invalid color.' });
    c.color = color;
  }
  saveDb();
  send(res, 200, { class: classPublic(c) });
});

route('POST', '/api/classes/([A-Za-z0-9_]+)/kick', async ({ user, params, body, res }) => {
  if (!isTeacher(user)) return send(res, user ? 403 : 401, { error: 'Teachers only.' });
  const c = byId(db.classes, params[0]);
  if (!c) return send(res, 404, { error: 'Class not found.' });
  if (c.teacherId !== user.id) return send(res, 403, { error: 'This class belongs to another teacher.' });
  const sid = String(body.studentId || '');
  const student = byId(db.users, sid);
  if (!student || !(c.studentIds || []).includes(sid)) {
    return send(res, 404, { error: 'That student is not a member of this class.' });
  }
  c.studentIds = c.studentIds.filter((x) => x !== sid);
  saveDb();
  send(res, 200, { ok: true, memberCount: c.studentIds.length });
});

/* ======== CLOUD SAVE (encrypted GitHub branch) ======== */
const CLOUD_REPO   = process.env.OQAS_CLOUD_REPO   || 'Immanuel9567/A-WEB-BASED-ONLINE-QUIZ-';
const CLOUD_BRANCH = process.env.OQAS_CLOUD_BRANCH || 'cloud-data';
const CLOUD_FILE   = process.env.OQAS_CLOUD_PATH   || 'cloud/db.json';
const GH = 'https://api.github.com';

function cloudConfigPaths() { // first existing wins; connect writes to all
  const list = [];
  if (process.env.OQAS_CLOUD_CONFIG) list.push(process.env.OQAS_CLOUD_CONFIG);
  list.push(path.join(__dirname, 'data', 'cloud.json')); // portable default
  list.push('/home/user/.oqas-cloud.json');              // sandbox-persistent copy
  return list;
}
let cloudCfg = null;
function loadCloudCfg() {
  cloudCfg = null;
  for (const p of cloudConfigPaths()) {
    try {
      const c = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (c && c.token && c.passphrase) { cloudCfg = c; cloudCfg.via = 'file'; return; }
    } catch (e) { /* keep looking */ }
  }
  // environment fallback — for hosts (Render, Railway, Fly…) whose disk resets on restart.
  // Set OQAS_CLOUD_TOKEN and OQAS_CLOUD_PASSPHRASE to keep cloud save connected permanently.
  if (process.env.OQAS_CLOUD_TOKEN && process.env.OQAS_CLOUD_PASSPHRASE) {
    cloudCfg = { token: process.env.OQAS_CLOUD_TOKEN, passphrase: process.env.OQAS_CLOUD_PASSPHRASE, via: 'env' };
  }
}
loadCloudCfg();

const cloudState = { lastSavedAt: null, lastError: null, saving: false };

function cloudEncrypt(obj, passphrase) {
  const salt = crypto.randomBytes(12), iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(passphrase, salt, 32);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(JSON.stringify(obj), 'utf8'), cipher.final()]);
  return {
    app: 'OQAS', v: 1, enc: 'aes-256-gcm',
    salt: salt.toString('base64'), iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: ct.toString('base64'), savedAt: now()
  };
}
function cloudDecrypt(payload, passphrase) {
  const key = crypto.scryptSync(passphrase, Buffer.from(payload.salt, 'base64'), 32);
  const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(payload.iv, 'base64'));
  d.setAuthTag(Buffer.from(payload.tag, 'base64'));
  return JSON.parse(Buffer.concat([d.update(Buffer.from(payload.data, 'base64')), d.final()]).toString('utf8'));
}

async function ghFetch(token, url, opts) {
  const headers = Object.assign(
    { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'User-Agent': 'oqas-app' },
    (opts && opts.headers) || {}
  );
  return fetch(url, Object.assign({}, opts, { headers }));
}
async function ensureCloudBranch(token) {
  const ref = await ghFetch(token, GH + '/repos/' + CLOUD_REPO + '/git/ref/heads/' + CLOUD_BRANCH);
  if (ref.status === 200) return;
  if (ref.status !== 404) throw new Error('GitHub: cannot check branch (HTTP ' + ref.status + ')');
  const repo = await (await ghFetch(token, GH + '/repos/' + CLOUD_REPO)).json();
  if (!repo || !repo.default_branch) throw new Error('GitHub: cannot read repository.');
  const head = await ghFetch(token, GH + '/repos/' + CLOUD_REPO + '/git/ref/heads/' + repo.default_branch);
  const hj = await head.json();
  if (!hj || !hj.object || !hj.object.sha) throw new Error('GitHub: cannot read default branch.');
  const mk = await ghFetch(token, GH + '/repos/' + CLOUD_REPO + '/git/refs', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref: 'refs/heads/' + CLOUD_BRANCH, sha: hj.object.sha })
  });
  if (mk.status !== 201) throw new Error('GitHub: cannot create cloud branch.');
}

async function cloudSaveNow() {
  if (!cloudCfg) throw new Error('Cloud storage is not connected yet.');
  if (cloudState.saving) return null;
  cloudState.saving = true;
  try {
    await ensureCloudBranch(cloudCfg.token);
    const payload = cloudEncrypt(db, cloudCfg.passphrase); // sessions included (encrypted) — logins survive restarts
    const content = Buffer.from(JSON.stringify(payload, null, 1)).toString('base64');
    const g = await ghFetch(cloudCfg.token, GH + '/repos/' + CLOUD_REPO + '/contents/' + CLOUD_FILE + '?ref=' + CLOUD_BRANCH + '&nocache=' + now());
    const body = { message: 'ClassMark cloud save ' + new Date().toISOString(), branch: CLOUD_BRANCH, content };
    if (g.status === 200) body.sha = (await g.json()).sha; // update existing file
    else if (g.status !== 404) throw new Error('GitHub read failed (HTTP ' + g.status + ')');
    const p = await ghFetch(cloudCfg.token, GH + '/repos/' + CLOUD_REPO + '/contents/' + CLOUD_FILE, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    if (p.status !== 200 && p.status !== 201) {
      const j = await p.json().catch(() => null);
      throw new Error('GitHub write failed: ' + ((j && j.message) || ('HTTP ' + p.status)));
    }
    cloudState.lastSavedAt = now();
    cloudState.lastError = null;
    return { savedAt: cloudState.lastSavedAt };
  } catch (e) {
    cloudState.lastError = String((e && e.message) || e);
    throw e;
  } finally {
    cloudState.saving = false;
  }
}

let cloudTimer = null, cloudSuppress = 0;
function scheduleCloudSave() { // debounced auto-save after local writes
  if (!cloudCfg || cloudSuppress) return;
  if (cloudTimer) clearTimeout(cloudTimer);
  cloudTimer = setTimeout(() => {
    cloudTimer = null;
    cloudSaveNow().catch((e) => console.error('cloud: auto-save failed -', e.message));
  }, 1500);
}
if (cloudTimer && cloudTimer.unref) cloudTimer.unref();

async function cloudFetchData() { // -> decrypted db object | null (nothing in cloud)
  if (!cloudCfg) return null;
  await ensureCloudBranch(cloudCfg.token);
  const g = await ghFetch(cloudCfg.token, GH + '/repos/' + CLOUD_REPO + '/contents/' + CLOUD_FILE + '?ref=' + CLOUD_BRANCH + '&nocache=' + now());
  if (g.status === 404) return null;
  if (g.status !== 200) throw new Error('GitHub read failed (HTTP ' + g.status + ')');
  const j = await g.json();
  const payload = JSON.parse(Buffer.from(j.content, 'base64').toString('utf8'));
  if (!payload || payload.app !== 'OQAS' || payload.enc !== 'aes-256-gcm') return null;
  // remember when the cloud copy was last saved so the status card is accurate on boot
  if (payload.savedAt && !cloudState.lastSavedAt) cloudState.lastSavedAt = payload.savedAt;
  return cloudDecrypt(payload, cloudCfg.passphrase);
}

route('GET', '/api/admin/cloud/status', async ({ user, res }) => {
  if (!isTeacher(user)) return send(res, user ? 403 : 401, { error: 'Teachers only.' });
  send(res, 200, {
    connected: !!cloudCfg, via: cloudCfg ? (cloudCfg.via || 'file') : null, repo: CLOUD_REPO, branch: CLOUD_BRANCH,
    lastSavedAt: cloudState.lastSavedAt, lastError: cloudState.lastError,
    saving: cloudState.saving, autoSave: true,
    users: db.users.length, quizzes: db.quizzes.length, attempts: db.attempts.length
  });
});

route('POST', '/api/admin/cloud/connect', async ({ user, body, res }) => {
  if (!isTeacher(user)) return send(res, user ? 403 : 401, { error: 'Teachers only.' });
  const token = String(body.token || '').trim();
  const passphrase = String(body.passphrase || '');
  if (!token) return send(res, 400, { error: 'Paste a GitHub personal access token.' });
  if (passphrase.length < 6) return send(res, 400, { error: 'Choose a cloud passphrase of at least 6 characters.' });
  const chk = await ghFetch(token, GH + '/repos/' + CLOUD_REPO);
  if (chk.status !== 200) {
    return send(res, 400, { error: 'Token cannot write to ' + CLOUD_REPO + ' (HTTP ' + chk.status + '). Give the token Contents: Read and write permission.' });
  }
  cloudCfg = { token, passphrase };
  let wrote = 0;
  for (const p of cloudConfigPaths()) {
    try { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(cloudCfg, null, 1)); wrote++; } catch (e) { /* best effort */ }
  }
  if (!wrote) { cloudCfg = null; return send(res, 500, { error: 'Could not write the cloud config file on this server.' }); }
  try { await cloudSaveNow(); } catch (e) { /* connected but first save failed — surfaced via status */ }
  send(res, 200, { ok: true, connected: true, lastSavedAt: cloudState.lastSavedAt, lastError: cloudState.lastError });
});

route('POST', '/api/admin/cloud/save', async ({ user, res }) => {
  if (!isTeacher(user)) return send(res, user ? 403 : 401, { error: 'Teachers only.' });
  try {
    const r = await cloudSaveNow();
    send(res, 200, { ok: true, savedAt: (r && r.savedAt) || cloudState.lastSavedAt });
  } catch (e) { send(res, 502, { error: 'Cloud save failed: ' + e.message }); }
});

route('POST', '/api/admin/cloud/restore', async ({ user, res }) => {
  if (!isTeacher(user)) return send(res, user ? 403 : 401, { error: 'Teachers only.' });
  let data = null;
  try { data = await cloudFetchData(); } catch (e) { return send(res, 502, { error: 'Cloud read failed: ' + e.message }); }
  if (!data) return send(res, 404, { error: 'No cloud backup found yet — save once first.' });
  if (!Array.isArray(data.users) || !Array.isArray(data.quizzes) ||
      typeof data.questions !== 'object' || !Array.isArray(data.attempts)) {
    return send(res, 400, { error: 'The cloud backup is not a valid ClassMark database.' });
  }
  const keepSessions = db.sessions; // nobody gets signed out by a restore
  cloudSuppress++;
  try {
    applyDbData(data);
    db.sessions = Object.assign({}, db.sessions, keepSessions); // backup sessions + live ones
    for (const k of Object.keys(db.sessions)) {
      if (!db.users.some((u) => u.id === db.sessions[k].userId)) delete db.sessions[k];
    }
    saveDb();
  } finally { cloudSuppress--; }
  send(res, 200, { ok: true, users: db.users.length, quizzes: db.quizzes.length, attempts: db.attempts.length });
});

async function cloudStartupRestore() { // reconcile local vs cloud before serving
  if (!cloudCfg) return;
  let data = null;
  try { data = await cloudFetchData(); }
  catch (e) { console.error('cloud: read failed -', e.message); return; }
  if (!data || !Array.isArray(data.users)) {
    console.log('cloud: connected, no saved data yet - starting fresh');
    return;
  }
  const cloudAt = data.updatedAt || 0;
  const localAt = db.updatedAt || 0;
  if (!dbSeeded && localAt > cloudAt + 1000) {
    // local file is newer than the cloud copy (a save never landed) — keep local
    console.log('cloud: local data is newer - keeping it (' + db.users.length + ' users, ' + db.quizzes.length + ' quizzes)');
    return;
  }
  try {
    // cloud wins — but rescue any local accounts the cloud copy does not have,
    // so a registration can never be lost by a restore
    const ids = new Set(data.users.map((u) => u.id));
    const rescue = db.users.filter((u) => !ids.has(u.id));
    if (rescue.length) data.users = data.users.concat(rescue);
    const localSessions = db.sessions;
    cloudSuppress++;
    try {
      applyDbData(data);
      // persistent logins: keep the backup's sessions and the local ones
      db.sessions = Object.assign({}, db.sessions, localSessions);
      for (const k of Object.keys(db.sessions)) {
        if (!db.users.some((u) => u.id === db.sessions[k].userId)) delete db.sessions[k];
      }
      saveDb();
    } finally { cloudSuppress--; }
    console.log('cloud: restored ' + db.users.length + ' users, ' + db.quizzes.length + ' quizzes, ' + db.attempts.length + ' attempts' +
      (rescue.length ? ' (' + rescue.length + ' local account(s) rescued)' : ''));
  } catch (e) {
    console.error('cloud: restore skipped -', e.message);
  }
}

route('GET', '/api/health', async ({ res }) => send(res, 200, { ok: true, name: 'ClassMark API', time: now() }));

/* --------------------------------------------------------------- server     */
loadDb();

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://localhost');
    const p = decodeURIComponent(u.pathname);

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
      });
      return res.end();
    }

    for (const r of routes) {
      if (req.method !== r.method) continue;
      const m = p.match(r.re);
      if (!m) continue;
      const body = (req.method === 'POST' || req.method === 'PUT') ? await readBody(req) : {};
      const user = getUser(req);
      res.req = req; // for logout handler
      return await r.handler({ req, res, params: m.slice(1), body, user, query: u.searchParams });
    }

    if (p.startsWith('/api/')) return send(res, 404, { error: 'Endpoint not found.' });
    serveStatic(p, res);
  } catch (err) {
    try { send(res, 500, { error: 'Server error', detail: String((err && err.message) || err) }); } catch (e) {}
  }
});

function flushCloudAndExit() {
  if (cloudTimer) {
    console.log('cloud: flushing pending save before shutdown...');
    clearTimeout(cloudTimer);
    cloudTimer = null;
    const p = cloudSaveNow();
    if (p && p.finally) p.catch(() => {}).finally(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  } else if (cloudState.saving) {
    // a save is already in flight — give it a moment to land
    setTimeout(() => process.exit(0), 3000).unref();
  } else {
    process.exit(0);
  }
}
process.on('SIGTERM', flushCloudAndExit);
process.on('SIGINT', flushCloudAndExit);

function startListen() {
server.listen(PORT, '0.0.0.0', () => {
  console.log('==================================================');
  console.log('  ClassMark - Online Quiz & Assessment System');
  console.log('==================================================');
  console.log('  API + UI  ->  http://localhost:' + PORT);
  console.log('  Accounts  ->  none yet - register the first teacher at /login.html');
  console.log('  Cloud     ->  ' + (cloudCfg ? 'connected (' + CLOUD_BRANCH + ' branch, via ' + (cloudCfg.via || 'file') + ')' : 'not connected'));
  console.log('==================================================');
});
}
cloudStartupRestore().catch(function () {}).finally(startListen);
