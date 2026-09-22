# OQAS — Online Quiz & Automated Assessment System

**A web-based online quiz and automated assessment system with real-time result processing.**
This repository contains a fully working prototype: teacher-side quiz authoring, student-side
timed quiz delivery, server-side automated grading, live session monitoring, teacher
notifications, and result analytics.

> **Note for the client:** the feature overview, how-it-works guide, architecture, data model
> and API reference all live in this README (the web app itself stays focused on the workflow).

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

## 2. System overview

### How it works

1. **Teacher builds the quiz** — create a quiz (duration, pass mark, attempt limits), add
   questions to the question bank (single-choice, multiple-response, true/false, points,
   explanations), configure the security & anti-cheat kit, then publish.
2. **Students take it live** — timed delivery with auto-saved answers, a navigation palette,
   optional question/option shuffling, and a server-side countdown that auto-submits on expiry.
3. **Results process in real time** — scores, pass/fail verdicts, answer reviews, teacher
   notifications, leaderboards and analytics update the moment attempts land.

### Features

**Assessment authoring (teacher)**
- Quizzes with duration, pass mark, attempt limits and a draft → publish workflow.
- Question bank per quiz: single-choice, multiple-response and true/false questions.
- Per-question points (1–10) and post-grading explanations.
- **Question drafts** — save an incomplete question as a draft and come back to finish it
  later; drafts are never shown to students. The editor also auto-saves half-written
  questions locally, so nothing is lost on accidental navigation.
- **Security & anti-cheat kit per quiz:**
  - *Shuffle questions per student* — each candidate receives a different question order.
  - *Shuffle answer options per student* — answer positions can't be copied between candidates.
  - *Tab-switch policy* — **Off / Warn & log / Auto-submit**: when set to auto-submit, the
    moment a candidate leaves the quiz tab the server submits and grades their attempt.

**Assessment delivery (student)**
- Server-authoritative countdown timer; auto-submit + auto-grade at 00:00.
- One-question-at-a-time interface with a navigation palette and progress bar.
- Answers auto-saved to the server on every click (survives refresh/crash).
- Attempt limits enforced; resume of interrupted attempts.

**Navigation & roster (teacher)**
- **Sidebar navigation** on every app screen for quick access (collapses to a top bar on phones).
- **Full-width desktop layout** — the workspace uses the whole screen on large monitors.
- **Enrolled students list** — every registered student with joined date, quizzes taken,
  attempts, average, best score and last activity; exportable as CSV.
- **Per-student quiz history** — click any student to see their full attempt history with
  scores, outcomes, timing and integrity flags, and jump straight to each result review.

**Automated grading & real-time results**
- Grading runs server-side the instant an attempt is submitted.
- A 10-second background sweeper auto-grades expired attempts even if the student closes
  the browser — no human action required.
- Instant result sheet: score ring, pass/fail verdict, correct/wrong/skipped breakdown,
  full answer review with explanations.
- **Teacher notifications** — a bell in the teacher's navbar shows who has completed each
  quiz (submitted, time-expired, or auto-submitted via tab switch), with scores and timing.
  Multiple notifications are grouped and sorted by quiz; a live toast appears while the
  teacher is online.
- **Live monitor** — who is writing, progress, time left and scores as they land
  (2-second polling), plus students who haven't started.
- **Analytics** — average/highest/lowest, pass rate, score distribution, per-question item
  analysis (facility index + difficulty label), leaderboard, CSV export.

**Security (prototype level)**
- Salted SHA-256 password hashes; bearer-token sessions with TTL.
- Role checks on every endpoint; students never receive correct answers before grading;
  option/answer indexes are translated server-side when shuffling is enabled.
