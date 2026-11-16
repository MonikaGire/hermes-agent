# HERMES — Database Documentation

## Overview

HERMES uses **MongoDB 7** as its primary database, accessed via **Prisma ORM 6.2.1**. The Prisma schema is defined in `packages/database/prisma/schema.prisma`. MongoDB is used in document mode — Prisma generates type-safe query builders that compile to MongoDB operations.

The Prisma client is a singleton exported from `packages/database/src/index.ts`:
```typescript
export { prisma, getPrismaClient } from './client.js'
```

---

## Connection Configuration

```
DATABASE_URL="mongodb+srv://<user>:<password>@<cluster>.mongodb.net/<dbname>?retryWrites=true&w=majority"
```

For Docker Compose local development:
```
DATABASE_URL="mongodb://hermes:hermespassword@mongodb:27017/hermes?authSource=admin"
```

---

## Complete Schema

### User

```prisma
model User {
  id           String    @id @default(auto()) @map("_id") @db.ObjectId
  name         String
  email        String    @unique
  passwordHash String
  role         UserRole  @default(USER)
  isActive     Boolean   @default(true)
  lastLoginAt  DateTime?
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
  approvals    Approval[]
  activities   Activity[]
}
```

**Purpose**: Authentication and authorization. Each user has a role that controls access to admin-only endpoints.

| Field | Type | Notes |
|---|---|---|
| `id` | ObjectId | Auto-generated MongoDB ObjectId |
| `email` | String | Unique — used as login identifier |
| `passwordHash` | String | bcrypt hash (12 rounds) |
| `role` | UserRole | ADMIN or USER |
| `isActive` | Boolean | Soft-disable without deletion |
| `lastLoginAt` | DateTime? | Updated on each successful login |

---

### Company

```prisma
model Company {
  id              String         @id @default(auto()) @map("_id") @db.ObjectId
  name            String
  website         String?
  industry        String?
  country         String?
  employeeCount   Int?
  revenueEstimate String?
  linkedinUrl     String?
  logoUrl         String?
  description     String?
  status          ProspectStatus @default(NEW)
  source          String?
  sourceId        String?
  createdAt       DateTime       @default(now())
  updatedAt       DateTime       @updatedAt
  contacts        Contact[]
  research        Research?
  painPoints      PainPoint[]
  emails          Email[]
  activities      Activity[]
}
```

**Purpose**: Represents a prospect company at any stage of the sales pipeline. The `status` field drives the entire workflow state machine.

| Field | Type | Notes |
|---|---|---|
| `status` | ProspectStatus | State machine: NEW → RESEARCHING → RESEARCHED → EMAIL_DRAFT → EMAIL_PENDING → EMAIL_APPROVED → EMAIL_SENT → REPLIED/CONVERTED/SKIPPED |
| `source` | String? | Where this company was discovered (e.g., 'google', 'apollo', 'manual') |
| `sourceId` | String? | External ID from the discovery source |
| `revenueEstimate` | String? | Stored as string (e.g., "$10M-$50M") to accommodate ranges |

**Indexes** (inferred from Prisma + query patterns):
- `status` — filtered in all pipeline queries
- `industry` — filtered in discovery queries
- `country` — filtered in discovery queries

---

### Contact

```prisma
model Contact {
  id          String   @id @default(auto()) @map("_id") @db.ObjectId
  firstName   String
  lastName    String
  role        String?
  email       String?
  phone       String?
  linkedinUrl String?
  isVerified  Boolean  @default(false)
  companyId   String   @db.ObjectId
  company     Company  @relation(fields: [companyId], references: [id])
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  emails      Email[]
}
```

**Purpose**: Individual decision-maker contacts at prospect companies. Linked to Company with a many-to-one relationship (a company can have multiple contacts).

| Field | Type | Notes |
|---|---|---|
| `isVerified` | Boolean | Set to true when Hunter.io confirms email deliverability |
| `role` | String? | Job title (e.g., "VP Operations", "Manufacturing Director") |

---

### Research

