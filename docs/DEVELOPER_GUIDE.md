# HERMES — Developer Guide

## Prerequisites

| Tool | Minimum Version | Install |
|---|---|---|
| Node.js | 20.0.0 | https://nodejs.org or nvm |
| npm | 10.0.0 | Bundled with Node.js |
| Git | 2.x | https://git-scm.com |
| MongoDB | 7.0 (or Atlas) | Local or cloud |
| Redis | 7.0 (or Upstash) | Local or cloud |

---

## Initial Setup

```bash
# 1. Clone repository
git clone <repo-url>
cd hermes-agent

# 2. Install all workspace dependencies
npm install

# 3. Set up environment
cp .env.example .env
```

Edit `.env` with these minimum required values for local development:
```env
NODE_ENV=development
DATABASE_URL="mongodb://localhost:27017/hermes"
REDIS_URL="redis://localhost:6379"
JWT_SECRET="your-local-development-secret-32chars-minimum"
NEXTAUTH_SECRET="another-32-char-secret-for-nextauth"
AUTH_SECRET="third-32-char-secret-for-auth"
APP_URL="http://localhost:3000"
API_URL="http://localhost:4000"
NEXT_PUBLIC_API_URL="http://localhost:4000"
OPENAI_BASE_URL="https://api.groq.com/openai/v1"
OPENAI_API_KEY="gsk_your_groq_api_key"
OPENAI_MODEL="llama-3.3-70b-versatile"
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_USER="your@gmail.com"
SMTP_PASS="your-app-password"
SMTP_FROM="HERMES <your@gmail.com>"
```

```bash
# 4. Generate Prisma client
npm run db:generate

# 5. Push schema to MongoDB
npm run db:push

# 6. Seed initial data (creates admin user)
npm run db:seed

# 7. Start development servers
npm run dev
```

Application will be available at:
- Frontend: http://localhost:3000
- Backend API: http://localhost:4000
- Health check: http://localhost:4000/health

---

## Available Scripts (Root)

```bash
npm run dev           # Start backend + frontend concurrently (with hot reload)
npm run build         # Build backend (tsc) + frontend (next build)
npm run lint          # ESLint across all packages
npm run type-check    # TypeScript type checking across all packages
npm run db:generate   # Generate Prisma client from schema
npm run db:push       # Apply schema to MongoDB
npm run db:push:reset # Drop and re-apply schema (DESTRUCTIVE)
npm run db:seed       # Run seed script
npm run db:studio     # Open Prisma Studio (GUI for MongoDB)
```

---

## Project Structure for Development

```
hermes-agent/
├── apps/
│   ├── backend/src/          # Edit backend source here
│   │   ├── routes/           # Add new routes here
│   │   ├── controllers/      # Add new controllers here
│   │   ├── services/         # Business logic here
│   │   ├── validators/       # Zod schemas here
│   │   └── integrations/     # Third-party clients here
│   └── frontend/src/
│       ├── app/              # Next.js pages here
│       └── components/       # React components here
├── packages/
│   ├── agents/src/           # AI agent implementations
│   ├── database/prisma/      # Edit schema.prisma here
│   └── shared/src/           # Shared TypeScript types
└── .env                      # Local configuration (not committed)
```

---

## How to Add a New API Endpoint

**Example**: Adding `GET /api/prospects/:id/timeline`

### Step 1: Add Route

`apps/backend/src/routes/prospect.routes.ts`:
```typescript
import { timelineController } from '../controllers/prospect.controller.js'

router.get('/:id/timeline', authenticate, timelineController)
```

### Step 2: Add Controller

`apps/backend/src/controllers/prospect.controller.ts`:
```typescript
export const timelineController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params
    const timeline = await prospectService.getTimeline(id)
    sendSuccess(res, timeline)
  } catch (error) {
    next(error)
  }
}
```

### Step 3: Add Validator (if request body needed)

`apps/backend/src/validators/prospect.validator.ts`:
```typescript
export const timelineQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional()
})
```

