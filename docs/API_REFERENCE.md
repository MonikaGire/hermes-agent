# HERMES — API Reference

## Base URL

```
Development: http://localhost:4000
Production:  https://yourdomain.com/api (Nginx proxied)
```

All responses follow this envelope:
```json
{
  "success": true | false,
  "data": {...},
  "message": "Human-readable message",
  "meta": { "total": 100, "page": 1, "limit": 20, "totalPages": 5 }
}
```

Error responses:
```json
{
  "success": false,
  "message": "Error description",
  "details": [{ "field": "email", "message": "Invalid email format" }]
}
```

## Authentication

All protected endpoints require:
```
Authorization: Bearer <jwt_token>
```

---

## Auth Endpoints

### POST /api/auth/register

Create a new user account.

**Auth**: None

**Request body**:
```json
{
  "name": "Jane Smith",
  "email": "jane@company.com",
  "password": "SecurePass1!"
}
```

**Validation**:
- `name`: string, 2–100 chars
- `email`: valid email format
- `password`: min 8 chars, must contain uppercase and number

**Response 201**:
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": { "id": "64f8a...", "name": "Jane Smith", "email": "jane@company.com", "role": "USER" }
  }
}
```

**Errors**: 409 (email already exists), 422 (validation)

---

### POST /api/auth/login

Authenticate and receive a JWT.

**Auth**: None

**Request body**:
```json
{ "email": "jane@company.com", "password": "SecurePass1!" }
```

**Response 200**:
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": { "id": "64f8a...", "name": "Jane Smith", "email": "jane@company.com", "role": "USER" }
  }
}
```

**Errors**: 401 (invalid credentials), 403 (account disabled), 422 (validation)

---

### GET /api/auth/me

Return current authenticated user.

**Auth**: JWT required

**Response 200**:
```json
{
  "success": true,
  "data": { "id": "64f8a...", "name": "Jane Smith", "email": "jane@company.com", "role": "USER", "isActive": true, "lastLoginAt": "2026-07-07T10:00:00Z" }
}
```

---

### POST /api/auth/refresh

Refresh JWT token.

**Auth**: JWT required (can be near-expiry)

**Response 200**:
```json
{ "success": true, "data": { "token": "new_token_here" } }
```

---

## Prospect Endpoints

### GET /api/prospects

List all prospect companies with pagination and filtering.

**Auth**: JWT required

**Query params**:
| Param | Type | Default | Description |
|---|---|---|---|
| `page` | number | 1 | Page number |
| `limit` | number | 20 | Items per page |
| `status` | string | — | Filter by ProspectStatus |
| `industry` | string | — | Filter by industry |
| `country` | string | — | Filter by country |
| `search` | string | — | Search by company name |

**Response 200**:
```json
{
  "success": true,
  "data": [
    {
      "id": "64f8a...",
      "name": "Acme Manufacturing",
      "website": "https://acme.com",
      "industry": "Manufacturing",
      "country": "USA",
      "employeeCount": 500,
      "status": "RESEARCHED",
      "createdAt": "2026-07-01T00:00:00Z"
    }
  ],
  "meta": { "total": 150, "page": 1, "limit": 20, "totalPages": 8 }
}
```

---

### GET /api/prospects/stats

Aggregate counts per pipeline stage.

**Auth**: JWT required

**Response 200**:
```json
{
  "success": true,
  "data": {
    "NEW": 45,
    "RESEARCHING": 5,
    "RESEARCHED": 30,
    "EMAIL_DRAFT": 8,
    "EMAIL_PENDING": 12,
    "EMAIL_APPROVED": 3,
    "EMAIL_SENT": 40,
    "REPLIED": 8,
    "CONVERTED": 2,
    "SKIPPED": 10
  }
}
```

---

### GET /api/prospects/:id

Get single prospect with full details.

**Auth**: JWT required

**Response 200**:
```json
{
  "success": true,
  "data": {
    "id": "64f8a...",
    "name": "Acme Manufacturing",
    "website": "https://acme.com",
    "industry": "Manufacturing",
    "country": "USA",
    "employeeCount": 500,
    "revenueEstimate": "$50M-$100M",
    "linkedinUrl": "https://linkedin.com/company/acme",
    "description": "...",
    "status": "EMAIL_PENDING",
    "contacts": [...],
    "research": { "summary": "...", "products": [...] },
    "emails": [...]
  }
}
```

**Errors**: 404 (not found)

---

### POST /api/prospects

