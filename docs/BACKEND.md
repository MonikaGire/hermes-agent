# HERMES — Backend Documentation

## Overview

The backend is an Express.js REST API server running on Node.js 20, written in TypeScript (ESM). Entry point: `apps/backend/src/index.ts`. It listens on port 4000 and is proxied through Nginx.

---

## Application Bootstrap (`index.ts`)

Startup sequence:
1. Validate environment via `config/env.ts` (Zod)
2. Connect Redis client (`config/redis.ts`)
3. Initialize BullMQ queues (`queues/index.ts`)
4. Register background workers (`jobs/research.worker.ts`, `jobs/email-generation.worker.ts`, etc.)
5. Start cron jobs (`jobs/cron.ts`)
6. Initialize Telegram bot (`bot/telegram.ts`)
7. Mount Express application (`app.ts`)
8. Listen on `process.env.PORT || 4000`
9. Register graceful shutdown handlers (`SIGTERM`, `SIGINT`)

---

## Express Application (`app.ts`)

```typescript
// Middleware stack (in order)
cors({ origin: [env.APP_URL, 'http://localhost:3000'] })
helmet()
compression()
express.json({ limit: '10mb' })
express.urlencoded({ extended: true })
morgan('combined', { stream: logger.stream })
rateLimit({ windowMs: env.RATE_LIMIT_WINDOW_MS, max: env.RATE_LIMIT_MAX_REQUESTS })

// Health check
GET /health → { status: 'ok', timestamp, uptime }

// API routes
/api/auth       → auth.routes.ts
/api/prospects  → prospect.routes.ts
/api/companies  → company.routes.ts
/api/contacts   → contact.routes.ts
/api/research   → research.routes.ts
/api/emails     → email.routes.ts
/api/approvals  → approval.routes.ts
/api/dashboard  → dashboard.routes.ts
/api/settings   → settings.routes.ts
/api/telegram   → telegram.routes.ts
/api/discovery  → discovery.routes.ts
/api/waitlist   → waitlist.routes.ts

// Fallbacks
notFound middleware → 404 response
errorHandler middleware → shaped error response
```

---

## Configuration (`config/`)

### `config/env.ts`
Zod schema validates all `process.env` variables at startup. If any required variable is missing or malformed, the process exits immediately with a clear error message. This prevents silent misconfiguration in production.

Key validated groups:
- `NODE_ENV`, `PORT`, `APP_URL`
- `DATABASE_URL` (MongoDB connection string)
- `REDIS_URL` / `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD`
- `JWT_SECRET` (minimum 32 characters), `JWT_EXPIRES_IN`
- `OPENAI_BASE_URL`, `OPENAI_API_KEY`, `OPENAI_MODEL`
- All third-party API keys
- SMTP credentials
- Telegram bot token
- Queue configuration flags

### `config/logger.ts`
Winston logger with two transports:
- **Console**: colorized, human-readable (development)
- **File**: JSON structured logs in `logs/` directory (production)

Log levels: `error`, `warn`, `info`, `http`, `verbose`, `debug`, `silly`

### `config/redis.ts`
Initializes `ioredis` client using `REDIS_URL` (Upstash TLS URL in production) or individual `REDIS_HOST/PORT/PASSWORD` variables. Exports a singleton `redisClient`.

---

## Middleware (`middleware/`)

### `authenticate.ts`
```typescript
// Usage: router.get('/protected', authenticate, controller)
// Usage with role: router.post('/admin', authenticate, authorize('ADMIN'), controller)

authenticate = async (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '')
  const payload = jwt.verify(token, env.JWT_SECRET)  // throws on invalid
  const user = await prisma.user.findUnique({ where: { id: payload.sub } })
  if (!user || !user.isActive) throw new AppError('Unauthorized', 401)
  req.user = user
  next()
}

authorize = (role: UserRole) => (req, res, next) => {
  if (req.user.role !== role) throw new AppError('Forbidden', 403)
  next()
}
```

