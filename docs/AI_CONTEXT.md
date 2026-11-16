# HERMES — AI Context Document

> This document is written specifically for AI assistants (LLMs, code completion tools, agents).
> Read this first before making any changes to the codebase.

---

## What Is This Project?

HERMES is a **B2B outreach automation platform for manufacturing ERP software sales**. It:
1. Discovers manufacturing companies as sales prospects (Google, Apollo.io, AI)
2. Researches each company deeply using AI agents (8 specialized agents)
3. Generates hyper-personalized cold emails using a multi-agent pipeline
4. Routes emails through a human approval workflow (web UI + Telegram bot)
5. Sends approved emails via SMTP and tracks responses

The AI pipeline is the core value proposition. Everything else (frontend, auth, DB) serves the pipeline.

---

## Repository Layout

```
hermes-agent/
├── apps/backend/src/          # Express API server (Node.js 20 + TypeScript ESM)
├── apps/frontend/src/         # Next.js 15 dashboard (React 19)
├── packages/agents/src/       # AI agent library ← CORE
├── packages/database/prisma/  # MongoDB schema (Prisma 6)
└── packages/shared/src/       # Shared TypeScript types
```

---

## Package Identity

| Import | Package Path | Role |
|---|---|---|
| `@hermes/agents` | `packages/agents/` | All AI agent classes |
| `@hermes/database` | `packages/database/` | Prisma client singleton |
| `@hermes/shared` | `packages/shared/` | TypeScript types + constants |

TypeScript path aliases resolve these at build time. No `npm publish` required.

---

## Key Architectural Invariants

1. **Never make LLM calls in HTTP request handlers.** All LLM work goes to BullMQ queues. HTTP handlers dispatch jobs and return immediately.

2. **Agents are stateless.** Each `agent.run()` call is independent. No state is stored in agent instances between calls.

3. **The state machine is enforced by service layer.** Only `prospect.service.ts` should update `Company.status`. Controllers must not touch status directly.

4. **Prisma is the only DB access layer.** No raw MongoDB queries anywhere. Every DB operation goes through `packages/database/src/index.ts` → Prisma client.

5. **All secrets come from `process.env`.** Validated by Zod in `apps/backend/src/config/env.ts`. If env.ts doesn't export it, it doesn't exist at runtime.

6. **Error handling pattern**: Services throw `AppError`. Controllers catch with `next(error)`. `errorHandler.ts` formats the response. Never `res.status(500).json(...)` directly in controllers.

---

## AI Agent Architecture

### BaseAgent (`packages/agents/src/base.agent.ts`)

All agents extend this. Key methods:
- `chat(systemPrompt, userMessage, options)` → calls Groq LLM, returns `{ content, tokensUsed }`
- `parseJSON<T>(text)` → extracts JSON from markdown code blocks, parses, returns typed object
- `wrap<T>(fn)` → wraps agent execution with timing + error handling, returns `AgentResult<T>`

### HermesOrchestrator (`packages/agents/src/orchestrator.ts`)

Chains agents in sequence:
1. `CompanyResearchAgent` → research data
2. `PainPointAnalysisAgent` → pain points
3. Loop (max 3): `EmailWriterAgent` → `ReviewAgent` → if pass: `ApprovalAgent`

Returns `OrchestrationResult { email, approvalStatus, attempts, tokensUsed }`.

### Agent Result Type

```typescript
interface AgentResult<T> {
  success: boolean
  data?: T
  error?: string
  tokensUsed?: number
  durationMs?: number
}
```

Always check `result.success` before accessing `result.data`.

---

## Database Model Quick Reference

| Model | Key Fields | Status Field |
|---|---|---|
| `Company` | name, website, industry, country, employeeCount | `status: ProspectStatus` |
| `Contact` | firstName, lastName, email, role, isVerified | — |
| `Research` | companyId (unique), products[], summary, confidenceScore | — |
| `PainPoint` | companyId, problem, erpCapability, evidenceScore, isPrimary | — |
| `Email` | companyId, contactId, subject, body, reviewScores, version | `status: EmailStatus` |
| `Approval` | emailId, userId, action, reason, instructions | — |
| `Activity` | type, entityType, entityId, companyId | — |
| `Integration` | provider (unique), isActive, config | — |
| `WaitlistLead` | email (unique), name, source | `status: WaitlistStatus` |
| `Setting` | key (unique), value | — |

All `id` fields are MongoDB ObjectIds stored as strings.

---

## ProspectStatus State Machine

```
NEW → RESEARCHING → RESEARCHED → EMAIL_DRAFT → EMAIL_PENDING → EMAIL_APPROVED → EMAIL_SENT → REPLIED → CONVERTED
                                                    ↓
                                                 SKIPPED
```

