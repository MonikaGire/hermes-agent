# HERMES — Performance Analysis

## Performance Architecture Overview

HERMES is designed around two key performance principles:
1. **Async offloading**: All heavy operations (LLM calls, API integrations) run in background queue workers, never blocking HTTP request handling
2. **Caching at multiple layers**: Static assets, API responses, and React Query client-side cache

---

## Request Performance

### Nginx Layer
- **Gzip compression** enabled for text/HTML, text/CSS, application/js, application/json
- **Static asset caching**: `/_next/static/*` → `Cache-Control: public, max-age=31536000, immutable` (1 year, immutable)
- **Connection keep-alive**: Persistent upstream connections to reduce TCP handshake overhead
- **TLS session caching**: `ssl_session_cache shared:SSL:10m` — reuses TLS sessions for returning clients

### Backend API Layer
- **Compression middleware**: `compression()` gzips JSON responses > 1kb
- **Rate limiting**: Prevents abuse from slowing down legitimate requests
- **Stateless JWT auth**: No session store lookup (except `user.isActive` check) — auth adds ~1ms per request
- **Prisma connection pool**: MongoDB connections are pooled by Prisma client (default pool size: 5)

---

## Database Performance

### MongoDB Indexes

Declared in Prisma schema and applied on `db:push`:

```
Company: status, industry, country
Contact: companyId, email
Email: status, sentAt
Activity: type, createdAt, companyId
```

**Impact**:
- Pipeline status queries (most common dashboard query) use `Company.status` index → O(log n)
- Activity feed queries use `createdAt` index → latest records found without full collection scan
- Email status filters use `Email.status` index → fast approval queue loading

### Query Patterns (Optimized)

```typescript
// Paginated prospect list — uses status + pagination indexes
await prisma.company.findMany({
  where: { status: filters.status, industry: filters.industry },
  take: limit,
  skip: (page - 1) * limit,
  orderBy: { createdAt: 'desc' }
})

// Dashboard stats — single aggregation per status enum value
await prisma.company.groupBy({
  by: ['status'],
  _count: { id: true }
})
```

### Potential Bottlenecks

| Query | Risk | Mitigation |
|---|---|---|
| Activity feed (growing table) | Medium | `createdAt` index; also consider TTL index to auto-expire old activities |
| Full-text company name search | Low-Medium | No full-text index exists; `search` param likely uses regex which is slow on large datasets |
| `Research.rawData` (large JSON) | Low | Fetched only on detail views, not list views (projection) |

---

## Background Queue Performance

### BullMQ Configuration

```typescript
const defaultJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },  // 5s, 10s, 20s
  removeOnComplete: 100,   // Keep last 100 completed jobs (not unbounded)
  removeOnFail: 50         // Keep last 50 failed jobs for debugging
}
```

**Concurrency settings**:
- Research worker: 5 concurrent jobs
- Email generation worker: 3 concurrent jobs
- Discovery worker: 1 concurrent job

These limits prevent the system from sending too many parallel LLM API calls and hitting Groq rate limits.

### LLM API Call Volume

Per company, the HermesOrchestrator makes:
- 1× `CompanyResearchAgent` call (~2000 tokens in/out)
- 1× `PainPointAnalysisAgent` call (~1500 tokens in/out)
- 1–3× `EmailWriterAgent` calls (~2000 tokens each)
- 1–3× `ReviewAgent` calls (~1500 tokens each)
- 1× `ApprovalAgent` call (~500 tokens)

**Worst case**: ~5 LLM calls @ ~2000 tokens = ~10,000 tokens per company

With 3 concurrent email workers, max simultaneous LLM throughput: 3 companies at once. At Groq free tier limits, this may hit rate limits. The exponential backoff retry handles this gracefully.

---

## Frontend Performance