Create a new prospect manually.

**Auth**: JWT required

**Request body**:
```json
{
  "name": "Acme Manufacturing",
  "website": "https://acme.com",
  "industry": "Manufacturing",
  "country": "USA",
  "employeeCount": 500,
  "contact": {
    "firstName": "John",
    "lastName": "Doe",
    "role": "VP Operations",
    "email": "john.doe@acme.com"
  }
}
```

**Response 201**: Created prospect object

---

### PUT /api/prospects/:id

Update prospect fields.

**Auth**: JWT required

**Request body**: Partial prospect fields (all optional)

**Response 200**: Updated prospect object

---

### DELETE /api/prospects/:id

Delete prospect and all related records.

**Auth**: JWT + ADMIN role required

**Response 200**: `{ "success": true, "message": "Prospect deleted" }`

---

### POST /api/prospects/:id/research

Trigger research job for a prospect.

**Auth**: JWT required

**Response 200**:
```json
{ "success": true, "message": "Research job queued", "data": { "jobId": "job_abc123" } }
```

**Business rules**: Company status must be NEW or RESEARCHED. Sets status to RESEARCHING.

---

### POST /api/prospects/:id/email

Trigger email generation for a prospect.

**Auth**: JWT required

**Request body** (optional):
```json
{ "tone": "conversational", "contactId": "64f9b..." }
```

**Response 200**:
```json
{ "success": true, "message": "Email generation queued", "data": { "jobId": "job_xyz789" } }
```

**Business rules**: Company must be in RESEARCHED status (or later). Sets status to EMAIL_DRAFT.

---

## Email Endpoints

### GET /api/emails

List generated emails.

**Auth**: JWT required

**Query params**: `page`, `limit`, `status`, `companyId`

**Response 200**:
```json
{
  "success": true,
  "data": [
    {
      "id": "64fab...",
      "subject": "Reducing Acme's Inventory Costs by 30%",
      "status": "PENDING_APPROVAL",
      "version": 2,
      "wordCount": 187,
      "reviewScores": {
        "researchRelevance": 88,
        "personalization": 92,
        "humanTone": 85,
        "businessValue": 90,
        "replyProbability": 78,
        "overall": 87
      },
      "company": { "id": "...", "name": "Acme Manufacturing" },
      "contact": { "id": "...", "firstName": "John", "lastName": "Doe" },
      "createdAt": "2026-07-05T14:00:00Z"
    }
  ]
}
```

---

### GET /api/emails/:id

Get single email with full body.

**Auth**: JWT required

**Response 200**: Full email object including `body` (HTML/plain text)

---

### PUT /api/emails/:id

Edit email subject or body manually.

**Auth**: JWT required

**Request body**:
```json
{
  "subject": "Updated subject line",
  "body": "Updated email body..."
}
```

---

### POST /api/emails/:id/regenerate

Request AI to regenerate an email (optionally with instructions).

**Auth**: JWT required

**Request body** (optional):
```json
{ "instructions": "Make it shorter and more direct. Focus on inventory management." }
```

**Response 200**: `{ "success": true, "data": { "jobId": "..." } }`

---

### POST /api/emails/:id/send

Send an approved email via SMTP.

**Auth**: JWT required

**Business rules**: Email must be in APPROVED status.

**Response 200**: `{ "success": true, "message": "Email sent successfully", "data": { "messageId": "..." } }`

---

## Approval Endpoints

### GET /api/approvals

List emails pending approval.

**Auth**: JWT required

**Response 200**: Array of Email objects with `status: PENDING_APPROVAL`

---

### POST /api/approvals/:emailId/approve

Approve an email for sending.

**Auth**: JWT required

**Response 200**: `{ "success": true, "message": "Email approved" }`

**Effect**: Updates Email.status → APPROVED, creates Approval record (action: APPROVED)

---

### POST /api/approvals/:emailId/skip

Skip an email (mark as not to be sent).

**Auth**: JWT required

**Request body** (optional):
```json
{ "reason": "Company is too small for our target market" }
```

**Effect**: Updates Email.status → SKIPPED, Company.status → SKIPPED, creates Approval record

---

### POST /api/approvals/:emailId/revise

Request AI revision of an email.

**Auth**: JWT required

**Request body**:
```json
{ "instructions": "Too generic. Mention their recent expansion into Texas specifically." }
```

**Effect**: Triggers regeneration job with instructions, creates Approval record (action: REVISED)

---