A company can be SKIPPED from EMAIL_PENDING (human decision) or from NEW/RESEARCHED (manual removal).

---

## Common Coding Patterns

### Service returning paginated data

```typescript
// services/some.service.ts
async list(filters: Filters, page = 1, limit = 20) {
  const [data, total] = await Promise.all([
    prisma.model.findMany({ where: filters, take: limit, skip: (page-1)*limit, orderBy: { createdAt: 'desc' } }),
    prisma.model.count({ where: filters })
  ])
  return { data, total, page, limit }
}
```

### Controller calling service and responding

```typescript
// controllers/some.controller.ts
export const list = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, limit, ...filters } = req.query
    const result = await someService.list(filters, Number(page), Number(limit))
    paginate(res, result.data, result.total, result.page, result.limit)
  } catch (error) {
    next(error)
  }
}
```

### Dispatching a background job

```typescript
// From a service:
await researchQueue.add('research-company', { companyId }, { priority: 1 })
await prisma.company.update({ where: { id: companyId }, data: { status: 'RESEARCHING' } })
```

### Running an agent

```typescript
const agent = new CompanyResearchAgent()
const result = await agent.run({ companyName: '...', website: '...', industry: '...' })
if (!result.success) {
  logger.error('Agent failed', { error: result.error })
  throw new Error(result.error)
}
const researchData = result.data!
```

---

## Environment Variables That Matter

| Variable | Used By | What It Does |
|---|---|---|
| `OPENAI_BASE_URL` | `packages/agents` | Points to Groq API endpoint |
| `OPENAI_API_KEY` | `packages/agents` | Groq API key |
| `OPENAI_MODEL` | `packages/agents` | Model name (llama-3.3-70b-versatile) |
| `DATABASE_URL` | `packages/database` | MongoDB connection string |
| `REDIS_URL` | `apps/backend/config/redis.ts` | BullMQ queue backing store |
| `JWT_SECRET` | `apps/backend/middleware/authenticate.ts` | JWT signing/verification |
| `QUEUES_ENABLED` | `apps/backend/src/index.ts` | Set false to disable workers (testing) |

---

## Business Rules (Critical)

1. **Emails MUST be approved by a human before sending.** Never auto-send emails even if `ApprovalAgent` returns APPROVED. The approval agent's decision is a recommendation; a human must confirm via UI or Telegram.

   *Exception*: If `autoApprove: true` is explicitly passed to the orchestrator (currently only from test environments). In production this should always be `false`.

2. **Research must exist before email generation.** The email generation worker reads `Research` and `PainPoint` records. If they don't exist, the orchestrator produces generic (low-quality) emails.

3. **The primary pain point drives email personalization.** `PainPoint.isPrimary = true` identifies the single most relevant pain point. `EmailWriterAgent` focuses on this.

4. **Email versions are tracked.** Each regeneration increments `Email.version`. The `Approval` model records which version was acted on. Don't delete old email versions — they're part of the audit trail.

5. **Activity records are append-only.** Never update or delete Activity records. They form the immutable audit trail.

---

## Extension Guidelines

### Adding a new external integration

1. Create `apps/backend/src/integrations/newservice.service.ts`
2. Add API key to `apps/backend/src/config/env.ts` (Zod schema)
3. Add `newservice` as a provider value in `packages/database/prisma/schema.prisma` → `Integration.provider`
4. Gracefully degrade: return empty/null on API failure, don't throw
5. Add test connection endpoint in `settings.controller.ts`

### Adding a new agent

1. Create `packages/agents/src/new-agent.ts` extending `BaseAgent<Input, Output>`
2. Define `Input` and `Output` interfaces in the file
3. Export from `packages/agents/src/index.ts`
4. Import in `packages/agents/package.json` exports (if needed externally)

### Adding a new pipeline stage

1. Add new status value to `ProspectStatus` enum in schema
2. Run `npm run db:generate` + `npm run db:push`
3. Update the state machine comment in `packages/shared/src/types/index.ts`
4. Add new queue + worker if the stage requires async processing
5. Update `dashboard.service.ts` stats to include new status

---

## What NOT to Change Without Understanding Impact

| File | Why It's Sensitive |
|---|---|
| `packages/database/prisma/schema.prisma` | Schema changes require `db:push`; some changes are destructive |
| `apps/backend/src/middleware/authenticate.ts` | Auth bug = all endpoints unprotected or broken |
| `packages/agents/src/orchestrator.ts` | Retry logic changes affect email quality at scale |
| `apps/backend/src/config/env.ts` | Removing a required env var breaks deployment |
| `packages/agents/src/base.agent.ts` | Changes affect ALL agents simultaneously |
| `nginx.conf` | Security headers and rate limits protect production |
