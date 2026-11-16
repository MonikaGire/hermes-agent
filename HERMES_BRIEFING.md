# HERMES — Full System Briefing
### What Was Built, What It Does, and How to Improve It

---

## What Is HERMES?

HERMES is an AI-powered B2B sales automation system. Its job is to automatically find manufacturing companies, research them, write personalized cold emails using AI, get a human to approve those emails, and send them — all with minimal human effort.

It was built specifically for selling **manufacturing ERP software** (Enterprise Resource Planning — software that helps factories manage production, inventory, orders, and operations).

**The core problem it solves:**  
A sales rep normally spends 4–6 hours per company doing research, writing an email, and getting it reviewed. HERMES compresses that to ~10 minutes of automated processing plus 5 minutes of human review.

---

## What the System Has Built

The full platform was built across 10 phases. Here is everything that exists:

### 1. The AI Pipeline (the core of the system)
Eight specialized AI agents that run in sequence:

| Agent | What It Does |
|---|---|
| **ProspectFinderAgent** | Searches Google (via SerpAPI) and Apollo.io to find manufacturing companies to target |
| **CompanyResearchAgent** | Researches a company across 8 dimensions: products, locations, recent news, expansion plans, hiring activity, tech stack, investments, acquisitions |
| **PainPointAnalysisAgent** | Looks at the research and identifies specific operational problems the company has that an ERP system would fix |
| **DecisionMakerAgent** | Figures out the right job titles to target (e.g., VP Operations, Manufacturing Director) |
| **EmailWriterAgent** | Writes a short, personalized cold email (targeting the primary pain point found) |
| **ReviewAgent** | Scores the email across 6 dimensions (personalization, business value, human tone, etc.) out of 100 |
| **ApprovalAgent** | Decides if the email is good enough to send to a human for final review |
| **ERPKnowledgeAgent** | Provides ERP domain expertise to the other agents |

These agents are chained together by the **HermesOrchestrator**, which:
1. Runs research on the company
2. Identifies pain points
3. Writes an email, reviews it, and rewrites it up to 3 times if the score is below 60/100
4. Sends the best version to a human for approval

The AI model is **Groq (llama-3.3-70b)** — fast inference, accessed via the OpenAI SDK format.

---

### 2. The Backend API
A full Express.js REST API with 12 route groups:
- **Auth** — register, login, JWT tokens
- **Prospects** — manage company pipeline, trigger research/emails
- **Companies** — company data management
- **Contacts** — decision-maker contacts
- **Research** — view AI research results
- **Emails** — view, edit, send, regenerate AI emails
- **Approvals** — approve/skip/revise emails
- **Dashboard** — stats, activity feed, conversion chart
- **Discovery** — search for and import new companies
- **Settings** — manage integrations (admin only)
- **Telegram** — receive bot commands
- **Waitlist** — separate email capture feature

---

### 3. Background Queue System
All heavy AI work runs in the background using **BullMQ + Redis**. This means:
- HTTP requests respond instantly (no waiting for AI)
- Jobs retry automatically if they fail (3 attempts, exponential backoff)
- 5 research workers and 3 email-generation workers run simultaneously

**5 queues:**
1. `prospect-discovery` — find new companies
2. `research` — research each company
3. `email-generation` — generate personalized emails
4. `email-sending` — dispatch via SMTP
5. `follow-up` — (built but not yet wired up)

**4 automated cron jobs:**
- Daily at 2am → auto-discover new companies
- Every 2 hours → research NEW companies
- Every 4 hours → generate emails for RESEARCHED companies
- Daily at 1am → recalculate dashboard stats

---

### 4. The Web Dashboard (Frontend)
A Next.js 15 dashboard with 9 pages:

| Page | What Sales Team Does There |
|---|---|
| `/dashboard` | View pipeline stats, conversion chart, activity feed |
| `/prospects` | See all companies in the pipeline with status badges |
| `/companies` | Detailed company management |
| `/contacts` | Decision-maker contact list |
| `/research` | Read what the AI discovered about each company |
| `/emails` | View generated emails, send approved ones |
| `/approvals` | Review AI emails and approve/skip/request revision |
| `/settings` | Configure API keys (admin only) |
| `/waitlist` | Manage email waitlist for a secondary product |

---

### 5. The Telegram Bot
A Telegram bot gives mobile access to the pipeline:
- `/stats` — see pipeline numbers on phone
- `/approve <id>` — approve an email from Telegram
- `/find <query>` — search for companies
- `/research <id>` — trigger research from phone

