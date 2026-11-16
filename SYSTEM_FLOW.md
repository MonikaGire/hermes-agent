# HERMES — System Flow

## Complete System Flow from Startup to Email Delivery

```mermaid
flowchart TD
    START([Server Start]) --> ENV_CHECK
    ENV_CHECK[Zod validates .env] --> REDIS_CONNECT
    REDIS_CONNECT[Connect Redis] --> MONGO_CONNECT
    MONGO_CONNECT[Connect MongoDB via Prisma] --> QUEUE_INIT
    QUEUE_INIT[Initialize BullMQ Queues ×5] --> WORKER_INIT
    WORKER_INIT[Start Background Workers] --> CRON_INIT
    CRON_INIT[Register Cron Jobs ×4] --> BOT_INIT
    BOT_INIT[Initialize Telegram Bot] --> HTTP_LISTEN
    HTTP_LISTEN[Express Listening :4000] --> READY([System Ready])
```

---

## Request Flow

```mermaid
flowchart LR
    Browser --> NGINX["Nginx :443<br/>Rate limit + SSL"]
    NGINX -->|/api/*| EXPRESS["Express :4000"]
    NGINX -->|/| NEXT["Next.js :3000"]
    NEXT -->|API calls| NGINX
    EXPRESS --> CORS_HELM["CORS + Helmet"]
    CORS_HELM --> RATE_LIM["Rate Limit"]
    RATE_LIM --> ROUTE["Route Match"]
    ROUTE --> AUTH_MW["JWT Authenticate"]
    AUTH_MW --> CTRL["Controller"]
    CTRL --> VALID["Zod Validate"]
    VALID --> SVC["Service"]
    SVC --> DB["Prisma → MongoDB"]
    SVC --> QUEUE["BullMQ → Redis"]
    DB --> RESP["sendSuccess()"]
    QUEUE --> RESP
    RESP --> Browser
```

---

## Background Processing Flow

```mermaid
flowchart TD
    CRON["Cron: Every 2h"] --> R_QUEUE["research queue"]
    HTTP_TRIGGER["POST /api/prospects/:id/research"] --> R_QUEUE
    R_QUEUE --> R_WORKER["ResearchWorker ×5"]
    R_WORKER --> SERP["SerpAPI: Google news"]
    R_WORKER --> CLEARBIT["Clearbit: Enrichment"]
    SERP & CLEARBIT --> CRA["CompanyResearchAgent<br/>(Groq LLM)"]
    CRA --> PPA["PainPointAnalysisAgent<br/>(Groq LLM)"]
    PPA --> SAVE_RS["Save Research + PainPoints<br/>MongoDB"]
    SAVE_RS --> STATUS_RS["Company.status → RESEARCHED"]

    CRON2["Cron: Every 4h"] --> E_QUEUE["email-generation queue"]
    HTTP_TRIGGER2["POST /api/prospects/:id/email"] --> E_QUEUE
    E_QUEUE --> E_WORKER["EmailGenerationWorker ×3"]
    E_WORKER --> HUNTER["Hunter.io: Find email"]
    HUNTER --> ORCH["HermesOrchestrator"]
    ORCH --> DMA["DecisionMakerAgent"]
    DMA --> LOOP{{"Loop max 3"}}
    LOOP --> EWA["EmailWriterAgent"]
    EWA --> RVA["ReviewAgent"]
    RVA --> PASS{Score ≥ 60?}
    PASS -- Yes --> APRA["ApprovalAgent"]
    APRA --> SAVE_EM["Save Email<br/>MongoDB"]
    PASS -- No --> LOOP
    SAVE_EM --> STATUS_EM["Company.status → EMAIL_PENDING"]
```

---

## Human Approval Flow

```mermaid
flowchart TD
    EMAIL_PENDING["Email: status=PENDING_APPROVAL"] --> UI_OR_TG
    UI_OR_TG{Web UI or Telegram?}
    UI_OR_TG -- Web --> APPROVAL_PAGE["User visits /approvals"]
    UI_OR_TG -- Telegram --> TG_CMD["/approve <id>"]
    APPROVAL_PAGE --> DECISION{User Decision}
    TG_CMD --> DECISION
    DECISION -- Approve --> SET_APPROVED["Email.status → APPROVED<br/>Approval record created"]
    DECISION -- Skip --> SET_SKIPPED["Email.status → SKIPPED<br/>Company.status → SKIPPED"]
    DECISION -- Revise --> REVISE_INPUT["User types instructions"]
    REVISE_INPUT --> REGEN_QUEUE["email-generation queue<br/>(with instructions)"]
    REGEN_QUEUE --> EMAIL_PENDING
    SET_APPROVED --> SEND_BTN["User clicks Send"]
    SEND_BTN --> SMTP["Nodemailer SMTP"]
    SMTP --> EMAIL_SENT["Email.status → SENT<br/>Company.status → EMAIL_SENT<br/>Email.sentAt = now()"]
```

---

## Authentication Flow

```mermaid
sequenceDiagram
    Browser->>Next.js: POST /auth/login (email, password)
    Next.js->>NextAuth: signIn('credentials')
    NextAuth->>Express: POST /api/auth/login
    Express->>MongoDB: Find user by email
    Express->>Express: bcrypt.compare(password, hash)
    Express-->>NextAuth: { token, user }
    NextAuth->>Browser: Set session cookie
    Browser->>Next.js: GET /dashboard
    Next.js->>NextAuth: getSession()
    Next.js->>Express: GET /api/dashboard/stats (Bearer <token>)
    Express->>Express: jwt.verify(token)
    Express->>MongoDB: Load user (isActive check)
    Express-->>Next.js: { stats }
    Next.js-->>Browser: Render dashboard
```

---

## Discovery Flow

```mermaid
sequenceDiagram
    Cron/User->>DiscoveryService: search(industry, country, keywords)
    DiscoveryService->>SerpAPI: Google search
    SerpAPI-->>DiscoveryService: results[]
    DiscoveryService->>ProspectFinderAgent: run(results)
    ProspectFinderAgent->>Groq: LLM analysis
    Groq-->>ProspectFinderAgent: candidates[]
    ProspectFinderAgent-->>DiscoveryService: ProspectCandidate[]
    DiscoveryService->>MongoDB: Filter existing companies
    DiscoveryService->>MongoDB: Bulk insert new (status: NEW)
    DiscoveryService-->>Cron/User: { imported, skipped }
```

---

## Error Handling Flow

```mermaid
flowchart TD
    ERROR[Error thrown in service] --> IS_APP_ERROR{AppError?}
    IS_APP_ERROR -- Yes --> FWD_NEXT["next(error)"]
    IS_APP_ERROR -- No --> IS_ZOD{ZodError?}
    IS_ZOD -- Yes --> FWD_NEXT
    IS_ZOD -- No --> IS_DB{Prisma/DB error?}
    IS_DB -- Yes --> WRAP["Wrap as AppError(500)"]
    WRAP --> FWD_NEXT
    IS_DB -- No --> GENERIC["Generic 500 AppError"]
    GENERIC --> FWD_NEXT
    FWD_NEXT --> ERR_HANDLER["errorHandler middleware"]
    ERR_HANDLER --> FORMAT["Format response<br/>{ success: false, message, statusCode }"]
    FORMAT --> CLIENT[Client receives error]
```