### Step 4: Add Service Method

`apps/backend/src/services/prospect.service.ts`:
```typescript
async getTimeline(companyId: string) {
  const activities = await prisma.activity.findMany({
    where: { companyId },
    orderBy: { createdAt: 'asc' }
  })
  return activities
}
```

### Step 5: Add Shared Type (if new response shape)

`packages/shared/src/types/index.ts`:
```typescript
export interface TimelineEntry {
  id: string
  type: string
  meta: Record<string, unknown>
  createdAt: string
}
```

---

## How to Add a New Database Collection (Model)

**Example**: Adding a `Note` model for sales notes on companies

### Step 1: Edit Prisma Schema

`packages/database/prisma/schema.prisma`:
```prisma
model Note {
  id        String   @id @default(auto()) @map("_id") @db.ObjectId
  companyId String   @db.ObjectId
  company   Company  @relation(fields: [companyId], references: [id])
  userId    String   @db.ObjectId
  user      User     @relation(fields: [userId], references: [id])
  content   String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([companyId])
}
```

Add the reverse relation to Company:
```prisma
model Company {
  // existing fields...
  notes Note[]
}
```

### Step 2: Apply Schema

```bash
npm run db:generate  # Regenerate Prisma client
npm run db:push      # Apply to MongoDB
```

### Step 3: Add Service, Controller, Routes

Follow the same pattern as the API endpoint example above.

---

## How to Add a New AI Agent

**Example**: Adding a `CompetitorAnalysisAgent`

### Step 1: Create Agent File

`packages/agents/src/competitor-analysis.agent.ts`:
```typescript
import { BaseAgent, AgentResult } from './base.agent.js'

interface CompetitorAnalysisInput {
  companyName: string
  industry: string
}

interface CompetitorAnalysisOutput {
  competitors: string[]
  differentiators: string[]
  marketPosition: string
}

export class CompetitorAnalysisAgent extends BaseAgent<
  CompetitorAnalysisInput,
  CompetitorAnalysisOutput
> {
  async run(input: CompetitorAnalysisInput): Promise<AgentResult<CompetitorAnalysisOutput>> {
    return this.wrap(async () => {
      const systemPrompt = `You are a market research analyst specializing in manufacturing software. 
      Identify competitors and market position based on company information.
      Return valid JSON only.`

      const userMessage = `Analyze competitors for: ${input.companyName} in ${input.industry} industry`

      const { content } = await this.chat(systemPrompt, userMessage, { temperature: 0.3 })
      return this.parseJSON<CompetitorAnalysisOutput>(content)
    })
  }
}
```

### Step 2: Export from Package Index

`packages/agents/src/index.ts`:
```typescript
export { CompetitorAnalysisAgent } from './competitor-analysis.agent.js'
```

### Step 3: Use in Orchestrator or Worker

```typescript
import { CompetitorAnalysisAgent } from '@hermes/agents'

const agent = new CompetitorAnalysisAgent()
const result = await agent.run({ companyName: 'Acme', industry: 'Manufacturing' })
if (result.success) {
  console.log(result.data?.competitors)
}
```

---

## How to Add a Frontend Page

**Example**: Adding `/analytics` page

### Step 1: Create Page File

`apps/frontend/src/app/(dashboard)/analytics/page.tsx`:
```typescript
import { AnalyticsPanel } from '@/components/analytics/AnalyticsPanel'

export default function AnalyticsPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Analytics</h1>
      <AnalyticsPanel />
    </div>
  )
}
```

### Step 2: Create Component

`apps/frontend/src/components/analytics/AnalyticsPanel.tsx`:
```typescript
'use client'

import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'

export function AnalyticsPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ['analytics'],
    queryFn: () => api.get('/api/dashboard/stats').then(r => r.data.data)
  })

  if (isLoading) return <div>Loading...</div>
  return <div>{/* render analytics */}</div>
}
```

### Step 3: Add to Sidebar

`apps/frontend/src/components/layout/Sidebar.tsx`:
```typescript
{ href: '/analytics', label: 'Analytics', icon: BarChart2 }
```