---

### 6. Third-Party Integrations
| Service | Purpose |
|---|---|
| **Groq** | AI/LLM inference (the brain) |
| **Apollo.io** | Find companies and decision-makers |
| **Hunter.io** | Find and verify email addresses |
| **SerpAPI** | Google search results for research |
| **Clearbit** | Enrich company data (employees, tech stack, logo) |
| **SMTP** | Send emails (Gmail, SendGrid, or AWS SES) |
| **Telegram** | Mobile bot interface |

---

### 7. The Database
**MongoDB** with **Prisma ORM** — 11 data models:

| Model | Purpose |
|---|---|
| `Company` | A prospect company (has a status that tracks pipeline stage) |
| `Contact` | A decision-maker at a company |
| `Research` | AI research output for a company |
| `PainPoint` | Specific problems identified for each company |
| `Email` | AI-generated outreach email |
| `Approval` | Human review actions on emails |
| `Activity` | Audit log of everything that happens |
| `Integration` | Config for each third-party service |
| `User` | Sales team accounts (ADMIN or USER role) |
| `WaitlistLead` | Waitlist signups |
| `Setting` | App-level configuration |

**Company pipeline status** (the main state machine):
```
NEW → RESEARCHING → RESEARCHED → EMAIL_DRAFT → EMAIL_PENDING → EMAIL_APPROVED → EMAIL_SENT → REPLIED → CONVERTED
```
At any point a company can be moved to `SKIPPED`.

---

### 8. Deployment Infrastructure
Everything needed for production is already configured:
- **Docker Compose** — runs all 5 services (MongoDB, Redis, Backend, Frontend, Nginx)
- **Dockerfile** — multi-stage production build
- **Nginx** — SSL, rate limiting (5 auth requests/min, 20 API requests/sec), security headers
- **PM2** — runs backend in cluster mode (2 instances), auto-restarts on crash
- **VPS setup script** — one-command Ubuntu 24.04 server setup with Node.js, MongoDB, Redis, Nginx, Certbot

---

## What the System CANNOT Do Yet (Gaps)

These are things that are missing or incomplete:

### Critical Missing Pieces

**1. No tests whatsoever**
Zero automated tests. No unit tests, no integration tests, no end-to-end tests. Every code change is risky because there's nothing to catch regressions.

**2. API keys stored as plaintext**
The integration API keys (Apollo, Hunter, etc.) are stored unencrypted in MongoDB. If the database is ever compromised, all credentials are exposed.