- Result sheets visible only to the owner and teachers.

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
│  ├── grading engine               (finishAttempt — runs on submit,      │
│  │                                 tab-switch enforcement AND timeout   │
│  │                                 via 10s sweeper)                     │
│  ├── notifications                (grouped by quiz for the teacher)     │
│  ├── attempt lifecycle            (start · autosave · expire · submit)  │
│  └── JSON document store          (data/db.json, atomic writes)         │
└─────────────────────────────────────────────────────────────────────────┘
```

**How "real-time" works here.** Three mechanisms:
1. **Instant processing** — grading executes synchronously inside the submit request; the
   response already contains the score.
2. **Background sweeper** — a 10 s loop converts timed-out attempts into graded results
   and pushes a notification to the teacher.
3. **Live updates** — the teacher's bell and monitor poll lightweight endpoints (10 s and
   2 s respectively). (In production this layer would be upgraded to WebSockets /
   Server-Sent Events; see §7.)

---

## 4. Data model (`data/db.json`)

| Collection | Key fields |
|---|---|
| `users` | id, name, email, salt+pass hash, role (`teacher`/`student`), createdAt |
| `quizzes` | id, title, subject, description, durationMin, passMark, attemptsAllowed, shuffle, shuffleOptions, tabSwitchPolicy (`off`/`warn`/`autosubmit`), published, createdAt, createdBy |
| `questions` | keyed by quizId → array of {id, type, text, options[], answer, points, explanation, draft} |
| `attempts` | id, quizId, userId, startedAt, endsAt, status (`in_progress`/`submitted`/`expired`), answers{}, tabSwitches, autoSubmittedReason, questionOrder[], optionOrder{}, score, maxScore, percent, passed, durationUsedSec, review[] |
| `notifications` | id, userId (teacher), quizId, quizTitle, attemptId, studentName, type (`submitted`/`expired`/`tabswitch`), percent, passed, createdAt, read |
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
| `GET /api/quizzes` | user | Role-aware quiz list with attempt stats + draft counts |
| `POST /api/quizzes` | teacher | Create quiz (incl. security kit fields) |
| `GET /api/quizzes/:id` | user | Quiz detail (answers included for teachers only) |
| `PUT /api/quizzes/:id` | teacher | Update / publish / unpublish / security kit |
| `DELETE /api/quizzes/:id` | teacher | Delete quiz + questions + attempts |
| `GET/POST /api/quizzes/:id/questions` | teacher | List / add questions (drafts allowed) |
| `PUT /api/questions/:qid` | teacher | Edit question (finish a draft with `draft:false`) |
| `DELETE /api/questions/:qid` | teacher | Delete question |
| `POST /api/attempts` | student | Start (or resume) attempt → sanitized questions + endsAt |
| `GET /api/attempts/:id` | owner/teacher | In-progress payload **or** full graded result |
| `POST /api/attempts/:id/answer` | owner | Auto-save one answer (server-validated window) |
| `POST /api/attempts/:id/submit` | owner | Submit → **instant grading** → score |
| `POST /api/attempts/:id/tabswitch` | owner | Tab-switch signal; enforces auto-submit policy |
| `GET /api/me/attempts` | user | My attempt history |
| `GET /api/quizzes/:id/monitor` | teacher | Live session snapshot (summary + rows + not-started) |
| `GET /api/quizzes/:id/attempts` | teacher | Graded attempts table |
| `GET /api/quizzes/:id/analytics` | teacher | Stats, distribution, item analysis, leaderboard |
| `GET /api/students` | teacher | Enrolled students with aggregate stats |
| `GET /api/students/:id/history` | teacher | One student's full attempt history |
| `GET /api/admin/export` | teacher | Download full database (backup) |
| `POST /api/admin/import` | teacher | Restore database from a backup |
| `GET /api/notifications` | teacher | Notifications grouped by quiz + unread count |
| `POST /api/notifications/read` | teacher | Mark one / all as read |
| `DELETE /api/notifications` | teacher | Clear all notifications |
| `GET /api/leaderboard` | user | Global top performers |

### Grading rules
- **Single choice / True-False** — exact match → full points, else 0.
- **Multiple response** — all-or-nothing: the selected set must equal the key.
- Percent = `score / maxScore × 100` (1 decimal); pass when `percent ≥ passMark`.
- Late submits inside a 15 s grace window are accepted but flagged `expired`.
- Shuffled option orders are translated back to original indexes before grading, so
  grading logic is independent of display order.

---

## 6. Project structure

```
quiz-system/
├── server.js              # HTTP server, REST API, grading engine, seed data
├── package.json           # npm start wrapper (for hosts & Render auto-detect)
├── render.yaml            # one-click deploy blueprint
├── data/db.json           # JSON datastore (auto-created, git-ignored)
└── public/
    ├── css/style.css      # Material white design system, single blue accent
    ├── js/app.js          # shared helpers + uniform inline-SVG icon pack
    ├── index.html         # landing (sign-in + repo link)
    ├── login.html         # sign in / register
    ├── dashboard.html     # student home (quizzes, results, leaderboard)
    ├── quiz.html          # timed quiz runner (autosave, tab-switch policy)
    ├── result.html        # instant result sheet + answer review
    ├── students.html      # enrolled students + per-student quiz history
    ├── teacher.html       # quiz management dashboard + data backup/restore
    ├── builder.html       # question bank editor + security kit + drafts
    └── insights.html      # live monitor · results + CSV · analytics
