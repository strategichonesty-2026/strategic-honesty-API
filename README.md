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
npm install
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
src/
  app.js     # Express app factory
  index.js   # server entry point
test/
  *.test.js  # automated tests (Node's built-in test runner)
```

## Engineering standard

See [CLAUDE.md](./CLAUDE.md) for the reuse-over-rebuild standard this
project follows, and [TECH_DECISION.md](./TECH_DECISION.md) for
per-feature technology decisions.
