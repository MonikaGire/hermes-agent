# HERMES — Project Overview

## What Is HERMES?

HERMES is a production-grade, AI-powered B2B outreach automation platform purpose-built for selling manufacturing ERP software. It automates the entire top-of-funnel sales process: discovering target companies, researching them deeply, identifying pain points, writing hyper-personalized cold emails, reviewing and scoring those emails, routing them through a human approval workflow, and finally dispatching them via SMTP.

The name **HERMES** is a reference to the Greek messenger god — fitting for a system whose core purpose is to craft and deliver intelligent, persuasive messages.

---

## Problem It Solves

Traditional B2B outreach for enterprise software is slow, expensive, and generic. Sales teams spend hours:

1. Manually researching prospect companies
2. Writing one-size-fits-all cold emails
3. Reviewing and approving outreach
4. Tracking responses

HERMES compresses this entire workflow into an automated pipeline that runs 24/7, delivering personalized emails at scale without sacrificing quality or human oversight.

---

## Business Purpose

| Goal | How HERMES Addresses It |
|---|---|
| Identify target companies | Multi-source discovery (Google Search, Apollo.io, AI inference) |
| Understand each company deeply | 8-dimension research agent (products, news, hiring, tech stack, expansion plans) |
| Find the right contact | Decision-maker identification + Hunter.io email verification |
| Write compelling emails | Multi-agent email generation with self-critique loop |
| Maintain quality | ReviewAgent scoring (6 dimensions, 0–100 scale) |
| Preserve human control | Web UI + Telegram bot approval workflow |
| Learn from responses | Reply tracking, conversion metrics, dashboard analytics |

---

## Primary Users

| Role | How They Use the System |
|---|---|
| **Sales Manager (Admin)** | Configures integrations, reviews pipeline analytics, approves or revises AI-generated emails, monitors queue health |
| **SDR / Sales Rep (User)** | Browses prospect list, triggers manual research/email generation, reviews contacts and emails |
| **System (Automated)** | Cron jobs and BullMQ workers run the pipeline autonomously in the background |

---

## Major Use Cases

1. **Automated Prospect Discovery** — System searches Google/Apollo for manufacturing companies matching configured criteria, imports them as prospects
2. **Deep Company Research** — For each new prospect, a research agent synthesizes public data into structured intelligence (products, expansion plans, pain points)
3. **Personalized Email Generation** — HermesOrchestrator chains 8 AI agents to write, review, and approve an outreach email unique to each company
4. **Human-in-the-Loop Approval** — Sales team reviews AI-generated emails via browser dashboard or Telegram bot commands before sending
5. **Email Dispatch** — Approved emails sent via SMTP; delivery status, opens, and replies tracked
6. **Waitlist Management** — Separate lightweight flow for capturing and emailing a product waitlist (e-commerce use case)
7. **Telegram Command Center** — `/stats`, `/approve`, `/find`, `/research` bot commands give mobile access to the pipeline

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                          NGINX (Reverse Proxy)                   │
│                    Rate limiting · SSL · CORS                    │
└────────────────────────┬──────────────────────┬─────────────────┘
                         │                      │
               ┌─────────▼──────┐    ┌──────────▼──────────┐
               │  Next.js 15     │    │   Express.js API     │
               │  Frontend       │    │   (Port 4000)        │
               │  (Port 3000)    │    │                      │
               └─────────────────┘    └──────────┬───────────┘
                                                  │
               ┌──────────────────────────────────▼───────────────┐
               │                 Business Layer                     │
               │  Controllers → Services → Validators               │
               └───────┬──────────────────────────┬───────────────┘
                       │                          │
         ┌─────────────▼───────┐      ┌───────────▼──────────────┐
         │   MongoDB (Prisma)   │      │    BullMQ + Redis         │
         │   Data persistence   │      │    Background queues      │
         └─────────────────────┘      └───────────┬──────────────┘
                                                   │
                                       ┌───────────▼──────────────┐
                                       │   AI Agent Package        │
                                       │   HermesOrchestrator      │
                                       │   8 specialized agents    │
                                       └───────────┬──────────────┘
                                                   │
                                       ┌───────────▼──────────────┐
                                       │   External APIs           │
                                       │   Groq/OpenAI · Apollo    │
                                       │   Hunter · SerpAPI        │
                                       │   Clearbit · SMTP         │
                                       └──────────────────────────┘
```

---

## Design Philosophy

- **Human-in-the-Loop First** — Every AI-generated email requires human approval before dispatch. The AI proposes; humans decide.
- **Quality Over Quantity** — ReviewAgent enforces multi-dimensional quality gates (minimum 60/100 composite score). Emails failing review are automatically rewritten up to 3 times.
- **Async Everything** — All heavy operations (research, email generation) run as BullMQ jobs in the background. HTTP responses are immediate; results are polled via the UI.
- **Domain-Driven Agents** — Each AI agent has a single, narrow responsibility. No monolithic LLM prompt — instead, a coordinated multi-agent pipeline.
- **Monorepo** — Three packages share types and database client without duplication: `packages/shared`, `packages/database`, `packages/agents`.

---

## Core Technologies

| Category | Technology |
|---|---|
| Runtime | Node.js 20 |
| Language | TypeScript 5 (strict mode, ESM) |
| Frontend | Next.js 15, React 19, Tailwind CSS |
| Backend | Express.js 4 |
| Database | MongoDB 7 via Prisma ORM 6 |
| Queue | BullMQ (Redis 7) |
| AI / LLM | Groq (llama-3.3-70b-versatile) via OpenAI SDK |
| Auth | JWT (backend) + NextAuth v5 (frontend) |
| Validation | Zod |
| Logging | Winston |
| Email | Nodemailer (SMTP) |
| Bot | Telegraf (Telegram) |
| Process Manager | PM2 |
| Reverse Proxy | Nginx |
| Containerization | Docker + Docker Compose |
| Package Manager | npm workspaces (monorepo) |

---

## Repository Structure

```
hermes-agent/
├── apps/
│   ├── backend/          # Express API server
│   └── frontend/         # Next.js 15 dashboard
├── packages/
│   ├── agents/           # AI agent library (8 agents + orchestrator)
│   ├── database/         # Prisma schema + MongoDB client
│   └── shared/           # Shared TypeScript types, utils, constants
├── scripts/
│   └── setup-vps.sh      # Ubuntu VPS provisioning script
├── docs/                 # Generated documentation (this folder)
├── docker-compose.yml    # Full stack local/prod orchestration
├── Dockerfile            # Multi-stage production build
├── nginx.conf            # Nginx reverse proxy + security config
├── pm2.config.js         # PM2 process manager configuration
├── tsconfig.base.json    # Shared TypeScript configuration
└── package.json          # Monorepo root (npm workspaces)
```

---

## Development Approach

- **Monorepo** with npm workspaces — all packages live in one repository and share dependencies
- **TypeScript throughout** — strict mode, path aliases, ESM modules
- **Environment-first** — all secrets and configuration via `.env` (validated by Zod at startup)
- **Queue-backed async** — no synchronous LLM calls in HTTP request handlers
- **Layered backend** — Routes → Controllers → Services → Integrations/DB (each layer has a single responsibility)
- **12-factor** app principles: stateless processes, config from environment, backing services as resources