```

---

## 7. Prototype scope & production notes

Deliberate simplifications, and how each would be hardened in production:

| Area | Prototype | Production upgrade |
|---|---|---|
| Realtime channel | Polling (2 s monitor, 10 s bell) + background sweeper | WebSockets or Server-Sent Events |
| Storage | JSON file with atomic writes | PostgreSQL / MySQL with transactions |
| Auth | Salted SHA-256, bearer tokens | bcrypt/argon2, JWT rotation, HTTPS, rate limiting |
| Integrity | Shuffling, tab-switch logging/policy, server timers | Webcam/screen proctoring, IP logging, lockdown options |
| Tab-switch enforcement | Client-reported signal (server-verified window) | Page-focus heuristics per delivery context |
| Grading | Objective types only | Partial credit, essay questions with rubric assist |
| Scale | Single process | Load-balanced stateless API + message queue for grading |

**Run note:** the server binds `0.0.0.0` on port 3000 (`PORT` env overrides it).
All state lives in `data/db.json` — delete the file to reset to a fresh seed.

### Data & storage — read this before relying on saved data

This prototype deliberately has **no cloud database**: everything (users, quizzes, questions,
attempts, notifications) lives in one JSON file on the server, `data/db.json`. That means:

- **Restarting/redeploying the server** (or resetting a sandbox/preview environment) can
  revert the file to an earlier state — quizzes created since then would be lost.
- The file is **git-ignored**, so it is not part of the GitHub repository.

To protect your work, the teacher dashboard has a **Data & backup** panel:

- **Download backup** — exports the entire database as a single JSON file.
- **Restore backup** — imports a backup file and replaces the current database
  (the importing teacher stays signed in; everyone else signs in again).

Recommended habit: after creating quizzes or finishing an assessment session, download a
backup. For permanent, multi-device storage in production, move to a hosted database —
see the table above (PostgreSQL/MySQL, or attach a persistent disk on Render).

---

## 8. Deploying it live (free hosting)

The app is a single zero-dependency Node.js process, so it deploys anywhere Node runs.

### One click on Render (recommended, free)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/Immanuel9567/A-WEB-BASED-ONLINE-QUIZ-)

Manual steps (same result):

1. Create a free account at [render.com](https://render.com) — easiest is **Sign in with GitHub**.
2. Dashboard → **New +** → **Web Service** → connect the repo **A-WEB-BASED-ONLINE-QUIZ-**.
3. Render auto-detects Node from `package.json`:
   * Build command: `npm install`
   * Start command: `npm start`
4. Choose the **Free** plan → **Deploy**. In ~2 minutes your quiz system is live at
   `https://<your-service-name>.onrender.com` — share that link with your client.

> **Free-plan notes:** the service sleeps after ~15 minutes of inactivity, so the first
> visit after a pause takes ~30–60 seconds to wake up. The filesystem is also reset on each
> deploy/restart — the database **re-seeds itself with the demo data automatically**, so the
> site keeps working (created accounts/quizzes since the last deploy would be lost).
> For persistent data, attach a Render disk mounted at `data/` or move to PostgreSQL (§7).
>
> **Other hosts that work the same way:** Koyeb, Railway (paid), Fly.io, or any VPS —
> `git clone` + `npm start` is all it takes.
