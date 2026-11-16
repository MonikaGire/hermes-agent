# HERMES — Code Quality Review

## Summary

Overall the codebase demonstrates strong architectural thinking: clear separation of concerns, a well-designed agent abstraction, proper async queue-based processing, and production-ready infrastructure configuration. The findings below are prioritized opportunities to increase reliability, maintainability, and security.

---

## Severity Levels
- **Critical**: Likely to cause bugs, data loss, or security issues in production
- **High**: Significant maintainability risk or performance degradation
- **Medium**: Code smell, missing safeguard, or suboptimal pattern
- **Low**: Style, naming, or minor improvement opportunity

---

## Critical Findings

### C1 — No Test Suite

**Location**: Entire codebase  
**Finding**: Zero automated tests exist. No unit tests, integration tests, or end-to-end tests.  
**Risk**: Every change risks breaking existing functionality with no safety net. Agent prompt changes could silently degrade email quality.  
**Recommendation**: Add Vitest for unit tests on agents and services; Supertest for API integration tests. Prioritize testing the HermesOrchestrator retry logic and the auth flow.

---

### C2 — Secret Storage in MongoDB Without Encryption

**Location**: `packages/database/prisma/schema.prisma` → `Integration.config` (Json field)  
**Finding**: API keys for Apollo, Hunter, Clearbit, SerpAPI are stored as plaintext JSON in MongoDB.  
**Risk**: If MongoDB backup or replica is compromised, all third-party API credentials are exposed.  
**Recommendation**: Encrypt the `config` field before writing to DB using AES-256-GCM. Decrypt in `settings.service.ts` before returning. Use `FIELD_ENCRYPTION_KEY` env variable as the key.

---

## High Priority Findings

### H1 — No Account Lockout

**Location**: `apps/backend/src/services/auth.service.ts`  
**Finding**: Failed login attempts are not tracked. An attacker with a valid email can attempt unlimited passwords (only Nginx rate limiting slows them down).  
**Recommendation**: Add `failedLoginAttempts: Int` and `lockedUntil: DateTime?` to the User model. Lock after 10 failures; unlock automatically after 15 minutes.

---

### H2 — JWT Blocklist Not Implemented

**Location**: `apps/backend/src/services/auth.service.ts` → `logout()`  
**Finding**: Logout only clears the client-side session cookie. The backend JWT remains valid until expiry (7 days). A leaked token cannot be revoked.  
**Recommendation**: On logout, store the token's `jti` claim in Redis with TTL matching the token's remaining lifetime. In `authenticate.ts`, check if `jti` is in the blocklist before proceeding.

---

### H3 — Missing Pagination on Activity Table

**Location**: `apps/backend/src/services/dashboard.service.ts`  
**Finding**: The activity feed query likely fetches all recent records without a hard limit. As the table grows (audit log for every action), this becomes increasingly expensive.  
**Recommendation**: Always pass `take: limit` (max 50) and use cursor-based pagination for the activity feed.

---

### H4 — No Full-Text Search Index on Company Name

**Location**: `packages/database/prisma/schema.prisma`  
**Finding**: The `search` parameter in `GET /api/prospects` likely generates a MongoDB regex query (`{ name: { $regex: pattern } }`). Without a text index, this is a full collection scan.  
**Recommendation**: Add `@@fulltext([name, description])` in Prisma schema (MongoDB text index) and use `$text: { $search: query }` for search operations.

---

### H5 — Orchestrator Error Swallowing

**Location**: `packages/agents/src/orchestrator.ts`  
**Finding**: The orchestrator returns "best available result" when all 3 retry attempts fail. It's unclear if the failure is surfaced to the UI or Activity log. Silently accepting a low-quality email is worse than surfacing the failure.  
**Recommendation**: If `overall` score < 40 after all attempts, throw an error and let the job fail (triggering BullMQ retry) rather than saving a poor email.

---

## Medium Priority Findings

### M1 — Duplicate Service Calls in Workers

**Location**: `apps/backend/src/jobs/research.worker.ts` and `apps/backend/src/jobs/email-generation.worker.ts`  
**Finding**: Both workers load the company from MongoDB at the start. If job payloads included the full company object, the DB round-trip could be eliminated.  
**Note**: The current approach is safer (ensures fresh data) — only refactor if DB latency becomes a bottleneck.

---

### M2 — Hardcoded Retry Count in Orchestrator

**Location**: `packages/agents/src/orchestrator.ts`  
**Finding**: `maxAttempts = 3` is hardcoded in the orchestrator file.  
**Recommendation**: Move to a config constant in `packages/shared/src/constants.ts` so it can be tuned without editing agent code.

---

### M3 — Missing Input Sanitization for Email Body

**Location**: `apps/backend/src/services/email.service.ts` → `send()`  
**Finding**: The email `body` field comes from AI-generated output stored in MongoDB and is sent directly via Nodemailer. If the body ever contained malicious content (e.g., phishing links from a compromised LLM), it would be sent without review filtering.  
**Recommendation**: The human approval step is the primary mitigation. Document this explicitly and consider adding a basic HTML sanitization pass (`sanitize-html`) before sending.