### `errorHandler.ts`
Global Express error handler. Catches:
- `AppError` (custom, known errors) → returns `{ success: false, message, statusCode }`
- `ZodError` → 422 validation error with field-level details
- Unexpected errors → 500 with sanitized message (stack hidden in production)

### `notFound.ts`
Catches unmatched routes → `AppError('Route not found', 404)`

---

## Utilities (`utils/`)

### `AppError.ts`
```typescript
class AppError extends Error {
  statusCode: number
  isOperational: boolean
  constructor(message: string, statusCode = 500)
}
```

### `response.ts`
```typescript
sendSuccess(res, data, message?, statusCode = 200)
sendCreated(res, data, message?)
paginate(res, data, total, page, limit)
```

---

## Routes & Controllers

### Auth (`auth.routes.ts`, `auth.controller.ts`)

| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| POST | `/api/auth/register` | None | Create new user |
| POST | `/api/auth/login` | None | Login, receive JWT |
| POST | `/api/auth/logout` | JWT | Invalidate session |
| GET | `/api/auth/me` | JWT | Get current user |
| POST | `/api/auth/refresh` | JWT | Refresh token |

### Prospects (`prospect.routes.ts`, `prospect.controller.ts`)

| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| GET | `/api/prospects` | JWT | List with pagination + filters |
| GET | `/api/prospects/stats` | JWT | Aggregate counts by status |
| GET | `/api/prospects/:id` | JWT | Single prospect detail |
| POST | `/api/prospects` | JWT | Create new prospect |
| PUT | `/api/prospects/:id` | JWT | Update prospect |
| DELETE | `/api/prospects/:id` | JWT, ADMIN | Delete prospect |
| POST | `/api/prospects/:id/research` | JWT | Trigger research job |
| POST | `/api/prospects/:id/email` | JWT | Trigger email generation job |

### Companies (`company.routes.ts`, `company.controller.ts`)

| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| GET | `/api/companies` | JWT | List companies |
| GET | `/api/companies/:id` | JWT | Company detail |
| POST | `/api/companies` | JWT | Create company |
| PUT | `/api/companies/:id` | JWT | Update company |
| DELETE | `/api/companies/:id` | JWT, ADMIN | Delete company |

### Contacts (`contact.routes.ts`, `contact.controller.ts`)

| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| GET | `/api/contacts` | JWT | List contacts |
| GET | `/api/contacts/:id` | JWT | Contact detail |
| POST | `/api/contacts` | JWT | Create contact |
| PUT | `/api/contacts/:id` | JWT | Update contact |
| DELETE | `/api/contacts/:id` | JWT, ADMIN | Delete contact |

### Research (`research.routes.ts`, `research.controller.ts`)

| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| GET | `/api/research` | JWT | List research results |
| GET | `/api/research/:companyId` | JWT | Research for company |
| POST | `/api/research/:companyId/trigger` | JWT | Manually trigger research |

### Emails (`email.routes.ts`, `email.controller.ts`)

| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| GET | `/api/emails` | JWT | List emails |
| GET | `/api/emails/:id` | JWT | Email detail |
| POST | `/api/emails/generate` | JWT | Trigger email generation |
| PUT | `/api/emails/:id` | JWT | Update email |
| DELETE | `/api/emails/:id` | JWT, ADMIN | Delete email |
| POST | `/api/emails/:id/regenerate` | JWT | Regenerate email |
| POST | `/api/emails/:id/send` | JWT | Send approved email |

### Approvals (`approval.routes.ts`, `approval.controller.ts`)

| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| GET | `/api/approvals` | JWT | Pending approvals queue |
| POST | `/api/approvals/:emailId/approve` | JWT | Approve email |
| POST | `/api/approvals/:emailId/skip` | JWT | Skip email |
| POST | `/api/approvals/:emailId/revise` | JWT | Request revision |

### Dashboard (`dashboard.routes.ts`, `dashboard.controller.ts`)

| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| GET | `/api/dashboard/stats` | JWT | Aggregate statistics |
| GET | `/api/dashboard/activity` | JWT | Recent activity feed |
| GET | `/api/dashboard/conversion` | JWT | Conversion funnel data |

### Discovery (`discovery.routes.ts`, `discovery.controller.ts`)

| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| POST | `/api/discovery/search` | JWT | Search for prospect companies |
| POST | `/api/discovery/import` | JWT | Import discovered companies |
| GET | `/api/discovery/status` | JWT | Discovery job status |

### Settings (`settings.routes.ts`, `settings.controller.ts`)

| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| GET | `/api/settings` | JWT, ADMIN | Get all settings |
| PUT | `/api/settings` | JWT, ADMIN | Update settings |
| POST | `/api/settings/test/:integration` | JWT, ADMIN | Test integration connection |

### Telegram (`telegram.routes.ts`)

| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| POST | `/api/telegram/webhook` | Token | Receive Telegram updates |

### Waitlist (`waitlist.routes.ts`, `waitlist.controller.ts`)

| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| POST | `/api/waitlist` | API Key | Add email to waitlist |
| GET | `/api/waitlist` | JWT, ADMIN | List waitlist entries |
| POST | `/api/waitlist/send` | JWT, ADMIN | Send emails to pending waitlist |

---

## Services (Business Logic)

### `auth.service.ts`
- `register(dto)`: Hash password (bcrypt, 12 rounds), create User record, return JWT
- `login(dto)`: Find user by email, compare password, update `lastLoginAt`, return JWT
- `getById(id)`: Fetch user by Prisma ID
- `refresh(token)`: Verify token, reissue with fresh expiry

### `prospect.service.ts`
- `list(filters, pagination)`: Paginated query with status/industry/country filters
- `getStats()`: Count by ProspectStatus enum values
- `create(dto)`: Insert Company + optional Contact records
- `triggerResearch(companyId)`: Add job to `research` queue, update status → RESEARCHING
- `triggerEmailGeneration(companyId)`: Add job to `email-generation` queue, update status → EMAIL_DRAFT

### `email.service.ts`
- `generate(companyId)`: Dispatch to email-generation queue
- `send(emailId)`: Load email + contact, send via Nodemailer, update status → SENT, log activity
- `regenerate(emailId)`: Dispatch re-generation with existing context
- `update(id, dto)`: Update body/subject/tone
- `delete(id)`: Hard delete

### `discovery.service.ts`
- `search(query)`: Call SerpAPI for Google results OR use ProspectFinderAgent for AI-based discovery
- `scrapeContacts(companyUrl)`: Fetch contact info from Apollo.io
- `importCompanies(candidates)`: Bulk insert Company records

### `activity.service.ts`
- `logActivity(type, entityType, entityId, companyId?, userId?, meta?)`: Insert Activity record for audit trail

---

## Validation (`validators/`)

All validators use Zod schemas. Controllers call `.parse()` or `.safeParse()` on request bodies.

```typescript
// Example: auth.validator.ts
loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
})

registerSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8).regex(/[A-Z]/).regex(/[0-9]/)
})
```

---

## Background Workers (`jobs/`)

### `research.worker.ts`
- Queue: `research`
- Concurrency: 5
- Process:
  1. Load company from DB
  2. Optionally call SerpAPI for news
  3. Optionally call Clearbit for enrichment
  4. Run `CompanyResearchAgent`
  5. Run `PainPointAnalysisAgent`
  6. Save `Research` record + `PainPoint` records to DB
  7. Update company status → RESEARCHED
  8. Log activity

### `email-generation.worker.ts`
- Queue: `email-generation`
- Concurrency: 3
- Process:
  1. Load company + existing research from DB
  2. Find primary contact via Hunter.io
  3. Run `HermesOrchestrator`
  4. Save `Email` record with review scores
  5. Update company status → EMAIL_PENDING or EMAIL_APPROVED
  6. Log activity