**3. No account lockout**
A hacker can try unlimited passwords (only Nginx's 5-req/min rate limit slows them down). There's no lockout after X failed attempts.

**4. Sent JWT tokens can't be revoked**
If a user logs out or a token is stolen, the token stays valid for 7 days. There's no way to invalidate it.

### High-Value Improvements

**5. No follow-up email sequence**
The `follow-up` queue exists in code but is not wired up. There's no automated follow-up if a prospect doesn't reply after 5–7 days. This is arguably the most impactful missing feature for conversion rates.

**6. No reply detection**
Replies are tracked manually. There's no webhook or email polling to automatically detect and log when a prospect replies. This means `REPLIED` status is set by hand.

**7. Email quality is silently accepted when all 3 attempts fail**
If the EmailWriterAgent fails to reach 60/100 across all 3 attempts, the system saves the best-scoring version anyway without alerting anyone. A 45/100 email should be flagged, not silently queued for approval.

**8. No CRM integration**
There's no connection to Salesforce, HubSpot, or any CRM. Converted prospects live only in HERMES. Sales teams using a CRM would have to manually sync data.

**9. No email open/click tracking**
Emails are sent but there's no tracking pixel or link-wrapping to know if a prospect opened the email. `openedAt` field exists in the database but is never populated automatically.

**10. No company name search index**
The search feature uses a slow regex scan instead of a MongoDB text index. This will become noticeably slow above ~50,000 companies.

**11. Hard delete instead of soft delete**
Deleting a company permanently removes all related research, emails, contacts, and approval history. There's no undo and the audit trail is destroyed.

**12. No A/B testing of email tones**
The system always uses the same configured tone. There's no way to test whether formal vs conversational emails get better reply rates for different industries.

**13. Activity log has no retention policy**
Every action creates an Activity record and they accumulate forever with no cleanup. On a busy system this table grows unboundedly.

---

## How the Automation Currently Flows (End to End)

```
1. DISCOVER
   Every day at 2am (or manually):
   → SerpAPI searches Google for manufacturing companies
   → ProspectFinderAgent identifies real companies from results
   → Apollo.io optionally enriches each one
   → New companies saved to DB as status: NEW

2. RESEARCH
   Every 2 hours (or manually):
   → For each NEW company:
   → SerpAPI gets recent news and products
   → Clearbit gets employee count, tech stack, logo
   → CompanyResearchAgent synthesizes everything into structured data
   → PainPointAnalysisAgent maps problems → ERP capabilities
   → Research + PainPoints saved to DB
   → Company status: RESEARCHED

3. EMAIL GENERATION
   Every 4 hours (or manually):
   → For each RESEARCHED company:
   → Hunter.io finds/verifies a decision-maker email
   → HermesOrchestrator runs:
       a. EmailWriterAgent writes personalized email
       b. ReviewAgent scores it (0–100 across 6 criteria)
       c. If score < 60 → rewrite (up to 3 tries)
       d. Best version saved to DB
   → Company status: EMAIL_PENDING

4. HUMAN APPROVAL
   Sales rep reviews email in browser or Telegram:
   → APPROVE → Email status: APPROVED (ready to send)
   → SKIP → Company removed from pipeline
   → REVISE → AI rewrites with specific instructions

5. SEND
   Sales rep clicks Send (or future automation):
   → Nodemailer sends via SMTP
   → Email status: SENT, sentAt timestamp saved
   → Company status: EMAIL_SENT

6. OUTCOME
   → Reply received (currently manual): status REPLIED
   → Deal closed (manually): status CONVERTED
```

---

## What Fable Should Focus On to Improve This System

### Priority 1 — Make it fully autonomous (close the loop)
The biggest gap: steps 4 and 5 still require human clicking. To make this truly autonomous:
- **Auto-detect replies** via email polling (IMAP) or Postmark/SendGrid webhooks
- **Auto-send approved emails** (optional setting, admin-controlled)
- **Wire up follow-up sequences** — if no reply in 5 days, send a follow-up automatically

### Priority 2 — Add intelligence to email improvement
- **Track reply rates by tone** (formal vs conversational vs challenger) — learn which works per industry
- **Feed reply data back into EmailWriterAgent** as context — agents should know what worked before
- **Alert when all 3 email attempts score below 60** — don't silently accept low quality

### Priority 3 — Add the missing safety net
- **Write tests** for the orchestrator, auth, and critical services
- **Add account lockout** (10 failed attempts → locked 15 min)
- **Add soft delete** so data isn't permanently destroyed

### Priority 4 — Connect to existing sales tools
- **CRM sync** (HubSpot is common for SMB sales teams) — push REPLIED/CONVERTED companies to CRM
- **Email open/click tracking** — add a tracking pixel to sent emails, update `openedAt`
- **Slack notifications** — alert the team on Slack when a prospect replies

### Priority 5 — Scale the discovery
Right now discovery targets whatever is configured at system level. Better approaches:
- **Industry-specific keyword libraries** — different search strategies per manufacturing sub-sector (automotive, aerospace, food production, etc.)
- **LinkedIn integration** — Apollo.io is good but LinkedIn Sales Navigator has more complete data
- **Scoring system for leads** — not all discovered companies are equal. Score them before spending AI credits on research.

---

## Tech Stack Summary (for context)

```
Language:     TypeScript 5 (strict mode, ESM)
Frontend:     Next.js 15, React 19, Tailwind CSS, React Query, Zustand
Backend:      Express.js 4, Zod (validation), Winston (logging)
Database:     MongoDB 7 via Prisma ORM 6
Queues:       BullMQ + Redis 7
AI:           Groq API (llama-3.3-70b) via OpenAI SDK
Auth:         JWT (backend) + NextAuth v5 (frontend)
Email:        Nodemailer (SMTP)
Bot:          Telegraf (Telegram)
Infra:        Docker, Nginx, PM2, Ubuntu 24.04
Package mgr:  npm workspaces (monorepo)
```

---

## One-Line Summary

HERMES automates the hardest part of B2B sales — finding the right companies, understanding their problems, and writing emails that speak directly to those problems — but still keeps a human in the loop before any email is sent. The next phase is closing the loop: detecting replies, automating follow-ups, and feeding outcome data back into the AI to make it smarter over time.
