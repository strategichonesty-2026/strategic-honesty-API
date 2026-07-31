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

- `GET /youtube/connect` — redirects to the Google consent screen
- `GET /youtube/oauth2callback` — OAuth redirect target; stores the
  connected account's tokens
- `GET /youtube/accounts` — lists connected YouTube accounts
- `POST /youtube/upload` — `multipart/form-data` with `googleUserId`,
  `title`, optional `description`/`privacyStatus`, and a `video` file field

## Engineering standard

See [CLAUDE.md](./CLAUDE.md) for the reuse-over-rebuild standard this
project follows, and [TECH_DECISION.md](./TECH_DECISION.md) for
per-feature technology decisions.
