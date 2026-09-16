# 🛡️ Per-Clinic Containerization & Enhancement Isolation

> **Principle:** One codebase, one deployment, N clinics. A clinic's unique demands must never leak into, slow down, or break another clinic. This document is the rulebook for how enhancements are "containerized" per clinic.

---

## 1. The Isolation Hierarchy (use the lowest level that works)

### Level 0 — Config only (95% of requests). No code.
Anything already in `client_configs` is per-clinic by design: services, prices, hours, FAQs, greeting, tone, agent name, languages, booking rules, automations.
→ Change via Telegram admin bot (`/addservice {{slug}} …`) or SQL on that clinic's row only.

### Level 1 — Feature flag in config. Small code, zero risk.
For a behaviour one clinic wants that others shouldn't get:
```jsonc
// client_configs.automations (or a new JSONB column client_configs.features)
{ "features": { "depositRequired": true, "consultFirst": true } }
```
```javascript
// code — always gated, always defaults OFF
const flags = config.features || {};
if (flags.depositRequired) { /* clinic-specific branch */ }
```
Rules:
- Flag defaults to **off/absent** for every existing clinic — behaviour unchanged for all others.
- Name flags by capability, not by clinic (`depositRequired`, not `glowMode`).
- Document the flag in `SYSTEM_GUIDEBOOK.md` §4 when merged.

### Level 2 — Per-clinic handler module. Bigger features.
If a clinic needs a genuinely unique flow (e.g. membership redemption, package credits):
```
ai/clinic-modules/{{slug}}/index.js   // exports { handle(ctx) }
```
```javascript
// smart-router.js — single dispatch point
const mod = safeRequire(`./clinic-modules/${client.slug}`);
if (mod?.handle && (config.features||{})[mod.FLAG]) {
  const out = await mod.handle(ctx);
  if (out) return out;          // module handled it
}                               // otherwise fall through to shared flow
```
Rules:
- The module loads **only** for that slug (dynamic require, wrapped in try/catch — a broken module can never take down the shared router).
- The module may only *add* behaviour; it never edits shared files.
- Shared-core changes still go through the normal release protocol and benefit all clinics.

### Level 3 — Data-schema extension. Rare.
New per-clinic data → JSONB in `client_configs` first. Only add a real table/column when JSONB genuinely can't model it, and always nullable/defaulted so existing clinics are unaffected.

### ⛔ Never do
- No `if (slug === 'glow')` special-cases scattered in shared logic (use flags/modules).
- No per-clinic git branches or forks — drift kills the template.
- No shared-schema breaking changes; migrations must be additive.
- No editing shared pricing/booking code to suit one clinic — extend via `utils/price.js`-style shared helpers with flags.

---

## 2. Enhancement Workflow (per request)

1. **Scope the ask to a slug.** "For `{{slug}}` only."
2. **Pick the lowest isolation level** (0 → 3).
3. **Implement behind flag/module**, default off for all other clinics.
4. **Regression check the mould:** run the Pixel Vault flow (greeting → book → confirm) plus `node --check` on touched files. If the shared core changed, all clinics get the improvement; if only the flag/module changed, only that clinic does.
5. **Deploy** (Clear Build Cache & Deploy) → enable the flag for that clinic's row only:
   ```sql
   UPDATE client_configs
   SET features = COALESCE(features,'{}'::jsonb) || '{"depositRequired": true}'
   WHERE client_id = (SELECT id FROM clients WHERE slug = '{{slug}}');
   ```
6. **Verify with that clinic's WhatsApp number**; spot-check Pixel Vault is unchanged.
7. **Log it** in `SYSTEM_GUIDEBOOK.md` (new flag/module) so the template docs stay the source of truth.

---

## 3. Why this works (blast-radius analysis)

| Layer | Shared? | Blast radius if it breaks |
|---|---|---|
| `client_configs` row | Per clinic | That clinic only |
| Feature flag default-off | Shared code, per-clinic data | None for others (flag off) |
| `clinic-modules/{{slug}}` | Loaded per slug, try/catch | That clinic only, falls back to shared flow |
| Shared core (`smart-router`, `price.js`) | All clinics | All clinics — hence regression-check the mould before every deploy |
| Database migrations | All clinics | Additive-only rule keeps this safe |

---

## 4. Template drift control

- `SYSTEM_GUIDEBOOK.md` is updated **in the same commit** as any behaviour change.
- `supabase/setup-clinic-template.sql` is updated whenever defaults change.
- Quarterly: diff each clinic's `client_configs` against the template and review intentional vs accidental drift.
- The Pixel Vault clinic (`pixelvault`) is the canary: every deploy is verified there first.