```prisma
model Research {
  id              String   @id @default(auto()) @map("_id") @db.ObjectId
  companyId       String   @unique @db.ObjectId
  company         Company  @relation(fields: [companyId], references: [id])
  products        String[]
  locations       String[]
  recentNews      Json?
  expansionPlans  String[]
  hiringActivity  String[]
  techStack       String[]
  investments     String[]
  acquisitions    String[]
  summary         String?
  confidenceScore Float?
  rawData         Json?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}
```

**Purpose**: Stores the structured output of `CompanyResearchAgent`. One-to-one relationship with Company (`@unique` on `companyId`).

| Field | Type | Notes |
|---|---|---|
| `recentNews` | Json? | Array of `{ title, url, date, summary }` objects |
| `rawData` | Json? | Full unstructured agent output for debugging |
| `confidenceScore` | Float? | 0.0–1.0 confidence in research quality |
| `products` | String[] | List of products/services the company offers |
| `techStack` | String[] | Technology tools identified in job postings / public data |

---

### PainPoint

```prisma
model PainPoint {
  id              String   @id @default(auto()) @map("_id") @db.ObjectId
  companyId       String   @db.ObjectId
  company         Company  @relation(fields: [companyId], references: [id])
  problem         String
  erpCapability   String
  businessOutcome String
  evidenceScore   Float
  isPrimary       Boolean  @default(false)
  createdAt       DateTime @default(now())
}
```

**Purpose**: Individual pain points identified by `PainPointAnalysisAgent`. Each pain point maps a company problem to an ERP capability and expected business outcome.

| Field | Type | Notes |
|---|---|---|
| `problem` | String | The specific operational problem (e.g., "Manual inventory tracking causes stockouts") |
| `erpCapability` | String | Which ERP feature solves this (e.g., "Real-time inventory management") |
| `businessOutcome` | String | Expected result (e.g., "Reduce stockouts by 40%, improve fill rate") |
| `evidenceScore` | Float | 0.0–1.0 score based on how much evidence supports this pain point |
| `isPrimary` | Boolean | True for the single most-relevant pain point (used in email personalization) |

---

### Email

```prisma
model Email {
  id            String      @id @default(auto()) @map("_id") @db.ObjectId
  companyId     String      @db.ObjectId
  company       Company     @relation(fields: [companyId], references: [id])
  contactId     String?     @db.ObjectId
  contact       Contact?    @relation(fields: [contactId], references: [id])
  subject       String
  body          String
  status        EmailStatus @default(DRAFT)
  version       Int         @default(1)
  wordCount     Int?
  reviewScores  Json?
  sentAt        DateTime?
  openedAt      DateTime?
  repliedAt     DateTime?
  bounced       Boolean     @default(false)
  messageId     String?
  provider      String?
  tone          String?
  focusPainPoint String?
  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt
  approvals     Approval[]
}
```

**Purpose**: AI-generated outreach emails at any stage of the email workflow.

| Field | Type | Notes |
|---|---|---|
| `version` | Int | Incremented on each regeneration |
| `reviewScores` | Json? | `{ researchRelevance, personalization, humanTone, businessValue, replyProbability, overall }` — all 0–100 |
| `messageId` | String? | SMTP message ID for delivery tracking |
| `bounced` | Boolean | Set true if delivery bounce detected |
| `tone` | String? | Writing tone used: 'formal', 'conversational', 'challenger' |
| `focusPainPoint` | String? | Primary pain point ID emphasized in this email |

**Indexes**:
- `sentAt` — for delivery tracking queries

---

### Approval

```prisma
model Approval {
  id           String         @id @default(auto()) @map("_id") @db.ObjectId
  emailId      String         @db.ObjectId
  email        Email          @relation(fields: [emailId], references: [id])
  userId       String         @db.ObjectId
  user         User           @relation(fields: [userId], references: [id])
  action       ApprovalAction
  reason       String?
  instructions String?
  createdAt    DateTime       @default(now())
}
```

**Purpose**: Audit trail for human approval actions on emails. One email can have multiple approvals (if revised and re-reviewed).

