/* ============================================================================
   OQAS — ONLINE QUIZ & AUTOMATED ASSESSMENT SYSTEM (Prototype)
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
const SESSION_TTL   = 7 * 24 * 3600 * 1000;  // one week

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
    published: !!q.published, createdAt: q.createdAt
  };
}
function publicQuestion(q) { // what a student may see BEFORE grading
  return q && { id: q.id, type: q.type, text: q.text, options: q.options, points: q.points };
}

/* ------------------------------------------------------------- data & seed  */
let db;

function saveDb() {
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 1));
  fs.renameSync(tmp, DB_FILE); // atomic replace
}

function seed() {
  const t = now();
  const mkUser = (name, email, pw, role) => {
    const salt = crypto.randomBytes(8).toString('hex');
    return { id: uid('u'), name, email, salt, pass: hashPw(pw, salt), role, createdAt: t };
  };

  const teacher = mkUser('Dr. Ada Obi', 'teacher@demo.com', 'teach123', 'teacher');
  const students = [
    mkUser('Chidi Okafor', 'student@demo.com', 'study123', 'student'),
    mkUser('Amara Bello',  'amara@demo.com',   'study123', 'student'),
    mkUser('Tunde Adeyemi','tunde@demo.com',   'study123', 'student'),
    mkUser('Fatima Yusuf', 'fatima@demo.com',  'study123', 'student'),
    mkUser('Emeka Nwosu',  'emeka@demo.com',   'study123', 'student'),
  ];
  const [chidi, amara, tunde, fatima, emeka] = students;

  const Q = (id, o) => Object.assign({ id, points: 1, explanation: '' }, o);

  const qz1 = { // CSC 101
    id: 'qz_csc101', title: 'Introduction to Computer Science', subject: 'Computer Science (CSC 101)',
    description: 'Test your grasp of core computing concepts — hardware, memory, number systems, software and the web.',
    durationMin: 15, passMark: 50, attemptsAllowed: 2, shuffle: true, shuffleOptions: true, tabSwitchPolicy: 'warn', published: true,
    createdAt: t - 72 * 3600e3, createdBy: teacher.id
  };
  const qs1 = [
    Q('qz_csc101_q1', { type:'single', text:'What does CPU stand for?',
      options:['Central Processing Unit','Computer Personal Unit','Central Program Utility','Control Processing Unit'],
      answer:0, points:2, explanation:'The CPU is the processor that executes program instructions — the "brain" of the computer.' }),
    Q('qz_csc101_q2', { type:'single', text:'Which of the following is an input device?',
      options:['Monitor','Keyboard','Printer','Speaker'], answer:1, points:2,
      explanation:'A keyboard sends data INTO the computer; the others are output devices.' }),
    Q('qz_csc101_q3', { type:'single', text:'RAM is best described as ___ memory.',
      options:['Non-volatile','Volatile','Permanent','Secondary'], answer:1, points:2,
      explanation:'RAM loses its contents when power is removed — it is volatile.' }),
    Q('qz_csc101_q4', { type:'single', text:'The binary number system uses only which digits?',
      options:['0 to 9','0 and 1','1 and 2','0, 1 and 2'], answer:1, points:2, explanation:'Binary is base 2: only 0 and 1.' }),
    Q('qz_csc101_q5', { type:'multiple', text:'Select ALL the output devices.',
      options:['Monitor','Scanner','Printer','Mouse'], answer:[0,2], points:3,
      explanation:'Monitors and printers produce output; scanners and mice are input devices.' }),
    Q('qz_csc101_q6', { type:'truefalse', text:'One kilobyte (KB) equals 1024 bytes.',
      options:['True','False'], answer:0, points:1, explanation:'In computing, 1 KB = 2¹⁰ = 1024 bytes.' }),
    Q('qz_csc101_q7', { type:'single', text:'Which of these is an operating system?',
      options:['Firefox','Linux','Photoshop','Excel'], answer:1, points:2,
      explanation:'Linux is system software; the rest are application programs.' }),
    Q('qz_csc101_q8', { type:'single', text:'HTML is primarily used to ___',
      options:['style web pages','structure web content','query databases','transfer files'], answer:1, points:2,
      explanation:'HTML provides structure; CSS handles styling and SQL queries databases.' }),
    Q('qz_csc101_q9', { type:'multiple', text:'Select ALL that are programming languages.',
      options:['Python','HTTP','C++','Windows'], answer:[0,2], points:3,
      explanation:'Python and C++ are languages; HTTP is a protocol and Windows is an OS.' }),
    Q('qz_csc101_q10',{ type:'truefalse', text:'The CPU is also known as the brain of the computer.',
      options:['True','False'], answer:0, points:1 }),
  ];

  const qz2 = { // Web Technology
    id: 'qz_web', title: 'Web Technology Fundamentals', subject: 'Web Technology',
    description: 'HTML, CSS, HTTP and the building blocks of the modern web.',
    durationMin: 10, passMark: 50, attemptsAllowed: 3, shuffle: true, shuffleOptions: false, tabSwitchPolicy: 'warn', published: true,
    createdAt: t - 48 * 3600e3, createdBy: teacher.id
  };
  const qs2 = [
    Q('qz_web_q1', { type:'single', text:'What does HTML stand for?',
      options:['HyperText Markup Language','HighText Machine Language','HyperTool Multi Language','Home Tool Markup Language'],
      answer:0, points:2, explanation:'HTML = HyperText Markup Language.' }),
    Q('qz_web_q2', { type:'single', text:'Which HTML tag is used to create a hyperlink?',
      options:['<link>','<a>','<href>','<url>'], answer:1, points:2, explanation:'The anchor tag <a> creates hyperlinks.' }),
    Q('qz_web_q3', { type:'single', text:'CSS is mainly used for ___',
      options:['data storage','presentation and styling','server-side scripting','routing requests'], answer:1, points:2 }),
    Q('qz_web_q4', { type:'single', text:'An HTTP 404 status code means ___',
      options:['OK','Unauthorized','Not Found','Server Error'], answer:2, points:2, explanation:'404 = the requested resource was not found.' }),
    Q('qz_web_q5', { type:'multiple', text:'Select ALL front-end technologies.',
      options:['HTML','CSS','JavaScript','MySQL'], answer:[0,1,2], points:3,
      explanation:'MySQL is a database — a back-end technology.' }),
    Q('qz_web_q6', { type:'truefalse', text:'JSON stands for JavaScript Object Notation.',
      options:['True','False'], answer:0, points:1 }),
    Q('qz_web_q7', { type:'single', text:'Which protocol is used to secure web traffic?',
      options:['FTP','HTTP','HTTPS','SMTP'], answer:2, points:2 }),
    Q('qz_web_q8', { type:'multiple', text:'Select ALL valid HTTP methods.',
      options:['GET','POST','RETRIEVE','FETCH'], answer:[0,1], points:3,
      explanation:'RETRIEVE and FETCH are not HTTP methods — try GET, POST, PUT, PATCH, DELETE…' }),
  ];

  const qz3 = { // draft quiz — demonstrates the publish workflow
    id: 'qz_apt', title: 'General Aptitude Test (Draft)', subject: 'General Aptitude',
    description: 'Logical reasoning and quantitative aptitude practice set.',
    durationMin: 10, passMark: 60, attemptsAllowed: 1, shuffle: false, shuffleOptions: false, tabSwitchPolicy: 'warn', published: false,
    createdAt: t - 6 * 3600e3, createdBy: teacher.id
  };
  const qs3 = [
    Q('qz_apt_q1', { type:'single', text:'A shirt costs ₦2,500 and is sold at a 20% discount. What is the selling price?',
      options:['₦2,000','₦2,100','₦2,300','₦2,400'], answer:0, points:2, explanation:'20% of 2500 = 500, so 2500 − 500 = ₦2,000.' }),
    Q('qz_apt_q2', { type:'single', text:'Complete the sequence: 2, 6, 12, 20, 30, ___',
      options:['36','40','42','44'], answer:2, points:2, explanation:'Differences grow by 2: +4, +6, +8, +10, +12 -> 42.' }),
    Q('qz_apt_q3', { type:'truefalse', text:'A square is a rectangle.',
      options:['True','False'], answer:0, points:1, explanation:'A square satisfies the definition of a rectangle (four right angles).' }),
    Q('qz_apt_q4', { type:'single', text:'Which is the odd one out?',
      options:['Triangle','Square','Circle','Pentagon'], answer:2, points:2,
      explanation:'A circle has no straight sides or vertices.' }),
    Q('qz_apt_q5', { type:'single', text:'If today is Wednesday, what day will it be in 10 days?',
      options:['Friday','Saturday','Sunday','Monday'], answer:1, points:2, explanation:'10 mod 7 = 3 -> Wednesday + 3 = Saturday.' }),
  ];

  db = {
    users: [teacher, ...students],
    quizzes: [qz1, qz2, qz3],
    questions: { [qz1.id]: qs1, [qz2.id]: qs2, [qz3.id]: qs3 },
    attempts: [],
    notifications: [],
    sessions: {}
  };

  // ---- seed historical attempts so analytics & leaderboards look alive ----
  const H = 3600e3;
  const mkA = (user, quiz, qs, correctCount, startedAt) => {
    const a = {
      id: uid('a'), quizId: quiz.id, userId: user.id, startedAt,
      endsAt: startedAt + quiz.durationMin * 60000, status: 'in_progress',
      answers: {}, tabSwitches: 0, questionOrder: null
    };
    qs.forEach((q, i) => {
      if (i < correctCount) a.answers[q.id] = (q.type === 'multiple') ? q.answer.slice() : q.answer;
      else if (i % 3 === 2) { /* left blank — skipped */ }
      else a.answers[q.id] = (q.type === 'multiple') ? [0] : (q.answer + 1) % q.options.length;
    });
    a.submittedAt = startedAt + (300 + ((correctCount * 47) % 480)) * 1000;
    return a;
  };

  db.attempts.push(
    mkA(chidi,  qz1, qs1, 9, t - 26 * H),   // ≈ 95%
    mkA(amara,  qz1, qs1, 7, t - 25 * H),   // ≈ 70%
    mkA(tunde,  qz1, qs1, 6, t - 23 * H),   // ≈ 60%
    mkA(fatima, qz1, qs1, 4, t - 20 * H),   // ≈ 40% (fail)
    mkA(emeka,  qz1, qs1, 8, t - 18 * H),   // ≈ 85%
    mkA(chidi,  qz2, qs2, 7, t -  9 * H),   // ≈ 82%
    mkA(tunde,  qz2, qs2, 5, t -  7 * H),   // ≈ 65%
    mkA(emeka,  qz2, qs2, 6, t -  5 * H),   // ≈ 76%
  );
  db.attempts.forEach((a) => { a.status = 'submitted'; finishAttempt(a); });

  // seed a couple of teacher notifications so the bell has history
  const recent = db.attempts.slice().sort((x, y) => y.submittedAt - x.submittedAt).slice(0, 2);
  recent.forEach((a, i) => {
    const quiz = byId(db.quizzes, a.quizId);
    db.notifications.push({
      id: uid('n'), userId: quiz.createdBy, quizId: quiz.id, quizTitle: quiz.title,
      attemptId: a.id, studentName: (byId(db.users, a.userId) || { name: 'Student' }).name,
      type: 'submitted', percent: a.percent, score: a.score, maxScore: a.maxScore,
      passed: a.passed, createdAt: a.submittedAt, read: i !== 0 // newest stays unread
    });
  });

  // one live, in-progress attempt (Amara, started ~90s ago) for the live monitor
  db.attempts.push({
    id: uid('a'), quizId: qz2.id, userId: amara.id, startedAt: t - 90e3,
    endsAt: t - 90e3 + qz2.durationMin * 60000, status: 'in_progress',
    answers: { [qs2[0].id]: qs2[0].answer, [qs2[2].id]: qs2[2].answer },
    tabSwitches: 0, questionOrder: null
  });

  saveDb();
}