### Next.js 15 Optimizations
- **App Router**: Automatic per-page code splitting — users only download JS for pages they visit
- **Server Components**: Dashboard layout renders server-side (no client JS for static chrome)
- **Image optimization**: `next/image` auto-compresses and serves WebP
- **Font optimization**: Next.js font module inlines critical font CSS and preloads fonts

### React Query Caching

```typescript
// providers.tsx
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,        // 30 seconds before background refetch
      gcTime: 300_000,          // 5 minutes before cache eviction
      retry: 3,
      refetchOnWindowFocus: true
    }
  }
})
```

**Effect**: Dashboard stats are served from cache on tab focus changes. Heavy queries (prospect list) don't re-run on every navigation.

### Bundle Size Considerations

| Package | Approx Size | Notes |
|---|---|---|
| recharts | ~300kb | Used only on dashboard — consider dynamic import |
| @tanstack/react-query | ~50kb | Core dependency |
| axios | ~40kb | Could be replaced with native fetch to reduce bundle |
| zustand | ~8kb | Very lightweight |
| lucide-react | ~tree-shaken | Only imported icons are bundled |

**Recommendation**: Wrap `<ConversionChart>` in `React.lazy()` + `Suspense` to defer Recharts loading.

---

## Memory Usage

### Backend (Express + Workers)
- PM2 limit: 512MB per backend instance
- Prisma connection pool: ~5 MongoDB connections × ~2MB = ~10MB
- BullMQ in-memory state: proportional to queue depth
- Winston log buffers: configurable, default flush-on-write
- Worker goroutines: Node.js single-threaded; no memory leak risk from threads

### Frontend (Next.js)
- PM2 limit: 768MB
- Next.js server-side rendering state: scales with concurrent SSR requests
- React Query cache: bounded by `gcTime` settings

### Redis Memory
- Configured: 256MB with LRU eviction
- Content: BullMQ job state (job bodies + metadata)
- Each job is ~1-10KB depending on payload size
- At 3 workers × 100 queued jobs each = ~3,000KB = ~3MB (well under 256MB)

---

## Scalability Analysis

### Vertical Scaling
Current PM2 cluster configuration (2 backend instances) can be increased by changing `instances: 2` in `pm2.config.js` to `instances: 'max'` to use all CPU cores.

### Horizontal Scaling
The backend is stateless (no in-process session state — all auth is JWT, all jobs are in Redis). Multiple backend VMs behind a load balancer would work provided:
- All instances share the same MongoDB connection
- All instances share the same Redis instance (BullMQ requires shared queue store)

### Database Scaling
MongoDB Atlas supports automatic sharding and read replicas. For production scale:
1. Enable Atlas sharding on `Company` collection (shard key: `country` or `industry`)
2. Add read replicas for dashboard queries (separate connection string with `readPreference=secondary`)

---

## Performance Monitoring

No application-level performance monitoring is currently configured. Recommendations:

1. **Sentry** — Error tracking + performance tracing (`@sentry/node`, `@sentry/nextjs`)
2. **OpenTelemetry** — Distributed tracing for BullMQ job execution times
3. **Prometheus + Grafana** — Queue depth, job processing time, API response time metrics
4. **MongoDB Atlas monitoring** — Built-in query performance advisor

---

## Performance Bottleneck Summary

| Component | Bottleneck Risk | Severity | Action |
|---|---|---|---|
| LLM API calls (Groq) | Rate limiting on free tier | High | Upgrade to paid tier; implement request queuing |
| Company name full-text search | Regex scan on large dataset | Medium | Add MongoDB text index |
| Activity table growth | No TTL; table grows unbounded | Medium | Add TTL index (90 days) |
| Recharts bundle on dashboard | Increases initial page load | Low | Dynamic import with lazy loading |
| Single Redis instance | Single point of failure | Medium | Redis Sentinel or Upstash (managed Redis) |
| No CDN for static assets | Latency for global users | Low | Add CloudFront/Cloudflare in front of Nginx |