## Dashboard Endpoints

### GET /api/dashboard/stats

Get pipeline KPIs.

**Auth**: JWT required

**Response 200**:
```json
{
  "success": true,
  "data": {
    "totalProspects": 163,
    "emailsGenerated": 89,
    "emailsApproved": 67,
    "emailsSent": 52,
    "replyRate": 0.154,
    "conversions": 3,
    "researchCompleted": 110,
    "avgEmailScore": 84.2
  }
}
```

---

### GET /api/dashboard/activity

Recent activity feed.

**Auth**: JWT required

**Query params**: `limit` (default 20)

**Response 200**: Array of Activity records with company/user details

---

### GET /api/dashboard/conversion

Funnel conversion data for chart.

**Auth**: JWT required

**Response 200**: Array of `{ stage, count }` for pipeline visualization

---

## Discovery Endpoints

### POST /api/discovery/search

Search for new prospect companies.

**Auth**: JWT required

**Request body**:
```json
{
  "industry": "Manufacturing",
  "country": "USA",
  "keywords": ["ERP", "inventory management", "production planning"],
  "limit": 20
}
```

**Response 200**:
```json
{
  "success": true,
  "data": [
    {
      "name": "Precision Parts Inc",
      "website": "https://precisionparts.com",
      "industry": "Manufacturing",
      "country": "USA",
      "employeeCount": 250,
      "description": "Precision machining company...",
      "source": "google"
    }
  ]
}
```

---

### POST /api/discovery/import

Import selected companies from discovery results.

**Auth**: JWT required

**Request body**:
```json
{
  "companies": [
    { "name": "Precision Parts Inc", "website": "https://precisionparts.com", "industry": "Manufacturing", "country": "USA" }
  ]
}
```

**Response 201**: `{ "success": true, "data": { "imported": 5, "skipped": 2 } }`

---

## Settings Endpoints

### GET /api/settings

Get all application settings.

**Auth**: JWT + ADMIN required

**Response 200**:
```json
{
  "success": true,
  "data": {
    "openai": { "model": "llama-3.3-70b-versatile", "maxTokens": 2000 },
    "email": { "fromName": "HERMES AI", "signature": "..." },
    "discovery": { "defaultIndustry": "Manufacturing", "defaultCountry": "USA" }
  }
}
```

---

### PUT /api/settings

Update settings.

**Auth**: JWT + ADMIN required

**Request body**: Object with setting key-value pairs to update

---

### POST /api/settings/test/:integration

Test integration connection.

**Auth**: JWT + ADMIN required

**Path param**: `integration` — one of `openai`, `apollo`, `hunter`, `serpapi`, `clearbit`, `smtp`

**Response 200**: `{ "success": true, "message": "Connection successful" }`

**Response 400**: `{ "success": false, "message": "Connection failed: Invalid API key" }`

---

## Waitlist Endpoints

### POST /api/waitlist

Add email to waitlist.

**Auth**: API Key (`X-API-Key: <WAITLIST_API_KEY>`)

**Request body**:
```json
{ "email": "user@example.com", "name": "Jane", "source": "homepage" }
```

**Response 201**: `{ "success": true, "message": "Added to waitlist" }`

**Errors**: 409 (email already registered)

---

### GET /api/waitlist

List waitlist entries.

**Auth**: JWT + ADMIN required

**Response 200**: Paginated list of WaitlistLead records

---

### POST /api/waitlist/send

Send emails to all PENDING waitlist entries.

**Auth**: JWT + ADMIN required

**Response 200**: `{ "success": true, "data": { "sent": 45, "failed": 2 } }`

---

## Telegram Endpoint

### POST /api/telegram/webhook

Receive Telegram bot updates.

**Auth**: Telegram webhook token validation

This endpoint is called by Telegram's servers when the bot receives a message. Not intended for direct API calls.

---

## Health Check

### GET /health

No auth required. Returns server health.

**Response 200**:
```json
{
  "status": "ok",
  "timestamp": "2026-07-07T10:00:00Z",
  "uptime": 86400,
  "version": "1.0.0"
}
```

---

## HTTP Status Codes

| Code | Meaning |
|---|---|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request |
| 401 | Unauthorized (missing/invalid JWT) |
| 403 | Forbidden (insufficient role) |
| 404 | Not Found |
| 409 | Conflict (duplicate) |
| 422 | Validation Error |
| 429 | Too Many Requests (rate limit) |
| 500 | Internal Server Error |
