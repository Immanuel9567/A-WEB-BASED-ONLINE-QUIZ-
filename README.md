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

The JSON datastore is created automatically at `data/db.json` on first run.

### First run — no seeded accounts

The system starts **completely empty** (no demo users or quizzes). Register the first
teacher from the sign-in page — you'll name your first class during registration and get
its join code — then create quizzes and let students register and join with the code.

---

## 2. System overview

### How it works

1. **Teacher builds the quiz** — create a quiz (duration, pass mark, attempt limits), add
   questions to the question bank (single-choice, multiple-response, true/false, points,
   explanations), configure the security & anti-cheat kit, then publish.
2. **Students take it live** — timed delivery with auto-saved answers, a navigation palette,
   optional question/option shuffling, and a server-side countdown that auto-submits on expiry.
3. **Results process in real time** — scores, pass/fail verdicts, answer reviews, teacher
   notifications and analytics update the moment attempts land.

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

**Classes with join codes**
- Teachers can run **several classes** — register with your first class name (OQAS generates
  a **unique join code** for it) and add more from the dashboard at any time.
- Students **join classes with a code** (as many as they like) from their dashboard, and
  their joined classes appear in the sidebar for one-click navigation.
- Quizzes can be visible to **all students** or to **any selection of your classes**; class
  quizzes appear just for members, tagged with the class name on each quiz card.
- **Class settings** (gear on the class page): pick a **class colour** and rename the class —
  the colour tints that class's quiz cards and notifications on student dashboards.
- **Manage students**: the class page shows every member with their stats, and the teacher
  can **remove (kick)** a student from the class at any time.
- **Sorting analytics (teacher only)**: on the students page, sort the whole school or any
  single class by name, quizzes taken, attempts, average, best score or last activity —
  click a column header, click again to reverse. The class page's member table sorts the
  same way, and the CSV export follows whatever is on screen. Students never see rankings.

**Questions with pictures**
- Attach a picture (diagram, screenshot, chart) to any question — it is resized automatically,
  stored with the question, shown while taking the quiz and on the graded review sheet.

**Profile editing** — every user (teacher or student) can update their name, sign-in email
and password from the sidebar (click your name at the bottom-left); changes apply instantly
across the app without a page refresh. Dashboard actions — publish, unpublish, delete,
restore, joining a class — also update the screen in place.

**Comfort features**
- **Show/hide password** eye buttons on every password field.
- **Collapsible sidebar** — collapse it to an icon rail for more workspace (state remembered).
- **Mobile-tuned layout** — bottom-sheet dialogs, scrollable tables, single-column cards.
- **Answer explanations** — teachers attach an explanation per question; students see it on
  the graded review sheet right after submission, together with the question picture.

**Cloud save (encrypted GitHub storage)**
- Connect a GitHub personal access token once and the **whole database auto-saves to the
  cloud** a few seconds after every change — AES-256-GCM encrypted, stored on a
  `cloud-data` branch of your repository.
- The server **restores from the cloud automatically on startup**, so quizzes and results
  survive restarts and redeploys — no user action needed, everything just works.

**Automated grading & real-time results**
- Grading runs server-side the instant an attempt is submitted.
- A 10-second background sweeper auto-grades expired attempts even if the student closes
  the browser — no human action required.
- Instant result sheet: score ring, pass/fail verdict, correct/wrong/skipped breakdown,
  full answer review with explanations.
- **Teacher notifications** — a bell in the teacher's navbar shows who has completed each
  quiz (submitted, time-expired, or auto-submitted via tab switch), with scores and timing.
  **Pop-up cards and a chime sound** announce new submissions the moment they happen — and
  anything that happened since your last visit pops up when you come back, so submissions
  are never missed. Sound can be muted from the bell panel.
- **Student notifications** — students get a bell notification the moment a teacher
  publishes a new quiz.
- **Live monitor** — who is writing, progress, time left and scores as they land
  (2-second polling), plus students who haven't started.
