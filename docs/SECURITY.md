# HERMES — Security Audit & Documentation

## Security Architecture Overview

HERMES implements defense-in-depth across 6 layers: Network, Transport, Application, Authentication, Data, and Operational.

---

## Layer 1: Network Security (Nginx)

### TLS/SSL
```nginx
ssl_protocols TLSv1.2 TLSv1.3;  # Disables TLS 1.0 and 1.1
ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:
            ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384;
ssl_prefer_server_ciphers on;
ssl_session_timeout 1d;
ssl_session_cache shared:SSL:10m;
ssl_stapling on;
ssl_stapling_verify on;
```

All HTTP traffic is redirected to HTTPS. No plain-text communication in production.

### HTTP Strict Transport Security
```nginx
add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload";
```
Forces browsers to always use HTTPS for this domain (2-year preload period).

### Rate Limiting
```nginx
limit_req_zone $binary_remote_addr zone=api:10m rate=20r/s;
limit_req_zone $binary_remote_addr zone=auth:10m rate=5r/m;

location /api/ { limit_req zone=api burst=20 nodelay; }
location /api/auth/ { limit_req zone=auth burst=3 nodelay; }
```

**Critical**: Auth endpoints are limited to 5 requests/minute per IP. This effectively blocks:
- Credential stuffing attacks
- Password brute-force attempts

### Upload Size Limit
```nginx
client_max_body_size 10M;
```
Prevents large payload attacks.

---

## Layer 2: Security Headers (Nginx + Helmet)

### Nginx Headers
```nginx
add_header X-Frame-Options SAMEORIGIN;
add_header X-Content-Type-Options nosniff;
add_header X-XSS-Protection "1; mode=block";
add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://api.groq.com;";
add_header Referrer-Policy no-referrer-when-downgrade;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=()";
```

### Express Helmet (apps/backend/src/app.ts)
```typescript
helmet({
  contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], ... } },
  hsts: { maxAge: 63072000, includeSubDomains: true, preload: true },
  frameguard: { action: 'sameorigin' },
  noSniff: true,
  xssFilter: true
})
```

**Headers set by Helmet**:
- `X-DNS-Prefetch-Control: off`
- `X-Download-Options: noopen`
- `X-Permitted-Cross-Domain-Policies: none`
- `Cross-Origin-Opener-Policy: same-origin`

---

## Layer 3: CORS Configuration

```typescript
// app.ts
cors({
  origin: [
    process.env.APP_URL,
    'http://localhost:3000',
    'http://localhost:4000'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
})
```

**Restricts**: Only requests from the configured `APP_URL` and localhost are accepted. This blocks CSRF from third-party sites.

---

## Layer 4: Authentication & Authorization Security

### JWT Security
- Algorithm: HS256 (HMAC-SHA256)
- Secret minimum length: 32 characters (enforced by Zod)
- Expiry: 7 days (configurable via `JWT_EXPIRES_IN`)
- Claims: `sub` (user ID), `email`, `role`, `iat`, `exp`
- Storage: Frontend stores in NextAuth encrypted cookie (HttpOnly, Secure, SameSite=Lax)

### Password Security
- bcrypt with 12 salt rounds (~300ms per hash — brute-force resistant)
- Password policy: min 8 chars, requires uppercase + number
- Passwords never logged or returned in API responses

### Session Security
- NextAuth session cookie: `HttpOnly`, `Secure`, `SameSite: Lax`
- Session token is a signed JWT (NextAuth `AUTH_SECRET`)
- Token rotation: Frontend refreshes near expiry via `/api/auth/refresh`

### Account Lockout
- No explicit account lockout implemented (potential gap — see Recommendations)
- Nginx rate limiting (5 req/min on auth) is the primary brute-force defense

---

## Layer 5: Input Validation & Injection Prevention

### Zod Validation
All request bodies are validated with Zod schemas before reaching service layer:

```typescript
// Example: prospect creation
const createProspectSchema = z.object({
  name: z.string().min(1).max(200),
  website: z.string().url().optional(),
  industry: z.string().max(100).optional(),
  country: z.string().max(100).optional(),
  employeeCount: z.number().positive().int().optional()
})
```

This prevents:
- Type confusion attacks
- Oversized payloads that bypass size limits
- Unexpected field injection

### NoSQL Injection Prevention
Prisma ORM generates parameterized queries for MongoDB. **User input is never interpolated directly into query strings.**

```typescript
// Safe — Prisma parameterizes automatically
const company = await prisma.company.findFirst({
  where: { name: userProvidedName }  // Never concatenated as string
})
```

MongoDB's document model + Prisma's type-safe query builder eliminates traditional NoSQL injection (e.g., `$where` operators cannot be injected through Prisma).

### XSS Prevention
- Backend: No HTML rendering — all responses are JSON
- Frontend: React 19 escapes all dynamic content by default
- Content-Security-Policy header restricts script execution origins
- Sanitization: User-controlled content stored as strings; HTML not rendered without explicit dangerouslySetInnerHTML (not used)

