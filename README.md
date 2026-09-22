# OQAS — Online Quiz & Automated Assessment System

**A web-based online quiz and automated assessment system with real-time result processing.**
This repository contains a fully working prototype: teacher-side quiz authoring, student-side
timed quiz delivery, server-side automated grading, a live session monitor, and result analytics.

---

## 1. Quick start

```bash
cd quiz-system
node server.js          # zero dependencies — only Node.js (14+) is required
# open http://localhost:3000
```

The JSON datastore is created and seeded automatically at `data/db.json` on first run.

### Demo accounts

| Role | Email | Password | What to try |
|---|---|---|---|
| Teacher | `teacher@demo.com` | `teach123` | Create a quiz → add questions → publish → open **Insights → Live monitor** |
| Student | `student@demo.com` | `study123` | Take *CSC 101* or *Web Technology* → watch the instant result sheet |
| More students | `amara@demo.com`, `tunde@demo.com`, `fatima@demo.com`, `emeka@demo.com` | `study123` | Open two browsers and take a quiz simultaneously to see the live monitor update |

New accounts (either role) can be created from the sign-in page.

---

## 2. Feature summary

**Assessment authoring (teacher)**
- Create quizzes with duration, pass mark, attempt limits, description.
- Question bank per quiz: single-choice, multiple-response, true/false questions.
- Per-question points (1–10) and post-grading explanations.
- Draft → publish workflow; unpublish hides a quiz from students.

**Assessment delivery (student)**
- Server-authoritative countdown timer; auto-submit + auto-grade at 00:00.
- One-question-at-a-time interface with a navigation palette and progress bar.
- Answers auto-saved to the server on every click (survives refresh/crash).
- Attempt limits enforced; resume of interrupted attempts.
- Anti-cheat signals: per-student question shuffling and tab-switch logging.

**Automated grading & real-time results**
- Grading runs server-side the instant an attempt is submitted.
- A 10-second background sweeper auto-grades expired attempts even if the
  student closes the browser — results appear without any human action.
- Instant result sheet: score ring, pass/fail verdict, correct/wrong/skipped
  breakdown, full answer review with explanations.
- Live monitor: teacher sees who is writing, progress, time left and scores as
  they land (2-second polling), plus students who haven't started.
- Analytics: average/highest/lowest, pass rate, score distribution, per-question
  item analysis (facility index + difficulty label), leaderboard, CSV export.

**Security (prototype level)**
- Salted SHA-256 password hashes; bearer-token sessions with TTL.
- Role checks on every endpoint; students never receive correct answers before
  grading; result sheets visible only to the owner and teachers.

---

## 3. Architecture

```
┌──────────────────────────────── browser ────────────────────────────────┐
│  public/  (vanilla HTML + CSS + JS, one page per screen)                │
│   index · login · dashboard · quiz · result · teacher · builder ·      │
│   insights                                                              │
└───────────────┬─────────────────────────────────────────────────────────┘
                │  REST + JSON  (Authorization: Bearer <token>)
┌───────────────▼─────────────────────────────────────────────────────────┐
│  server.js  —  zero-dependency Node.js HTTP server                     │
│  ├── static file serving          (public/)                            │
│  ├── REST API                     (/api/auth /quizzes /questions /...)  │
│  ├── grading engine               (finishAttempt — runs on submit       │
│  │                                 AND on timeout via 10s sweeper)     │
│  ├── attempt lifecycle            (start · autosave · expire · submit)  │
│  └── JSON document store          (data/db.json, atomic writes)         │
└─────────────────────────────────────────────────────────────────────────┘
```

**How "real-time" works here.** Two mechanisms:
1. **Instant processing** — grading executes synchronously inside the submit
   request; the response already contains the score.
2. **Live updates** — the teacher's monitor polls a lightweight summary
   endpoint every 2 s, while the expiry sweeper converts timed-out attempts
   into graded results in the background. (In production this layer would be
   upgraded to WebSockets / Server-Sent Events; see §7.)

---

## 4. Data model (`data/db.json`)