function loadDb() {
  try {
    db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    if (!db || !Array.isArray(db.users)) throw new Error('corrupt');
  } catch (e) {
    seed();
  }
  if (!db.notifications) db.notifications = []; // migration for older stores
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
      explanation: q.explanation || ''
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
      if (data.length > 1e6) { reject(new Error('Payload too large')); req.destroy(); }
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
  const token = crypto.randomBytes(24).toString('hex');
  db.sessions[token] = { userId: user.id, createdAt: now() };
  saveDb();
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
route('GET', '/api/quizzes', async ({ user, res }) => {
  if (!user) return send(res, 401, { error: 'Sign in required.' });
  expireStale();
  const out = [];
  for (const q of db.quizzes) {
    if (user.role !== 'teacher' && !q.published) continue;
    const qs = db.questions[q.id] || [];
    const live = qs.filter((x) => !x.draft);
    const atts = db.attempts.filter((a) => a.quizId === q.id);
    const done = atts.filter((a) => a.status !== 'in_progress');
    const mine = atts.filter((a) => a.userId === user.id);
    const myDone = mine.filter((a) => a.status !== 'in_progress');
    const inprog = mine.find((a) => a.status === 'in_progress');
    out.push(Object.assign(meta(q), {
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
    }));
  }
  out.sort((a, b) => b.createdAt - a.createdAt);
  send(res, 200, { quizzes: out });
});

function validQuizBody(body) {
  const title = String(body.title || '').trim();
  if (title.length < 3) return { error: 'Title must be at least 3 characters.' };
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
    published: !!body.published
  };
}