| Field | Type | Notes |
|---|---|---|
| `action` | ApprovalAction | APPROVED, SKIPPED, REVISED, SENT |
| `reason` | String? | Human's explanation for skip/revise |
| `instructions` | String? | Revision instructions for the AI to use on regeneration |

---

### Activity

```prisma
model Activity {
  id         String   @id @default(auto()) @map("_id") @db.ObjectId
  type       String
  entityType String
  entityId   String
  companyId  String?  @db.ObjectId
  company    Company? @relation(fields: [companyId], references: [id])
  userId     String?  @db.ObjectId
  user       User?    @relation(fields: [userId], references: [id])
  meta       Json?
  createdAt  DateTime @default(now())
}
```

**Purpose**: Immutable audit log. Every significant system action creates an Activity record.

Activity `type` values (inferred from codebase):
- `COMPANY_CREATED`, `COMPANY_UPDATED`, `COMPANY_DELETED`
- `RESEARCH_STARTED`, `RESEARCH_COMPLETED`
- `EMAIL_GENERATED`, `EMAIL_APPROVED`, `EMAIL_SENT`, `EMAIL_SKIPPED`
- `PROSPECT_DISCOVERED`
- `USER_LOGIN`, `USER_REGISTERED`

**Indexes**:
- `type` — for filtering activity feed by type
- `createdAt` — for chronological ordering

---

### Integration

```prisma
model Integration {
  id           String    @id @default(auto()) @map("_id") @db.ObjectId
  provider     String    @unique
  isActive     Boolean   @default(false)
  config       Json?
  lastTestedAt DateTime?
  lastErrorAt  DateTime?
  lastError    String?
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
}
```

**Purpose**: Stores configuration and health status for each third-party integration. `config` stores API keys and settings as encrypted JSON (stored in DB, managed via Settings UI).

| Provider Values | Service |
|---|---|
| `openai` | Groq/OpenAI LLM |
| `apollo` | Apollo.io |
| `hunter` | Hunter.io |
| `serpapi` | SerpAPI |
| `clearbit` | Clearbit |
| `smtp` | Email sending |
| `telegram` | Telegram bot |

---

### WaitlistLead

```prisma
model WaitlistLead {
  id          String         @id @default(auto()) @map("_id") @db.ObjectId
  email       String         @unique
  name        String?
  source      String?
  status      WaitlistStatus @default(PENDING)
  emailSentAt DateTime?
  createdAt   DateTime       @default(now())
  updatedAt   DateTime       @updatedAt
}
```

**Purpose**: Captures waitlist signups for the e-commerce product. Separate from the main prospect pipeline.

---

### Setting

```prisma
model Setting {
  id        String   @id @default(auto()) @map("_id") @db.ObjectId
  key       String   @unique
  value     Json
  updatedAt DateTime @updatedAt
}
```

**Purpose**: Key-value store for application configuration that can be changed at runtime without redeployment. `value` is JSON so it can store scalars, objects, or arrays.

---

## Enumerations

```prisma
enum ProspectStatus {
  NEW           // Just discovered/created
  RESEARCHING   // Research job in progress
  RESEARCHED    // Research complete, ready for email
  EMAIL_DRAFT   // Email generation in progress
  EMAIL_PENDING // Email generated, awaiting human approval
  EMAIL_APPROVED // Human approved, ready to send
  EMAIL_SENT    // Email dispatched via SMTP
  REPLIED       // Prospect replied to email
  CONVERTED     // Converted to opportunity/customer
  SKIPPED       // Manually removed from pipeline
}

enum EmailStatus {
  DRAFT           // Initial AI draft
  PENDING_APPROVAL // Awaiting human review
  APPROVED        // Human approved
  SENT            // Successfully dispatched
  SKIPPED         // Not sent (quality or manual skip)
}

enum UserRole {
  ADMIN  // Full access including settings and delete operations
  USER   // Standard sales rep access
}

enum ApprovalAction {
  APPROVED  // Email approved for sending
  SKIPPED   // Email skipped
  REVISED   // Revision requested (with instructions)
  SENT      // Confirmation that email was sent
}

enum WaitlistStatus {
  PENDING   // Email captured, not yet sent
  SENT      // Welcome email dispatched
  REJECTED  // Filtered out
}
```