| Collection | Key fields |
|---|---|
| `users` | id, name, email, salt+pass hash, role (`teacher`/`student`), createdAt |
| `quizzes` | id, title, subject, description, durationMin, passMark, attemptsAllowed, shuffle, published, createdAt, createdBy |
| `questions` | keyed by quizId → array of {id, type, text, options[], answer, points, explanation} |
| `attempts` | id, quizId, userId, startedAt, endsAt, status (`in_progress`/`submitted`/`expired`), answers{}, tabSwitches, questionOrder[], score, maxScore, percent, passed, durationUsedSec, review[] |
| `sessions` | token → {userId, createdAt} |

---

## 5. REST API reference

| Method & path | Auth | Purpose |
|---|---|---|
| `POST /api/auth/register` | — | Create account (name, email, password, role) |
| `POST /api/auth/login` | — | Sign in → token |
| `POST /api/auth/logout` | user | Invalidate session |
| `GET /api/auth/me` | user | Current identity |
| `GET /api/users` | teacher | List users |
| `GET /api/quizzes` | user | Role-aware quiz list with attempt stats |
| `POST /api/quizzes` | teacher | Create quiz |
| `GET /api/quizzes/:id` | user | Quiz detail (answers included for teachers only) |
| `PUT /api/quizzes/:id` | teacher | Update / publish / unpublish |
| `DELETE /api/quizzes/:id` | teacher | Delete quiz + questions + attempts |
| `GET/POST /api/quizzes/:id/questions` | teacher | List / add questions |
| `PUT /api/questions/:qid` | teacher | Edit question |
| `DELETE /api/questions/:qid` | teacher | Delete question |
| `POST /api/attempts` | student | Start (or resume) attempt → sanitized questions + endsAt |
| `GET /api/attempts/:id` | owner/teacher | In-progress payload **or** full graded result |
| `POST /api/attempts/:id/answer` | owner | Auto-save one answer (server-validated window) |
| `POST /api/attempts/:id/submit` | owner | Submit → **instant grading** → score |
| `GET /api/me/attempts` | user | My attempt history |
| `GET /api/quizzes/:id/monitor` | teacher | Live session snapshot (summary + rows + not-started) |
| `GET /api/quizzes/:id/attempts` | teacher | Graded attempts table |
| `GET /api/quizzes/:id/analytics` | teacher | Stats, distribution, item analysis, leaderboard |
| `GET /api/leaderboard` | user | Global top performers |

### Grading rules
- **Single choice / True-False** — exact match → full points, else 0.
- **Multiple response** — all-or-nothing: the selected set must equal the key.
- Percent = `score / maxScore × 100` (1 decimal); pass when `percent ≥ passMark`.
- Late submits inside a 15 s grace window are accepted but flagged `expired`.

---

## 6. Project structure

```
quiz-system/
├── server.js              # HTTP server, REST API, grading engine, seed data
├── data/db.json           # JSON datastore (auto-created)
└── public/
    ├── css/style.css      # design system (no external assets/fonts)
    ├── js/app.js          # shared client helpers (API wrapper, navbar, toasts)
    ├── index.html         # landing page
    ├── login.html         # sign in / register
    ├── dashboard.html     # student home (quizzes, results, leaderboard)
    ├── quiz.html          # timed quiz runner (timer, palette, autosave)
    ├── result.html        # instant result sheet + answer review
    ├── teacher.html       # quiz management dashboard
    ├── builder.html       # question bank editor
    └── insights.html      # live monitor · results + CSV · analytics
```

---

## 7. Prototype scope & production notes

Deliberate simplifications, and how each would be hardened in production:

| Area | Prototype | Production upgrade |
|---|---|---|
| Realtime channel | 2 s polling + background sweeper | WebSockets or Server-Sent Events |
| Storage | JSON file with atomic writes | PostgreSQL / MySQL with transactions |
| Auth | Salted SHA-256, bearer tokens | bcrypt/argon2, JWT rotation, HTTPS, rate limiting |
| Integrity | Shuffling, tab-switch logging, server timers | Webcam/screen proctoring, IP logging, lockdown options |
| Grading | Objective types only | Partial credit, essay questions with rubric assist |
| Scale | Single process | Load-balanced stateless API + message queue for grading |

**Run note:** the server binds `0.0.0.0` on port 3000 (`PORT` env overrides it).
All state lives in `data/db.json` — delete the file to reset to a fresh seed.
