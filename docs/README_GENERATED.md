# HERMES — AI-Powered B2B Outreach Platform

## Overview

HERMES automates the entire top-of-funnel B2B sales process for manufacturing ERP software. It discovers prospect companies, researches them with 8 specialized AI agents, generates hyper-personalized cold emails, and routes them through a human approval workflow before dispatch.

## Quick Start

```bash
# Prerequisites: Node.js 20+, MongoDB, Redis

# Install
git clone <repo-url> hermes-agent && cd hermes-agent
npm install
cp .env.example .env  # Fill in your API keys

# Setup database
npm run db:generate && npm run db:push && npm run db:seed

# Start
npm run dev
```

- Frontend dashboard: http://localhost:3000
- Backend API: http://localhost:4000/health
- Default admin: configured in seed script

## Architecture

```
Browser → Nginx → Next.js 15 (Frontend)
                → Express.js (Backend API)
                     → MongoDB (Prisma ORM)
                     → Redis (BullMQ Queues)
                          → 8 AI Agents (Groq LLM)
                          → Apollo, Hunter, SerpAPI, Clearbit
```

## Core Pipeline

```
1. Discover  → Google/Apollo/AI finds manufacturing companies
2. Research  → 8-dimension AI research per company (5 concurrent workers)
3. Generate  → Multi-agent email with self-critique loop (3 concurrent workers)
4. Approve   → Human approval via Web UI or Telegram bot
5. Dispatch  → SMTP delivery with open/reply tracking
```

## Key Features

- **Multi-agent AI pipeline**: 8 specialized agents + HermesOrchestrator
- **Human-in-the-loop**: All emails require approval before sending
- **Telegram bot**: `/stats`, `/approve`, `/find`, `/research` commands
- **Automated cron jobs**: Discovery (daily), research (2h), email generation (4h)
- **Production-ready**: PM2 cluster, Nginx SSL/rate-limiting, Docker, BullMQ retries

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20, TypeScript 5 |
| Frontend | Next.js 15, React 19, Tailwind CSS |
| Backend | Express.js 4, Zod, Winston |
| Database | MongoDB 7 via Prisma ORM 6 |
| Queues | BullMQ + Redis 7 |
| AI | Groq (llama-3.3-70b) via OpenAI SDK |
| Auth | JWT + NextAuth v5 |
| Infrastructure | Docker, Nginx, PM2 |

## Documentation Index

| Document | Contents |
|---|---|
| [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md) | What HERMES is, business purpose, architecture summary |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Layered architecture, module diagram, communication patterns |
| [SYSTEM_DESIGN.md](SYSTEM_DESIGN.md) | Design decisions, state machine, scalability |
| [BACKEND.md](BACKEND.md) | All controllers, services, workers, queues |
| [FRONTEND.md](FRONTEND.md) | Pages, components, routing, auth flow |
| [DATABASE.md](DATABASE.md) | Schema, ER diagram, data lifecycle |
| [API_REFERENCE.md](API_REFERENCE.md) | Every endpoint with request/response examples |
| [AUTHENTICATION.md](AUTHENTICATION.md) | JWT, NextAuth, RBAC, security model |
| [WORKFLOW.md](WORKFLOW.md) | End-to-end pipeline walkthrough with sequence diagrams |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Docker, VPS, PM2, Nginx setup |
| [SECURITY.md](SECURITY.md) | OWASP assessment, vulnerabilities, recommendations |
| [PERFORMANCE.md](PERFORMANCE.md) | Caching, bottlenecks, scalability analysis |
| [DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md) | How to add features, debug, coding standards |
| [CODE_REVIEW.md](CODE_REVIEW.md) | Code quality findings, technical debt |
| [AI_CONTEXT.md](AI_CONTEXT.md) | AI assistant context document |

## Environment Variables

Copy `.env.example` to `.env` and configure:

**Required**: `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `NEXTAUTH_SECRET`, `OPENAI_API_KEY`, `SMTP_*`  
**Optional**: `APOLLO_API_KEY`, `HUNTER_API_KEY`, `SERPAPI_KEY`, `CLEARBIT_API_KEY`, `TELEGRAM_BOT_TOKEN`

## Deployment

### Docker Compose (Recommended)
```bash
docker compose up -d
docker compose exec backend npm run db:push
```

### VPS (Ubuntu 24.04)
```bash
sudo bash scripts/setup-vps.sh
# Follow DEPLOYMENT.md for complete steps
```

## Repository Structure

```
hermes-agent/
├── apps/backend/     # Express API + workers + Telegram bot
├── apps/frontend/    # Next.js 15 dashboard
├── packages/agents/  # 8 AI agents + HermesOrchestrator
├── packages/database/# Prisma schema + MongoDB client
├── packages/shared/  # Shared TypeScript types
├── scripts/          # VPS setup script
├── docs/             # Complete documentation
├── docker-compose.yml
├── Dockerfile
├── nginx.conf
└── pm2.config.js
```

## License

Private — All rights reserved.