---

## Layer 6: Data Security

### Secrets Management
- All secrets in `.env` file (never committed to git — `.gitignore` configured)
- Zod validation ensures no empty secrets at startup
- API keys stored in `Integration.config` (JSON field in MongoDB)
- **Potential gap**: Integration configs are not encrypted at rest (see Recommendations)

### Sensitive Fields Never Exposed
- `passwordHash` is excluded from all user query returns
- JWT secrets only in environment variables
- API keys only returned in admin settings view

### Logging Safety
Winston logger is configured to NOT log:
- Request bodies on auth endpoints (passwords)
- JWT tokens
- API keys

---

## Layer 7: Infrastructure Security

### Docker
- Production image runs as non-root user `hermes` (UID 1001)
- Alpine base images (minimal attack surface)
- Multi-stage build (no dev dependencies in production image)

### Firewall (UFW — VPS deployment)
```bash
# setup-vps.sh configures:
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP (redirected to HTTPS)
ufw allow 443/tcp   # HTTPS
ufw enable
```

MongoDB (27017) and Redis (6379) are NOT exposed externally.

---

## Security Findings & Recommendations

### High Priority

| # | Finding | Risk | Recommendation |
|---|---|---|---|
| H1 | Integration API keys stored in plaintext in MongoDB `config` field | Medium | Encrypt at-rest using AES-256 before storing; decrypt in service layer |
| H2 | No account lockout after N failed login attempts | Medium | Add failed-attempt counter to User model; lock after 10 failures; auto-unlock after 15 minutes |
| H3 | JWT tokens cannot be invalidated before expiry | Medium | Implement token blocklist in Redis (store jti, expire with token TTL) |
| H4 | No CSRF protection on state-changing endpoints | Low-Medium | Add `csurf` middleware for cookie-authenticated requests (or rely on SameSite=Lax as current mitigation) |

### Medium Priority

| # | Finding | Risk | Recommendation |
|---|---|---|---|
| M1 | Error messages may leak internal details in development mode | Low | Ensure `NODE_ENV=production` in all deployments; errorHandler already hides stack traces |
| M2 | No audit log for failed login attempts | Low | Add failed login events to Activity model |
| M3 | Telegram webhook doesn't validate Telegram IP ranges | Low | Add IP allowlist for Telegram's documented webhook IP ranges |
| M4 | Email body stored as plaintext in MongoDB | Low | Consider field-level encryption for PII (contact email, company data) |

### Low Priority / Accepted Risk

| # | Finding | Risk | Notes |
|---|---|---|---|
| L1 | Redis queue data includes company/email content | Low | Redis is not externally exposed; acceptable for internal infrastructure |
| L2 | Log files may contain company names | Low | Logs are local to server; ensure proper file permissions (chmod 640) |

---

## OWASP Top 10 Assessment

| OWASP Category | Status | Notes |
|---|---|---|
| A01 Broken Access Control | **Mitigated** | JWT + RBAC on all endpoints |
| A02 Cryptographic Failures | **Mostly Mitigated** | TLS 1.3, bcrypt, JWT HS256; API keys not encrypted at rest |
| A03 Injection | **Mitigated** | Prisma parameterized queries, Zod validation |
| A04 Insecure Design | **Mitigated** | Human-in-the-loop approval prevents automated abuse |
| A05 Security Misconfiguration | **Mostly Mitigated** | Helmet, CSP, rate limiting; review H1 above |
| A06 Vulnerable Components | **Requires Monitoring** | Pin dependencies; run `npm audit` regularly |
| A07 Identification & Auth Failures | **Mostly Mitigated** | bcrypt, rate limiting; no account lockout (H2) |
| A08 Software & Data Integrity | **Mitigated** | `npm ci --frozen-lockfile` in Docker build |
| A09 Logging & Monitoring Failures | **Partial** | Winston logging exists; no centralized monitoring (consider Sentry) |
| A10 SSRF | **Low Risk** | HTTP calls are to configured external APIs; no user-controlled URLs in HTTP requests |

---

## Security Checklist for Deployment

- [ ] `JWT_SECRET` is at least 32 random characters
- [ ] `NEXTAUTH_SECRET` is at least 32 random characters
- [ ] `.env` file is not committed to git
- [ ] `.env` file has restrictive permissions (`chmod 600 .env`)
- [ ] MongoDB is not exposed on a public IP
- [ ] Redis is not exposed on a public IP
- [ ] SSL certificate is valid and auto-renewing (certbot)
- [ ] `NODE_ENV=production` in production environment
- [ ] Nginx rate limits are active (`nginx -t` passes)
- [ ] `npm audit` shows no critical vulnerabilities
- [ ] MongoDB has authentication enabled (not `--noauth`)
- [ ] Log files are not world-readable