---

### M4 — No Environment Variable for Discovery Target Criteria

**Location**: `apps/backend/src/jobs/cron.ts`  
**Finding**: The cron discovery job likely has hardcoded or loosely configured industry/country targets.  
**Recommendation**: Drive discovery criteria from the `Setting` model (already exists in schema) so admins can change targets without code changes.

---

### M5 — `rawData` Field on Research Model

**Location**: `packages/database/prisma/schema.prisma` → `Research.rawData`  
**Finding**: `rawData` stores the full unstructured LLM output as JSON. This grows unboundedly and has no clear consumer.  
**Recommendation**: Add a data retention policy — clear `rawData` after 30 days (keep structured fields). Or remove `rawData` if it's only used for debugging.

---

### M6 — Missing Soft Delete

**Location**: `packages/database/prisma/schema.prisma`  
**Finding**: `DELETE /api/prospects/:id` performs a hard delete, cascading to all related records (contacts, research, emails, approvals, activities). This destroys the audit trail.  
**Recommendation**: Add `deletedAt: DateTime?` to Company/Contact/Email models and filter `where: { deletedAt: null }` in all list queries. Preserve the audit trail.

---

### M7 — WaitlistLead Email Uniqueness Constraint

**Location**: `packages/database/prisma/schema.prisma` → `WaitlistLead.email @unique`  
**Finding**: The `@unique` constraint on `email` prevents re-subscribing after being set to `REJECTED` status.  
**Recommendation**: Either remove the unique constraint and handle deduplication in service logic, or add an upsert that resets the status to PENDING if re-subscribing.

---

## Low Priority Findings

### L1 — Large `app.ts` Route Registration

**Location**: `apps/backend/src/app.ts`  
**Finding**: All 12 route registrations in one file. As the API grows, this becomes unwieldy.  
**Recommendation**: Create a `routes/index.ts` that aggregates all route registrations, and import that single file in `app.ts`.

---

### L2 — `any` Types in Middleware

**Location**: `apps/backend/src/middleware/authenticate.ts`  
**Finding**: `req.user` is likely typed as `any` after assignment (TypeScript doesn't know about custom Express request properties without augmentation).  
**Recommendation**: Add Express type augmentation in `apps/backend/src/types/express.d.ts`:
```typescript
declare global {
  namespace Express {
    interface Request {
      user: import('@prisma/client').User
    }
  }
}
```

---

### L3 — Telegram Bot Not Gracefully Shutting Down

**Location**: `apps/backend/src/bot/telegram.ts` and `apps/backend/src/index.ts`  
**Finding**: The Telegraf bot may not be stopped during graceful shutdown. Any pending webhook processing would be abandoned.  
**Recommendation**: Add `bot.stop('SIGTERM')` / `bot.stop('SIGINT')` to the shutdown handlers in `index.ts`.

---

### L4 — Unused `SMTP_PORT` as String

**Location**: `.env.example`  
**Finding**: `SMTP_PORT` is defined as a string in the env file (`"587"`). Nodemailer expects a number.  
**Recommendation**: Add `z.coerce.number()` to the Zod env schema for `SMTP_PORT` to ensure it's properly converted.

---

### L5 — No Logging in Frontend

**Location**: `apps/frontend/src/`  
**Finding**: No error tracking or logging on the frontend side.  
**Recommendation**: Add Sentry's Next.js SDK for client-side and server-side error capture.

---

## Technical Debt Summary

| Category | Count | Total Effort |
|---|---|---|
| Critical | 2 | ~2 weeks |
| High | 5 | ~3 weeks |
| Medium | 7 | ~2 weeks |
| Low | 5 | ~3 days |

---

## Refactoring Opportunities

### Priority 1: Testing Infrastructure
Set up Vitest + Supertest. Write tests for the HermesOrchestrator and auth flow first. This reduces all other refactoring risk.

### Priority 2: Encryption for Integration Config
One-time migration + field encryption. High security value, moderate complexity.

### Priority 3: Soft Delete Pattern
Add `deletedAt` to core models. Requires updating all list queries but is a clear, repeatable pattern.

### Priority 4: Full-Text Search Index
Single schema change + query update. High performance value for large datasets.

---

## Code Strengths (What's Done Well)

- **Agent abstraction**: `BaseAgent<TInput, TOutput>` provides clean generics, error wrapping, and timing — all agents are consistent
- **Zod env validation**: Process fails fast with clear error messages on misconfiguration
- **Queue-based async**: Heavy LLM work never blocks HTTP threads — good separation of concerns
- **Prisma type safety**: Database queries are fully typed — no raw string queries
- **Layered architecture**: Controllers never touch DB directly; services never parse HTTP — clean layer boundaries maintained throughout
- **Multi-stage Docker build**: Production image excludes dev dependencies and runs as non-root user
- **Nginx config**: Production-grade rate limiting, SSL, and security headers
