# strategic-honesty-API

Node.js/Express backend API for Strategic Honesty.

Built following the GitHub-First, Reuse-Over-Rebuild engineering standard
(see [CLAUDE.md](./CLAUDE.md)): infrastructure concerns are handled by
mature, well-maintained open-source libraries and official SDKs, so
custom code stays focused on Strategic Honesty business logic.

## Requirements

- Node.js 18+

## Getting started

```bash
cp .env.example .env
npm install
npx prisma migrate deploy
npm run dev
```

The server starts on `http://localhost:3000` by default (override with the
`PORT` environment variable). A health check is available at `GET /health`.

## Scripts

- `npm start` — run the server
- `npm run dev` — run the server with file watching
- `npm test` — run the automated test suite
- `npm run lint` — run ESLint

## Project structure

```
prisma/
  schema.prisma        # data model (SQLite via Prisma)
src/
  app.js                # Express app factory
  index.js              # server entry point
  adapters/youtube/      # thin wrappers around google-auth-library / googleapis
  adapters/buffer/        # thin wrapper around Buffer's GraphQL API (graphql-request)
  services/              # business logic (credential persistence, upload orchestration)
  routes/                # Express route handlers
  db/prismaClient.js     # Prisma client singleton
test/
  *.test.js              # automated tests (Node's built-in test runner)
```

## YouTube video upload

Uses the official `googleapis` and `google-auth-library` SDKs (see
[TECH_DECISION.md](./TECH_DECISION.md)). Requires a Google Cloud OAuth 2.0
client with the YouTube Data API v3 enabled; set `GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI` in `.env`.

This service is designed to be called by another application's backend
(e.g. a scheduler) rather than used standalone. Two routes are reachable by
an end user's browser (no auth, rate-limited); the rest require a shared
secret:

- `GET /youtube/connect?state=&schedulerUserId=` — redirects to the Google
  consent screen. `state`/`schedulerUserId` are opaque values from the
  calling app, round-tripped through Google's own `state` param and handed
  back on callback — this service does not interpret them.
- `GET /youtube/oauth2callback` — OAuth redirect target. Stores the
  connected account's tokens, then redirects the browser to
  `SCHEDULER_CALLBACK_URL` (fixed by env var, not client-supplied — avoids
  open redirect) with `?auth=success&platform=youtube&state=&googleUserId=
  &channelTitle=` (or `auth=error&reason=`).
- `GET /youtube/accounts` — lists connected accounts. **Requires**
  `X-Internal-Token` header matching `INTERNAL_SERVICE_TOKEN`.
- `POST /youtube/upload` — **requires** `X-Internal-Token`.
  `multipart/form-data` with `googleUserId`, `title`, optional
  `description`/`tags` (comma-separated)/`privacyStatus`, and a `video`
  file field.
- `POST /youtube/upload-from-url` — **requires** `X-Internal-Token`. JSON
  body `{googleUserId, videoUrl, title, description, tags, privacyStatus}`
  — downloads the video server-side (streamed, with a stall/size guard)
  and uploads it, for callers that only have a media URL rather than a
  local file.

Set `INTERNAL_SERVICE_TOKEN` to a shared secret the calling service also
holds, and `SCHEDULER_CALLBACK_URL` to that service's OAuth callback URL.

## Buffer publishing

Uses Buffer's GraphQL API (see [TECH_DECISION.md](./TECH_DECISION.md)) via
a personal API key — posts/schedules to whatever channels are already
connected in that Buffer account (Instagram, Threads, X, Facebook, TikTok,
etc.), no OAuth flow needed for this single-account use case. Set
`BUFFER_API_KEY` (generate at buffer.com/settings/api) in `.env`. Both
routes **require** `X-Internal-Token`:

- `GET /buffer/channels` — lists connected Buffer channels (`id`, `name`,
  `service`) — look up the `channelId` here before posting.
- `POST /buffer/post` — JSON body `{channelId, text, mediaUrl, mediaType,
  scheduledAt, service, postType, saveToDraft}`. `mediaType` must be
  `"image"` or `"video"` when `mediaUrl` is given. Omit `scheduledAt` to
  add to Buffer's queue instead of a fixed time. Pass `service: "facebook"`
  for Facebook channels — Buffer requires an explicit post `type`
  there (`postType`: `"post"` | `"story"` | `"reel"`, defaults to
  `"post"`). Pass `saveToDraft: true` to create a draft instead of an
  actual scheduled/queued post — useful for testing.

## Engineering standard

See [CLAUDE.md](./CLAUDE.md) for the reuse-over-rebuild standard this
project follows, and [TECH_DECISION.md](./TECH_DECISION.md) for
per-feature technology decisions.