---

## Debugging

### Backend Debugging

```bash
# View real-time logs
pm2 logs hermes-backend  # Production
# or in development:
npm run dev  # Logs appear in terminal

# Inspect BullMQ queues
# Install Bull Board (optional)
npm install @bull-board/express @bull-board/api

# Prisma Studio (view/edit MongoDB data)
npm run db:studio  # Opens browser GUI at localhost:5555
```

### Frontend Debugging

```bash
# Next.js debug mode
NODE_OPTIONS='--inspect' npm run dev
# Then open chrome://inspect in Chrome

# React Query DevTools (add to providers.tsx in development)
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
// Add <ReactQueryDevtools /> inside QueryClientProvider
```

### Common Issues

| Issue | Cause | Fix |
|---|---|---|
| `Zod error: JWT_SECRET too short` | `.env` missing or secret < 32 chars | Generate: `openssl rand -hex 32` |
| `Prisma Client not generated` | `db:generate` not run | `npm run db:generate` |
| `Cannot connect to MongoDB` | Wrong `DATABASE_URL` | Check connection string format |
| `BullMQ not processing jobs` | `QUEUES_ENABLED=false` | Set `QUEUES_ENABLED=true` in `.env` |
| `Next.js 401 on API calls` | Session not passing JWT | Check `lib/auth.ts` jwt callback |
| `CORS error in browser` | `APP_URL` mismatch | Ensure `APP_URL` in `.env` matches browser URL |

---

## Coding Standards

### TypeScript
- Strict mode enabled (`"strict": true` in tsconfig)
- No `any` types — use `unknown` + type guard when necessary
- Use `interface` for object shapes, `type` for unions/intersections
- Export types from `packages/shared/src/types/index.ts` for cross-package sharing
- ESM modules: use `.js` extension in import paths (`import from './service.js'`)

### Naming Conventions

| Category | Convention | Example |
|---|---|---|
| Files | kebab-case | `company-research.agent.ts` |
| Classes | PascalCase | `CompanyResearchAgent` |
| Functions/methods | camelCase | `triggerResearch()` |
| Variables | camelCase | `companyId` |
| Constants | SCREAMING_SNAKE_CASE | `DEFAULT_TIMEOUT` |
| MongoDB IDs | `id` (mapped from `_id`) | `company.id` |
| Route handlers | Noun + verb | `prospectController.create` |
| Zod schemas | camelCase + Schema | `createProspectSchema` |

### File Organization
- One class per file
- Routes → Controllers → Services → Integrations (never skip layers)
- Services should not import other services (use composition via index/orchestrator)
- No business logic in controllers (only parsing, validation, delegation)
- No direct Prisma calls in controllers (always via services)

---

## Testing

*Note*: The codebase does not include a test suite as of the current snapshot. Recommendations for adding tests:

### Unit Tests (Recommended: Vitest)
```bash
npm install -D vitest @vitest/ui
```

Good candidates for unit tests:
- `packages/agents/src/base.agent.ts` — `parseJSON()` method
- `utils/response.ts` — `sendSuccess()`, `paginate()`
- Zod validators — test valid/invalid inputs
- `auth.service.ts` — token generation logic

### Integration Tests (Recommended: Supertest)
```bash
npm install -D supertest @types/supertest
```

Test auth flow, CRUD endpoints against test MongoDB instance.

### End-to-End Tests (Recommended: Playwright)
Test full workflow: login → create prospect → trigger research → approve email → send.

---

## Git Workflow

```bash
# Feature branches
git checkout -b feature/add-follow-up-emails

# Commit with clear messages
git commit -m "feat: add follow-up email scheduling after 5-day no-reply"

# Before pushing
npm run type-check  # Ensure no TypeScript errors
npm run lint        # Ensure no linting errors
```

### Commit Message Format
```
type(scope): short description

Types: feat, fix, refactor, docs, test, chore
Scopes: backend, frontend, agents, database, shared
```
