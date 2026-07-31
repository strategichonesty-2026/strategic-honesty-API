# ENGINEERING STANDARD: GitHub-First, Reuse-Over-Rebuild

Before writing any production code for a feature, evaluate whether a mature,
production-tested, actively maintained open-source project or official SDK
already exists. Write only the Strategic Honesty business logic; reuse
community/vendor-maintained components for infrastructure.

## PRIORITY ORDER
1. Official SDK from the platform owner
2. Official API examples
3. Well-maintained GitHub project (MIT/Apache-2.0/BSD preferred)
4. Popular open-source library with strong community adoption
5. Build custom code only when no suitable solution exists

## APPROVED COMPONENTS (default choices — deviate only with justification)
- Auth: Better Auth, Auth.js, or Passport.js — never hand-roll OAuth
- Google/YouTube: google-auth-library-nodejs, googleapis
- Meta: facebook-nodejs-business-sdk — never custom Graph API auth
- LinkedIn: official OAuth 2.0 flow + official REST APIs
- Queue: BullMQ — never a custom queue manager
- Images: Sharp
- Video: FFmpeg — never a custom transcoding pipeline
- File upload: official SDKs where available
- Logging: Winston, OpenTelemetry
- Monitoring: Prometheus, Grafana

## PHASE 0 — RESEARCH (mandatory for every MAJOR feature, before implementation)
Search GitHub for existing implementations, then evaluate:
license compatibility (flag copyleft/GPL/AGPL explicitly), maintenance
activity, adoption (stars/contributors), and fit. Produce a short comparison
table (Candidate | License | Stars | Maintenance | Decision). If every
candidate fails evaluation, say so explicitly before defaulting to custom code.
For minor features/bugfixes, skip Phase 0 and go straight to implementation.

## ADAPTER ARCHITECTURE
Isolate every external dependency behind a thin interface:
Strategic Honesty business logic → Platform Interface (our adapter) →
Official SDK → Platform API
Keep wrappers thin. Extend libraries, don't fork them. Never copy large
blocks of external source code. Respect license/attribution requirements.

## TECH_DECISION.md
For major features only, create/update TECH_DECISION.md documenting:
(1) repos evaluated, (2) why accepted/rejected, (3) license compatibility,
(4) maintenance status, (5) security considerations, (6) final architecture
decision. Complete this before implementation begins.

## WORKFLOW FOR EVERY FEATURE
1. Research (major features only, per above)
2. Decide reuse vs. build; document the decision
3. Implement
4. Test — run the full automated suite
5. Verify the build succeeds and linting passes
6. Commit with a message describing the actual change made
7. Push to the repository
8. Update the changelog

## GIT WORKFLOW
Only commit/push after tests pass, the build succeeds, and lint is clean.
Commit messages must accurately describe that commit's specific changes —
never reuse a prior commit message as a template.

## AI CODING RULES
Do not rewrite: OAuth frameworks, queue systems, FFmpeg, authentication
libraries, logging systems, monitoring frameworks, or vendor-maintained SDKs.
Do: integrate, extend, configure, optimize, test, document.

## TARGET CODE COMPOSITION
~70-80% reused libraries/SDKs, ~20-30% custom Strategic Honesty logic.

## WHEN ASKED TO BUILD A FEATURE
Unless told otherwise, the user wants Claude to code it, test it, and check
it in (commit + push) end-to-end, so they only need to test the running
result themselves — not review diffs or run git commands.

Then:
1. Create a basic project scaffold appropriate for a Node.js backend
   (package.json, .gitignore, src/ folder, README with project description).
2. Create an initial TECH_DECISION.md file (empty template following the
   structure in the standard above, ready to be filled in per feature).
3. Commit and push this initial setup to main with a clear commit message.

Ask me before choosing a framework (e.g. Express vs Fastify) if it's not
obvious from context — otherwise proceed with sensible defaults for a
Node.js API backend.