- **Analytics** — average/highest/lowest, pass rate, score distribution, per-question item
  analysis (facility index + difficulty label), per-quiz top performers, CSV export.

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
| `GET /api/quizzes/:id/analytics` | teacher | Stats, distribution, item analysis, per-quiz top performers |
| `GET /api/classes/mine` | teacher | The teacher's class + join code |
| `POST /api/classes` | teacher | Create a class (name) — returns its unique code |
| `GET /api/classes` | any | Teacher: own class · Student: classes joined |
| `POST /api/classes/join` | student | Join a class with its code |
| `PUT /api/classes/:id` | owner teacher | Rename a class / set its colour |
| `POST /api/classes/:id/kick` | owner teacher | Remove a student from the class |
| `GET /api/classes/:id` | member | Class detail: quizzes (+ members & stats for the owner) |
| `GET /api/admin/cloud/status` | teacher | Cloud save connection + last save state |
| `POST /api/admin/cloud/connect` | teacher | Connect cloud storage (token + passphrase) |
| `POST /api/admin/cloud/save` | teacher | Push the database to the cloud now |
| `POST /api/admin/cloud/restore` | teacher | Pull the cloud copy back into the server |
| `PUT /api/auth/profile` | any user | Update own name / email / password (needs current password) |
| `GET /api/students` | teacher | Enrolled students with aggregate stats |
| `GET /api/students/:id/history` | teacher | One student's full attempt history |
| `GET /api/admin/export` | teacher | Download full database (backup) |
| `POST /api/admin/import` | teacher | Restore database from a backup |
| `GET /api/notifications` | teacher | Notifications grouped by quiz + unread count |
| `POST /api/notifications/read` | teacher | Mark one / all as read |
| `DELETE /api/notifications` | teacher | Clear all notifications |
| `GET /api/students` | teacher | All students with stats + their classes (sortable, filterable) |

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
├── server.js              # HTTP server, REST API, grading engine
├── package.json           # npm start wrapper (for hosts & Render auto-detect)
├── render.yaml            # one-click deploy blueprint
├── data/db.json           # JSON datastore (auto-created, git-ignored)
└── public/
    ├── css/style.css      # Material white design system, single blue accent
    ├── js/app.js          # shared helpers + uniform inline-SVG icon pack
    ├── index.html         # landing (sign-in + repo link)
    ├── login.html         # sign in / register
    ├── dashboard.html     # student home (quizzes, results)
    ├── quiz.html          # timed quiz runner (autosave, tab-switch policy)
    ├── result.html        # instant result sheet + answer review
    ├── students.html      # enrolled students + per-student quiz history
    ├── class.html         # class page: join code, members, class quizzes
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
All state lives in `data/db.json` — delete the file to start completely fresh (empty).

### Data & storage

Everything (users, quizzes, questions, attempts, notifications, classes) lives in
`data/db.json` on the server — and can be **saved to the cloud** so nothing is lost.

**Cloud save (recommended, fully automatic)** — there is nothing to do in the app; the
database backs itself up:

1. Create a GitHub **fine-grained personal access token** with **Contents: Read and write**
   permission on your repository.
2. Give it to the server once, as environment variables (see §8 for hosts like Render):
   `OQAS_CLOUD_TOKEN` (the token) and `OQAS_CLOUD_PASSPHRASE` (6+ characters — keep it,
   you'll need it to recover data on a new server). On your own machine you can also put a
   `data/cloud.json` file with `{"token":"…","passphrase":"…"}` instead.
3. Done. The database is **AES-256-GCM encrypted** and pushed to the `cloud-data` branch
   of your repo (file `cloud/db.json`) a few seconds after every change, and restored
   automatically whenever the server starts.

Persistence hardening: new registrations are pushed to the cloud **immediately**, auto-save
runs 1.5 s after every other change, a pending save is **flushed on server shutdown**, and on
startup the server reconciles local vs cloud (the newer side wins, and any account that exists
only locally is rescued) — so a restart can no longer lose a just-created account.

Recovering on a fresh server: set the same token + passphrase (environment variables or
`data/cloud.json`) and start the server — startup pulls the data automatically.

**Local backup file** — *Download backup* exports the entire database as JSON;
*Restore backup* imports it back (the importing teacher stays signed in).

Notes:
- Cloud payloads are encrypted — the public repo never exposes student data — but a hosted
  database (PostgreSQL/MySQL, or a persistent disk on Render) is still the production-grade
  upgrade path.
- `data/db.json` and `data/cloud.json` are git-ignored; keep your token and passphrase safe.

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
5. **Make the data permanent (do this before real use).** On the free plan the filesystem
   resets on every deploy/restart, so cloud save must be configured through environment
   variables (service → **Environment**):

   | Variable | Value |
   |---|---|
   | `OQAS_CLOUD_TOKEN` | A GitHub personal access token with **Contents: Read and write** permission for this repo |
   | `OQAS_CLOUD_PASSPHRASE` | Your cloud passphrase (6+ characters) — use the same one every time so old backups stay readable |
   | `OQAS_CLOUD_BRANCH` | *(optional)* backup branch, default `cloud-data`. Give a live deployment its own branch (e.g. `cloud-data-live`) so test data never mixes with real data |

   With these set, the server restores the latest backup on every start and saves back
   after every change — accounts, quizzes and results survive restarts permanently.
   Cloud backup is fully automatic: teachers and students never see or manage it.

> **Free-plan notes:** the service sleeps after ~15 minutes of inactivity, so the first
> visit after a pause takes ~30–60 seconds to wake up. The filesystem is also reset on each
> deploy/restart — with the environment variables above (or a Render disk mounted at
> `data/`), your data is restored automatically either way.
>
> **Other hosts that work the same way:** Koyeb, Railway (paid), Fly.io, or any VPS —
> `git clone` + `npm start` is all it takes.
