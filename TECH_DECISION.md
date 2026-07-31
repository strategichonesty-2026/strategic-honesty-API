# Tech Decisions

This file documents technology decisions for major features, per the
engineering standard in [CLAUDE.md](./CLAUDE.md). Minor features/bugfixes
do not require an entry.

For each major feature, add a new section following this template:

## <Feature Name>

**Date:** YYYY-MM-DD

### Repos/libraries evaluated

| Candidate | License | Stars | Maintenance | Decision |
|-----------|---------|-------|-------------|----------|
|           |         |       |             |          |

### Why accepted/rejected

_Reasoning for each candidate's accept/reject decision._

### License compatibility

_Any copyleft/GPL/AGPL concerns flagged explicitly, or confirmation of
compatibility (MIT/Apache-2.0/BSD preferred)._

### Maintenance status

_Recency of commits/releases, open issue/PR responsiveness, bus factor._

### Security considerations

_Known CVEs, dependency footprint, sensitive data handling._

### Final architecture decision

_What was chosen, and how it's isolated behind an adapter (per the
Adapter Architecture section of CLAUDE.md)._

---

## YouTube Video Upload

**Date:** 2026-07-30

### Repos/libraries evaluated

| Candidate | License | Stars | Maintenance | Decision |
|-----------|---------|-------|-------------|----------|
| `googleapis` (googleapis/google-api-nodejs-client) | Apache-2.0 | 12.2k | Active — pushed same day | **Accepted** — official Google API client, includes YouTube Data API v3 |
| `google-auth-library` (now under googleapis/google-cloud-node) | Apache-2.0 | 3.2k (monorepo) | Active — npm published hours before evaluation | **Accepted** — official OAuth2 client for authorization-code flow + token refresh |
| `multer` (expressjs/multer) | MIT | 12.1k | Active — pushed within the same month | **Accepted** — standard Express multipart/form-data middleware for the uploaded video file |
| `busboy` (mscdex/busboy) | MIT | 3.0k | Stale — no push in ~2 years | Rejected — lower-level than needed; multer already uses it internally |
| Unofficial YouTube upload wrapper packages (e.g. `youtube-video-uploader`) | Mixed | Low | Low/unmaintained | Rejected — thin, unofficial wrappers around `googleapis` with far less adoption; no benefit over calling the official SDK directly |
| `prisma` + SQLite (for credential storage) | Apache-2.0 | High | Active | **Accepted** (per user decision) — ORM + migrations, easy path to Postgres later |

### Why accepted/rejected

`googleapis` and `google-auth-library` are Google's own officially supported
Node.js libraries — already in CLAUDE.md's approved components list — and
are both under active development. Note: the standalone
`google-auth-library-nodejs` GitHub repo is marked archived because its
source moved into the `googleapis/google-cloud-node` monorepo; the
`google-auth-library` **npm package** itself is unaffected and still
receives regular releases (v11.0.0 published hours before this evaluation).
`multer` is the de facto standard for handling multipart video uploads in
Express and is actively maintained by the Express org itself. Custom/thin
unofficial wrappers around the YouTube upload API were rejected — they add
an unnecessary layer with no capability `googleapis` doesn't already provide.

### License compatibility

All accepted candidates are Apache-2.0 or MIT. No copyleft/GPL/AGPL
dependencies introduced.

### Maintenance status

`googleapis`, `google-auth-library`, and `multer` all show commits/releases
within the current month as of evaluation. No abandoned or archived
packages were adopted.

### Security considerations

- OAuth tokens (access + refresh) are stored in SQLite via Prisma, never
  logged, and only read/written through a single adapter module.
- Uploaded video files are written to a temp directory by multer, streamed
  to the YouTube Data API, then deleted immediately after the request
  completes (not retained on disk).
- `.env` (client ID/secret) is git-ignored; `.env.example` documents the
  required variables without values.

### Final architecture decision

Strategic Honesty business logic (upload request handling, credential
lifecycle) → `src/adapters/youtube/` (thin wrappers around
`google-auth-library`'s `OAuth2Client` and `googleapis`'s `youtube('v3')`
client) → official Google SDKs → YouTube Data API v3. Token persistence
goes through `src/services/youtubeAccountService.js`, which is the only
module that touches the Prisma client for YouTube credentials.

### Addendum (2026-07-31): service-to-service hardening

This service is now called by `strategic-honesty-scheduler`'s backend
rather than used standalone, which changed its security posture (it holds
real OAuth tokens and is reachable over the network). Added:

- `helmet` (MIT, Express org's own security-headers middleware) and
  `express-rate-limit` (MIT) — both already CLAUDE.md-approved defaults,
  no separate evaluation needed. Rate-limiting is scoped to
  `/youtube/connect` and `/youtube/oauth2callback` specifically, since
  those are the only two endpoints reachable by an unauthenticated caller
  by design; the rest require a shared-secret `X-Internal-Token` header
  (custom middleware, `src/middleware/internalAuth.js` — trivial enough
  not to warrant a third-party library).
- `axios` (MIT) — already used elsewhere in the broader project
  (`strategic-honesty-scheduler`'s `linkedin.js`/`postiz.js`) for the same
  purpose: streaming a remote file to a temp path. Used in
  `src/adapters/youtube/downloadTemp.js` for the new
  `POST /youtube/upload-from-url` route, which lets a caller pass a media
  URL instead of a local file.

---

## Buffer Publishing (Instagram, Threads, X, Facebook, TikTok, Facebook/Instagram Reels)

**Date:** 2026-07-31

### Repos/libraries evaluated

| Candidate | License | Stars | Maintenance | Decision |
|-----------|---------|-------|-------------|----------|
| Buffer's official GraphQL API (`api.buffer.com`) | Vendor SaaS, N/A | N/A | Active — current API, legacy REST retiring Feb 2027 | **Accepted** — official platform, already used manually by the business today |
| Official Buffer Node/JS SDK | — | — | — | **Doesn't exist** — no official SDK for the new GraphQL API |
| Community "Buffer API" wrapper repos (checked GitHub: `buffer-cli`, `linkedin-buffer-scheduler`, `buffer-insight-engine`, etc.) | Mixed | 0–1 stars each | Hobby-level, largely unmaintained | Rejected — too small/unproven, no benefit over calling the API directly |
| `graphql-request` (npm) | MIT | 6.1k | Active — pushed within the last few months | **Accepted** — thin, minimal, well-adopted generic GraphQL client; avoids hand-rolling raw `fetch` + query-string boilerplate |

### Why accepted/rejected

The business already has a working Buffer account used manually (CSV export → upload) for several platforms, and was doing fully manual uploads for others (Instagram, Instagram Reels, Threads, Twitter, Facebook Reels) specifically because those platforms' own native APIs (Meta's Graph API, in particular) require App Review and/or Business Verification — the exact friction that motivated this whole project. Buffer's GraphQL API has official partnerships with Instagram, LinkedIn, Threads, Facebook, Bluesky, YouTube, TikTok, and X, and publishes with a simple personal Bearer API key (no OAuth/app-review flow needed for a single-account, single-tenant use case like this one). One integration closes both gaps — no CSV step, no Meta review — with far less code and maintenance than building N separate native integrations.

No suitable dedicated SDK exists for Buffer's new API, so a generic, popular, actively-maintained GraphQL client (`graphql-request`) was used instead of writing raw HTTP calls by hand — consistent with "reuse a well-maintained library over custom code" even where no vendor-specific option exists.

### License compatibility

MIT (`graphql-request`). No copyleft/GPL/AGPL concerns. Buffer's API itself is a vendor service, not a dependency with a license to evaluate.

### Maintenance status

`graphql-request` shows commits within the last few months, 6.1k stars, actively maintained by the same maintainers as `graphql-tag`/Prisma-adjacent tooling. Buffer's GraphQL API is its current, forward path (the legacy REST API is being sunset Feb 2027 — the GraphQL API was deliberately chosen over it for that reason).

### Security considerations

- The Buffer API key is a personal credential with full posting access to the connected Buffer account — stored only in `BUFFER_API_KEY`, never logged, never returned by any endpoint.
- Media is referenced by public URL (matches the existing R2-hosted asset pattern already used throughout the project) — no file ever passes through this service for Buffer posts, unlike the YouTube upload path.
- `/buffer/*` routes require the same `X-Internal-Token` internal-auth middleware as the YouTube routes — not reachable by an unauthenticated caller.

### Final architecture decision

Strategic Honesty business logic (post creation via `POST /buffer/post`, channel lookup via `GET /buffer/channels`) → `src/adapters/buffer/` (thin `graphql-request` client + query/mutation strings) → Buffer's GraphQL API. No database persistence needed on this side — Buffer itself owns scheduling/queue state once a post is created.