route('POST', '/api/quizzes', async ({ user, body, res }) => {
  if (!user) return send(res, 401, { error: 'Sign in required.' });
  if (!isTeacher(user)) return send(res, 403, { error: 'Teachers only.' });
  const v = validQuizBody(body);
  if (v.error) return send(res, 400, { error: v.error });
  const quiz = Object.assign({ id: uid('qz'), createdAt: now(), createdBy: user.id }, v);
  db.quizzes.push(quiz);
  db.questions[quiz.id] = [];
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
  return { q: {
    id: body.id || uid('qn'), type, text, options, answer,
    points: clamp(Math.round(Number(body.points) || 1), 1, 10),
    explanation: String(body.explanation || '').trim(),
    draft
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
  if (!quiz.published) return send(res, 404, { error: 'Quiz not found.' });
  send(res, 200, { quiz: meta(quiz), questionCount: qs.filter((x) => !x.draft).length });
});

route('PUT', '/api/quizzes/([A-Za-z0-9_]+)', async ({ user, params, body, res }) => {
  if (!isTeacher(user)) return send(res, user ? 403 : 401, { error: 'Teachers only.' });
  const quiz = byId(db.quizzes, params[0]);
  if (!quiz) return send(res, 404, { error: 'Quiz not found.' });
  const v = validQuizBody(Object.assign({}, quiz, body));
  if (v.error) return send(res, 400, { error: v.error });
  Object.assign(quiz, v);
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
  if (!quiz || !quiz.published) return send(res, 404, { error: 'Quiz not found.' });
  const allQs = db.questions[quiz.id] || [];
  const qs = allQs.filter((q) => !q.draft); // drafts never reach students
  if (!qs.length) return send(res, 400, { error: 'This quiz has no questions yet (only drafts or empty).' });
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
    endsAt: now() + quiz.durationMin * 60000, status: 'in_progress',
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

/* ======== NOTIFICATIONS (teacher) ======== */
route('GET', '/api/notifications', async ({ user, res }) => {
  if (!user) return send(res, 401, { error: 'Sign in required.' });
  if (user.role !== 'teacher') return send(res, 403, { error: 'Teachers only.' });
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
      g = { quizId: n.quizId, quizTitle: n.quizTitle || '(deleted quiz)', unread: 0, latestAt: n.createdAt, items: [] };
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
  if (user.role !== 'teacher') return send(res, 403, { error: 'Teachers only.' });
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
  if (user.role !== 'teacher') return send(res, 403, { error: 'Teachers only.' });
  const before = db.notifications.length;
  db.notifications = db.notifications.filter((n) => n.userId !== user.id);
  if (db.notifications.length !== before) saveDb();
  send(res, 200, { ok: true });
});

/* ======== GLOBAL LEADERBOARD (students) ======== */
route('GET', '/api/leaderboard', async ({ user, res }) => {
  if (!user) return send(res, 401, { error: 'Sign in required.' });
  expireStale();
  const rows = db.users
    .filter((u) => u.role === 'student')
    .map((u) => {
      const mine = db.attempts.filter((a) => a.userId === u.id && a.status !== 'in_progress');
      if (!mine.length) return null;
      const quizIds = [...new Set(mine.map((a) => a.quizId))];
      let sumBest = 0;
      for (const qid of quizIds) sumBest += Math.max(...mine.filter((a) => a.quizId === qid).map((a) => a.percent));
      return { name: u.name, attempts: mine.length, quizzes: quizIds.length, avgBest: Math.round(sumBest / quizIds.length * 10) / 10 };
    })
    .filter(Boolean)
    .sort((a, b) => b.avgBest - a.avgBest)
    .slice(0, 10);
  send(res, 200, { rows });
});

route('GET', '/api/health', async ({ res }) => send(res, 200, { ok: true, name: 'OQAS API', time: now() }));

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

server.listen(PORT, '0.0.0.0', () => {
  console.log('==================================================');
  console.log('  OQAS - Online Quiz & Automated Assessment System');
  console.log('==================================================');
  console.log('  API + UI  ->  http://localhost:' + PORT);
  console.log('  Accounts  ->  teacher@demo.com / teach123');
  console.log('               student@demo.com / study123');
  console.log('==================================================');
});
