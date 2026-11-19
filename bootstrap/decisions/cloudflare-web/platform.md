## 2026-11-19: A script tells agents which commit is deployed

**Decision.** A small script reads the deployed branch and commit from the public config endpoint of the fixed production and staging hosts (read-only, no URL from the caller), compares them with a ref and can wait until a commit is live. The deploy workflow's last step runs the same check, so a green run means the commit is live. The page also carries the branch and commit in meta tags.

**Reasoning.** Without it, every deploy ended with asking the owner to read a footer. A fixed host list keeps the script from becoming a general fetch tool for agents that are otherwise denied curl.

## 2026-11-19: Client-server contract fixtures are captured from the real server

**Decision.** The fixtures the client tests read are captured by one command that plays seeded scenarios against the real server code, writes the files whole and maps random ids to stable ones; they are never edited by hand. Its `--check` mode runs in CI and fails if a capture would change a file, and after a capture the PR says what moved and why. The server proves its responses match the fixtures and the client proves it parses every one.

**Reasoning.** Hand-kept fixtures drifted on `main` and carried hand-typed numbers. Captured fixtures keep the two sides in sync without end-to-end browser tests, and stable ids make a re-capture show only real changes.

## 2026-11-19: Measure costs before guessing, and price work that repeats

**Decision.** Performance and quota work starts from a measurement on realistic data, and the probe becomes a test with a budget (about 1.5x the measured value, kept next to it; raising one needs a reason in the PR). Work that repeats on a timer, a poll or every request is priced per day before it ships, remembering that staging counts against the same account quotas. Nothing that must last between requests lives in memory, because the runtime may drop it seconds after a request.

**Reasoning.** Guesses were wrong twice in one week, and a free-tier limit was hit twice by small work that ran every minute, not by big tables. Memory "caches" were recomputed on almost every request because instances sleep and restart.

## 2026-11-19: One Worker serves the frontend and the API, configured as code

**Decision.** One Cloudflare Worker serves the static frontend and the API under `/api/*` on one origin, so the frontend uses relative URLs; the frontend is Vite, Preact and strict TypeScript, and request bodies are checked with strict Valibot schemas. Infrastructure is declared in `wrangler.jsonc` and applied by CI, which runs `wrangler` from the project's own lockfile rather than a marketplace deploy action; only one-time tokens are set up by hand. The project starts on the Workers Free plan and upgrades only when a measured limit blocks it.

**Reasoning.** One origin and one deploy pipeline mean one set of credentials and one place to look when something breaks. Running the deploy CLI from the lockfile hands the Cloudflare token only to pinned, aged code. Preact and Valibot keep bundles small, and JSX escapes text by default.

## 2026-11-19: Strict security headers, and everything served from our own origin

**Decision.** The frontend sends a strict CSP (`default-src 'self'`, no inline scripts or styles, `object-src 'none'`, `base-uri 'none'`) plus `nosniff`, a referrer policy, HSTS and a permissions policy, and fonts and other assets are self-hosted with their licence texts shipped. API responses carry `Cache-Control: no-store` and no CORS headers. Text is rendered as text only; `innerHTML` and `dangerouslySetInnerHTML` are banned by lint.

**Reasoning.** Serving everything from one origin keeps the CSP simple and removes third-party requests. Banning raw HTML in lint makes the safe path the only one.