### `prospect-discovery.worker.ts`
- Queue: `prospect-discovery`
- Process:
  1. Run `ProspectFinderAgent` with configured criteria
  2. Filter out existing companies
  3. Bulk insert new Company records
  4. Log discovery activity

### `cron.ts`
```typescript
// 4 scheduled jobs using node-cron
cron.schedule('0 2 * * *', () => discoveryQueue.add(...))          // daily 2am
cron.schedule('0 */2 * * *', () => researchQueue.add(...))         // every 2h
cron.schedule('0 */4 * * *', () => emailGenerationQueue.add(...))  // every 4h
cron.schedule('0 1 * * *', () => statsQueue.add(...))              // daily 1am
```

---

## Queue Architecture (`queues/index.ts`)

```typescript
// BullMQ queue configuration
const defaultJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: 100,
  removeOnFail: 50
}

// Queues
export const researchQueue = new Queue('research', { connection: redisClient })
export const emailGenerationQueue = new Queue('email-generation', { connection: redisClient })
export const prospectDiscoveryQueue = new Queue('prospect-discovery', { connection: redisClient })
export const emailSendingQueue = new Queue('email-sending', { connection: redisClient })
export const followUpQueue = new Queue('follow-up', { connection: redisClient })

export function getQueue(name: string): Queue
export async function closeQueues(): Promise<void>
```

---

## Telegram Bot (`bot/telegram.ts`)

Uses **Telegraf** framework. Commands:
- `/start` — Welcome message, dashboard link
- `/stats` — Pull `dashboard.service.ts` stats, format as message
- `/approve [emailId]` — Approve a pending email (calls approval service)
- `/find [query]` — Trigger prospect discovery search
- `/research [companyId]` — Trigger research job for a company

Bot is registered as a webhook at `TELEGRAM_WEBHOOK_URL/api/telegram/webhook`.

---

## Email Templates (`templates/`)

### `nofoal-waitlist.ts`
HTML email template for waitlist confirmation. Exports a function that returns an HTML string with inline styles (for email client compatibility). Uses placeholder interpolation for name and personalized content.

---

## Integrations (`integrations/`)

### `openai.service.ts`
OpenAI SDK client configured with `OPENAI_BASE_URL` pointing to Groq's API endpoint. Exports `chat(messages, options)` method used by `BaseAgent`.

### `apollo.service.ts`
Apollo.io REST API wrapper:
- `searchCompanies(query, filters)` → company search results
- `getPersons(companyDomain)` → decision makers at company

### `hunter.service.ts`
Hunter.io REST API wrapper:
- `findEmail(firstName, lastName, domain)` → verified email address
- `verifyEmail(email)` → deliverability check

### `serpapi.service.ts`
SerpAPI wrapper:
- `search(query)` → Google organic search results (title, URL, snippet)

### `clearbit.service.ts`
Clearbit Enrichment API wrapper:
- `enrichCompany(domain)` → employees, tech stack, industry, description, logo URL

### `email-sender.service.ts`
Nodemailer SMTP wrapper:
- `sendEmail({ to, subject, html, text, messageId })` → sends via configured SMTP
- Supports Gmail, SendGrid, AWS SES (via SMTP configuration)

---

## Types (`types/`)

### `auth.types.ts`
```typescript
interface JwtPayload { sub: string; email: string; role: UserRole; iat: number; exp: number }
interface LoginDto { email: string; password: string }
interface RegisterDto { name: string; email: string; password: string }
interface AuthResponse { token: string; user: { id, name, email, role } }
```

---

## Logging Strategy

Winston is configured with:
- `info` level for normal operations
- `error` level for caught exceptions
- `warn` level for non-critical issues
- HTTP request log via morgan piped to Winston stream

Log format in production: JSON with timestamp, level, message, and metadata.
Log format in development: Colorized text.

Logs are written to:
- `logs/error.log` — errors only
- `logs/combined.log` — all levels
