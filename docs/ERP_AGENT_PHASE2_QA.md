# Hermes ERP Agent — Phase 2 integration and acceptance checklist

**Status:** implementation is on a draft PR. Do not deploy or merge until the checks below are completed on an isolated test account. No production email was sent during development.

## Current workflow

1. The daily queue rotates through metal-processing industries and geographies, looking for **pain and buying signals** using a configured SerpAPI integration. The LLM training set is not used as a company directory.
2. Search-result excerpts are **unverified discovery candidates**, not proof of active ERP procurement.
3. Candidates are deduped by company domain/name and stored with source URL and excerpt. A human admin must review a first-party, dated source using \`POST /api/discovery/:companyId/verify-evidence\`.
4. An actual named business contact must be verified before ERP outreach. Generic \`info@\` accounts are not silently assigned fictional operations-manager names.
5. New messages are drafts for approval. The outbound sender makes an atomic \`APPROVED → SENDING → SENT\` transition. Ambiguous errors remain \`SENDING\` for manual reconciliation.
6. Replies are polled from Gmail with paginated searches, overlapping cursor windows, and duplicate ID checks. Errors preserve the cursor.
7. Explicit opt-outs suppress the company; follow-up and new send checks consult both conversation state and durable activity history.
8. A \`NOT_NOW\` response with a valid future date can generate **one follow-up draft**, using the prospect's thread and timing, with an atomic \`FOLLOW_UP_SCHEDULED → FOLLOW_UP_PREPARING → DRAFT_READY\` claim. It never sends automatically.
9. Replies with a Gmail thread ID use an RFC \`Message-ID\` reference rather than incorrectly treating a Gmail thread ID as a message ID. No SMTP fallback after an ambiguous Gmail failure.

## Before testing

- Use a non-production database/Redis queue and **test-only mailbox**. Do not expose real customer credentials.
- Configure valid SerpAPI credentials, MongoDB URL, Redis, Gmail OAuth, and SMTP for controlled tests.
- Run \`npm ci\`, \`npm run db:generate\`, \`npm run typecheck --workspace=packages/shared\`, \`npm run build --workspace=packages/shared\`, \`npm run typecheck --workspace=packages/agents\`, \`npm run build --workspace=packages/agents\`, \`npm run build --workspace=packages/database\`, \`npm run typecheck --workspace=apps/backend\`.
- Run \`node --experimental-strip-types --test tests/*.test.mjs\` with Node 22+.
- Note: some legacy package build scripts hide TypeScript errors with \`|| echo\`; **do not treat those scripts alone as proof of a clean build**.

## Controlled acceptance tests

| Test | Expected outcome |
| --- | --- |
| Missing SerpAPI key | Explicit 503; **no AI-invented lead list** |
| Directory or job board in a web result | Never becomes an official manufacturer website by title alone |
| Valid first-party ERP/pain source | Imported only as a review candidate with source URL and date when available |
| Source review by a non-admin | Rejected |
| No approved source or verified named contact | ERP email generation blocked |
| Two send requests for the same approved email | At most one claims \`SENDING\` |
| Provider timeout or uncertain SMTP/Gmail result | Marked for reconciliation, **no automatic second-provider retry** |
| User reads reply before the inbox poll | Reply is still found (if within poll window) |
| Gmail pagination or message fetch failure | Saved checkpoint is not advanced |
| Explicit "unsubscribe" | Company suppressed; no further sales drafts or sends |
| Prospective customer says "try next month" | At due time creates one **reviewable draft**, no auto-send |
| Duplicate/retried follow-up job | Does not produce a second draft |
| Proper Gmail reply thread | Correct \`Message-ID\` / References and expected thread |
| Genuine live metal ERP buyer search | Measure unique company identities, evidence accuracy, verified contacts, cost and false positives |

## Known blockers to production autonomy

- Live SerpAPI/search, Gmail, Mongo and Redis end-to-end tests are still required.
- Third-party evidence (LinkedIn postings, job boards, forums, tenders) needs an **employer-domain resolution and review pipeline**. The current first-party rule deliberately favours precision over recall.
- A usable evidence-review and contact-verification dashboard is still needed; approval is currently API-driven.
- Contact \`isVerified\` lacks auditable per-contact source, role date, and permission provenance.
- Inbox \`after:\` polling should eventually be replaced with Gmail History API or push notifications for large-volume accounts.
- Provider-uncertain \`SENDING\` and \`REPLY_SENDING\` records require a manual reconciliation screen/workflow before production use.
- Bounce handling, per-domain throttling, legal compliance by region, suppression export, and campaign-level rate limits need explicit tests.
- The system has no independently verified claim of improved lead precision yet.

## Acceptance metrics

Track weekly: unique sourced metal companies, qualifying signal recency, company-ID false-positive rate, verified decision-maker coverage, approved leads per 100 candidates, cost per approved lead, positive reply rate, meetings booked, unsubscribes, bounces, and duplicate-send incidents. **Do not optimise for raw scraped lead count.**

**Merge gate:** all CI jobs green + test-mailbox conversations demonstrated + no critical duplicate/suppression bugs + reviewed production rollout plan. Keep automated sending disabled until then.