---

## Entity Relationship Diagram

```mermaid
erDiagram
    User {
        ObjectId id PK
        string name
        string email UK
        string passwordHash
        UserRole role
        boolean isActive
        datetime lastLoginAt
    }

    Company {
        ObjectId id PK
        string name
        string website
        string industry
        string country
        int employeeCount
        string revenueEstimate
        ProspectStatus status
        string source
    }

    Contact {
        ObjectId id PK
        string firstName
        string lastName
        string role
        string email
        boolean isVerified
        ObjectId companyId FK
    }

    Research {
        ObjectId id PK
        ObjectId companyId FK UK
        string[] products
        string[] locations
        json recentNews
        float confidenceScore
        string summary
    }

    PainPoint {
        ObjectId id PK
        ObjectId companyId FK
        string problem
        string erpCapability
        float evidenceScore
        boolean isPrimary
    }

    Email {
        ObjectId id PK
        ObjectId companyId FK
        ObjectId contactId FK
        string subject
        string body
        EmailStatus status
        int version
        json reviewScores
        datetime sentAt
    }

    Approval {
        ObjectId id PK
        ObjectId emailId FK
        ObjectId userId FK
        ApprovalAction action
        string reason
        string instructions
    }

    Activity {
        ObjectId id PK
        string type
        string entityType
        ObjectId companyId FK
        ObjectId userId FK
        json meta
    }

    Integration {
        ObjectId id PK
        string provider UK
        boolean isActive
        json config
    }

    WaitlistLead {
        ObjectId id PK
        string email UK
        WaitlistStatus status
    }

    Setting {
        ObjectId id PK
        string key UK
        json value
    }

    Company ||--o{ Contact : "has many"
    Company ||--o| Research : "has one"
    Company ||--o{ PainPoint : "has many"
    Company ||--o{ Email : "has many"
    Company ||--o{ Activity : "has many"
    Contact ||--o{ Email : "associated with"
    Email ||--o{ Approval : "has many"
    User ||--o{ Approval : "makes"
    User ||--o{ Activity : "creates"
```

---

## Data Lifecycle

### Company Lifecycle
```
1. Created (status: NEW) via:
   - Manual UI entry
   - Discovery import
   - Cron discovery job

2. Research triggered → status: RESEARCHING
   - Research worker runs
   - Research + PainPoint records created
   → status: RESEARCHED

3. Email generation triggered → status: EMAIL_DRAFT
   - Email generation worker runs
   - Email record created
   → status: EMAIL_PENDING (if review passed)

4. Human reviews email in UI or Telegram
   - Approved → status: EMAIL_APPROVED
   - Revised → regeneration loop
   - Skipped → status: SKIPPED

5. Email sent → status: EMAIL_SENT
   - Email.sentAt populated
   - Email.messageId saved

6. Reply received (manual update) → status: REPLIED
7. Deal closed → status: CONVERTED
```

---

## Migrations

Prisma with MongoDB does not use migration files in the traditional SQL sense. Schema changes are applied with:
```bash
npm run db:push          # Apply schema to DB (development)
npm run db:push:reset    # Drop and re-apply (destructive)
npm run db:seed          # Run seed script
npm run db:studio        # Open Prisma Studio GUI
```

For production schema changes, `db:push` applies the new schema non-destructively. Destructive field removals or index changes must be handled carefully with data migration scripts.

---

## Indexes (Declared in Schema)

```prisma
// Company
@@index([status])
@@index([industry])
@@index([country])

// Contact
@@index([companyId])
@@index([email])

// Email
@@index([sentAt])
@@index([status])

// Activity
@@index([type])
@@index([createdAt])
@@index([companyId])
```

---

## Database Seeding

The seed script (`packages/database/src/seed.ts`) creates:
1. Default ADMIN user (`admin@hermes.ai`, configurable password)
2. Sample Company records (5–10 manufacturing companies)
3. Sample Integration records with `isActive: false`
4. Default Setting records

Run with: `npm run db:seed`
