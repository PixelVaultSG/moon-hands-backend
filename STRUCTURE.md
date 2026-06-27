# Moon Hands Backend — Directory Structure

## Core Application (do not rename)
```
ai/              — AI engine, intent matching, response generation, expert system
jobs/            — Background jobs (weekly optimization, waitlist, daily summary)
migrations/      — Supabase SQL migrations (001–006)
server/          — Express routes, webhook handler, onboarding logic
supabase/        — Database schema, client config
public/          — Static assets
```

## Shared Libraries (imported by core)
```
telegram/        — Admin bot, notifications, scheduling
middleware/      — Rate limiting, cost protection, security, loop detection
monitoring/      — Audit system, uptime metrics, security monitor
utils/           — Date helpers, iCal generator, welcome email
memory/          — Episodic memory for AI context
scripts/         — Dev/test scripts (360dialog test, security scan)
```

## Documentation
```
docs/company/    — Internal docs (operations, security, sales, YC)
docs/client/     — Client deliverables (onboarding, legal, media)
```

## Config
```
.env             — Environment variables (DO NOT COMMIT)
package.json     — Dependencies
server.js        — Entry point
```

## Rules
- **Move files freely** in `docs/company/` and `docs/client/`
- **Never move** `ai/`, `jobs/`, `server/`, `supabase/`, `migrations/`, `telegram/`, `middleware/`, `monitoring/`, `utils/`, `memory/` without updating all `require()` paths
- New code → place in the most specific directory above
