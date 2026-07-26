# ClearTrace — Full-Application Test Report

Cumulative, phase-by-phase test report for ClearTrace (`cleartrace/`). Each
phase appends its own section below; nothing is overwritten between phases.

Methodology: every claim in this document was produced by *running* the app
against a live PostgreSQL instance and issuing real HTTP requests (`curl`),
not by reading source and inferring behavior. Where a finding could not be
exercised live (e.g. it requires a specific outage timing), that is stated
explicitly.

Audited branch: `claude/cleartrace-pdf-redesign-t5r7qq` (confirmed canonical
— see Phase 1, Step 0). Working commit at time of Phase 1: `0d56f6a`.

---

## Phase 1: Security & Access Control

**Date:** 2026-07-26
**Scope:** every router mounted in `cleartrace/backend/server.js`.
**Method:** local PostgreSQL 16 instance, backend started with
`node db/seed.js && node server.js` (the exact production start command),
then exercised with `curl` using real JWTs obtained from `/api/auth/login`
for two separate tenants — Verdant Group (company id 1, seeded by
`scripts/seed-demo.js`) and GreenTech Solutions Ltd (company id 2, seeded by
the legacy `db/seed.js`, i.e. the `demo@cleartrace.io` account).

### Step 0 — branch verification

```
git log origin/claude/cleartrace-pdf-redesign-t5r7qq --oneline | grep -E "d4d2690|1733749|e51a049|dd6abd5|2332006|41a5ef9"
```
All six commits found:
```
41a5ef9 Update CLAUDE.md: mark flight/vehicle-fuel data as real, note §5 rewrite is unblocked
e51a049 Replace placeholder flight table with real DEFRA 2026 figures, fix route classification bug
1733749 Route emission factors through a region-aware DB table, unify upload with manual entry
d4d2690 Make the server authoritative for emission factors
2332006 Add node:test runner to cleartrace backend
dd6abd5 Mark CLAUDE.md sections 1 and 5 as superseded by Part 1
```

```
git merge-base --is-ancestor origin/claude/cleartrace-esg-app-NoDQp origin/claude/cleartrace-pdf-redesign-t5r7qq
→ ANCESTOR-OK
```

**Result: `claude/cleartrace-pdf-redesign-t5r7qq` is canonical.** This audit
ran against it (via `claude/test-report-phase-1-xnjoas`, which branches from
the same history).

### Step 1 — router inventory and live results

18 router mounts in `server.js` (2 public, 16 protected by `auth`; 11 of
those 16 also carry `demoGuard`).

| Router (mount) | Auth required? | Tenant-scoped? | Fails open/closed on DB error? | Audit-logged? |
|---|---|---|---|---|
| `/api/auth` | N/A — intentionally public | N/A | not tested | N/A (no logAction calls; auth events aren't audited at all) |
| `GET /api/emission-factors` | N/A — intentionally public, static in-memory object | N/A | N/A | N/A |
| `/api/emissions` | **Yes** (401 verified unauthenticated) | **Yes** — cross-tenant PATCH/DELETE by id returned 404, list totals correctly isolated (54 vs 84 entries) | **Fails open** (code, `middleware/demoGuard.js:48-51`) — **but see Finding S3**: an unrelated uncaught error in the same request path crashed the whole process during the same outage | **Partial** — 4 `logAction` call sites, only on create/update/delete of entries; `isPeriodLocked`/lock-status changes not logged |
| `/api/kpi` | **Yes** (401 verified) | **Yes** — totals differ correctly per tenant (54 vs 84) | N/A (read-only, no demoGuard) | N/A — no writes |
| `/api/charts` | **Yes** (401 verified) | **Yes** — verified same-shaped, tenant-scoped trend data for both tenants | N/A (read-only) | N/A — no writes |
| `/api/frameworks` | **Yes** (401 verified) | Yes (scoped by `company_id`) | N/A — no demoGuard mounted | **No** — `PATCH /:framework` has **no `requireRole` at all**; live test: a `viewer` token successfully changed a framework's status/details (200 OK) |
| `/api/upload` | **Yes** (401 verified) | not individually re-verified (same pattern as emissions) | Fails open (code) | Audited — 3 `logAction` call sites |
| `/api/report` | **Yes** (401 verified) | not applicable — read/PDF generation only, no writes | N/A (read-only) | N/A — no writes |
| `/api/onboarding` | **Yes** (401 verified) | Yes (scoped by `company_id`) | N/A — no demoGuard mounted | **No** — zero `logAction` calls. **Live test: a `viewer` token successfully renamed the company via `PUT /profile` (200 OK), verified persisted in the database.** No `requireRole` on any of its 6 write routes. |
| `/api/targets` | **Yes** (401 verified) | not tested live (no writes in this router — read-only aggregation) | N/A | N/A — no writes |
| `/api/audit` | **Yes** (401 verified) | Yes — company1 and company2 tokens returned disjoint log sets | N/A — no writes | N/A (this *is* the audit log) |
| `/api/validation` | **Yes** (401 verified) | Yes (scoped by `company_id`) | Fails open (code, same demoGuard) | Audited — 5 `logAction` call sites, most complete coverage of any router |
| `/api/team` | **Yes** (401 verified) | **Yes** — cross-tenant `PATCH /:userId/role` and `DELETE /:userId` against another tenant's user id both returned 404, no data changed | Fails open (code) | **No** — live test: `POST /invite` succeeded (201) and audit log count stayed at 0 for that tenant afterward |
| `/api/benchmarking` | **Yes** (401 verified) | not tested (read-only, no writes) | N/A | N/A — no writes |
| `/api/company` | **Yes** (401 verified) | Yes (scoped by `company_id`) | N/A — no demoGuard mounted | **No** — zero `logAction` calls. **Live test (Finding S1): the demo-flagged tenant (Verdant Group, `is_demo=true`) successfully wrote via `PATCH /sector` (200 OK), proving demo-write protection is fully bypassable through this router.** Role-gated (`admin` only) correctly. |
| `/api/social` | **Yes** (401 verified) | Yes (scoped by `company_id`, same handler skeleton as water/waste/governance) | Fails open (code) | **No** — 0 `logAction` calls |
| `/api/governance` | **Yes** (401 verified) | Yes | Fails open (code) | **No** — 0 `logAction` calls |
| `/api/water` | **Yes** (401 verified) | Yes | Fails open (code) | **No** — 0 `logAction` calls |
| `/api/waste` | **Yes** (401 verified) | Yes | Fails open (code) | **No** — 0 `logAction` calls |
| `/api/recommendations` | **Yes** (401 verified) | Yes (scoped by `company_id`) | N/A — no demoGuard mounted | **No** — 0 `logAction` calls. Role-gated correctly (`viewer` token got 403 on `PATCH /:id/status`). **Live test (Finding S1 variant): the demo-flagged tenant's `admin` token successfully wrote via `PATCH /:id/status` (200 OK) — same demoGuard bypass as `/api/company`.** |
| `/api/brsr` + `/api/brsr-evidence` (both mounted at `/api/brsr`) | **Yes** (401 verified) | **Yes** — cross-tenant `GET /section-a/:id` → 404; cross-tenant `PUT /section-a/:id` with a *valid* field key → 404, no write occurred; cross-tenant `GET /evidence/:submissionId` → 403 | Fails open (code) | **No** — 0 `logAction` calls in either file, despite `brsr.js` alone having 16 write endpoints |

### Step 1.4 — `demo@cleartrace.io` status (live-verified)

- **Plaintext location:** `cleartrace/backend/db/seed.js:30` — `bcrypt.hash('demo1234', 12)`, and printed again in cleartext at `db/seed.js:126`.
- **Role:** `admin` (`db/seed.js:32`), confirmed live — login response returned `"role":"admin"`.
- **Excluded from production builds? No — actively seeded in production.** Root `package.json:5`, `nixpacks.toml`, `railway.json`, and `start.sh` all run `node cleartrace/backend/db/seed.js` **unconditionally, before `server.js` starts, with no `NODE_ENV` guard.** This was run exactly as production would run it during this audit (`node db/seed.js`), and it created the account.
- **Finding S1 (critical): this account is never marked `is_demo`, so `demoGuard` never blocks it.** `demo_migration.sql:5` only sets `is_demo = true WHERE name = 'Verdant Group'` — it never references `'GreenTech Solutions Ltd'`, the company `db/seed.js` creates for `demo@cleartrace.io`. Live-verified: `SELECT id, name, is_demo FROM companies` showed `GreenTech Solutions Ltd | f` throughout the audit, on every boot. **This means `demo@cleartrace.io` / `demo1234` is a plaintext, publicly-committed admin credential with full, unrestricted write access to a live company record in production** — able to write through every router that lacks a `requireRole` gate, and (Finding S1 continued) even through routers with `demoGuard` mounted, since its tenant is never flagged.
- **Finding S2 (secondary, same root cause): even the intended demo tenant has a real gap on first boot.** `demo_migration.sql`'s `UPDATE ... WHERE name = 'Verdant Group'` runs as a *startup* migration, before `scripts/seed-demo.js` (which creates Verdant Group) runs post-`listen`. On the very first boot of a fresh database, the `UPDATE` therefore matches zero rows and Verdant Group is created with `is_demo` at its column default (`false`). Live-verified: after first boot, `SELECT is_demo FROM companies` showed `Verdant Group | f`; only after a **second** boot (when the migration re-runs against an already-existing Verdant Group) did it flip to `true`. Any deploy that seeds a brand-new database exposes one full boot cycle — until the next restart — where the "real" demo tenant's writes are not blocked either.

### Step 1.2 — fail-open verification (live outage simulation)

`middleware/demoGuard.js:48-51` explicitly catches any DB error and calls
`next()`, logging `"demoGuard error: ..."` — by design, and confirmed live:
stopping PostgreSQL mid-session and issuing a POST as a demo-flagged tenant
produced exactly that log line, and the request was **not** rejected with
the normal `403 Demo mode` response.

**Finding S3 (critical, found only by live-testing, not code reading): the
server process crashed entirely during this test**, taking down all 18
routers for both tenants, not just the affected request. Root cause:
`routes/emissions.js`'s `POST /` handler calls `isPeriodLocked()`
(`routes/emissions.js:109`) *before* entering its own `try { ... }` block
(the `try` doesn't start until `routes/emissions.js:145`). With PostgreSQL
down, `isPeriodLocked`'s query rejects, the rejection is never caught by
anything (no route-level `try/catch` around it, no Express error middleware
anywhere in the app, no `process.on('unhandledRejection', ...)` in
`server.js`), and Node's default behavior since v15 is to terminate the
process on an unhandled rejection. Observed in the server log:
```
demoGuard error: connect ECONNREFUSED 127.0.0.1:5432
...
Error: connect ECONNREFUSED 127.0.0.1:5432
    at async isPeriodLocked (routes/emissions.js:31:13)
    at async routes/emissions.js:109:7
Node.js v22.22.2
```
followed by process exit. `routes/emissions.js:203`, `:212`, and `:357`
call the same unguarded `isPeriodLocked()` from the PATCH handler, so any of
those paths carry the same crash risk. **A transient DB blip during any
emissions write — from any tenant, demo or not — can take the entire
application offline for every tenant**, which is a materially worse outcome
than "fails open."

### Step 1.5 — `logAction()` coverage (grep-verified per file, spot-checked live)

```
routes/emissions.js: writes=3  logAction_calls=4
routes/upload.js:     writes=1  logAction_calls=3
routes/validation.js: writes=4  logAction_calls=5
--- everything else: 0 logAction calls ---
routes/auth.js:            writes=2  (register/login not audited)
routes/brsr.js:             writes=16 (zero audited)
routes/brsr-evidence.js:   writes=2
routes/company.js:         writes=2
routes/frameworks.js:      writes=1
routes/governance.js:      writes=1
routes/onboarding.js:      writes=6
routes/recommendations.js: writes=1
routes/social.js:          writes=1
routes/team.js:            writes=4
routes/waste.js:           writes=1
routes/water.js:           writes=1
```
Only the three oldest/most-central route files (`emissions`, `upload`,
`validation`) call `logAction()`. Every router added or extended since —
including all of BRSR (16 write endpoints), team management, and company
settings — has **zero** audit trail for its mutations. Live-verified twice
(team invite, company sector change): the write succeeds, the audit log
count for that tenant does not change.

### Red items — fix before Phase 2

1. **[Critical] `demo@cleartrace.io` is a live production admin account with a
   plaintext, publicly-committed password, and its tenant is never flagged
   `is_demo`** — `demoGuard` never blocks it. Either mark `GreenTech
   Solutions Ltd` as `is_demo` in the migration, stop seeding it in
   production (`NODE_ENV` guard on the `db/seed.js` invocation in the start
   command), or delete this legacy seed path entirely now that
   `scripts/seed-demo.js` / Verdant Group is the intended demo account.
2. **[Critical] Unhandled DB-error crash in `routes/emissions.js`** —
   `isPeriodLocked()` calls at lines 109, 203, 212, and 357 sit outside any
   `try/catch`, and there is no process-level `unhandledRejection` handler.
   A single DB hiccup during a write kills the process for all tenants. Wrap
   these calls (or the whole handler) in `try/catch`, and/or add a
   `process.on('unhandledRejection', ...)` safety net in `server.js`.
3. **[High] `demoGuard` is not mounted on `/api/company`,
   `/api/recommendations`, `/api/frameworks`, or `/api/onboarding`**, so a
   demo-flagged tenant's writes go through unblocked on all four — live-
   verified on `/api/company` and `/api/recommendations`. Mount `demoGuard`
   consistently or make the demo-write block a `company_id`-level check
   inside a shared middleware applied at every write route, not per-router
   opt-in.
4. **[High] No role check at all on `/api/frameworks` `PATCH /:framework`
   and all six `/api/onboarding` write routes** — live-verified a `viewer`
   token can rename the company and edit framework status. Add
   `requireRole('admin', 'editor')` (or narrower) to these routes.
5. **[Medium] Audit logging covers 3 of 21 route files** — every write
   added since the original emissions/upload/validation trio (BRSR, team,
   company, social, governance, water, waste, recommendations, onboarding,
   auth) is silently unaudited. At minimum, BRSR (16 endpoints touching
   regulatory submissions) and team-role changes should call `logAction()`.
6. **[Medium] First-boot race on the intended demo flag** — `Verdant
   Group` is not marked `is_demo` until the *second* server boot against a
   given database, because the startup migration's `UPDATE` runs before the
   post-listen seed that creates the row it's supposed to update. A fresh
   production database is one restart away from having its actual demo
   tenant unprotected too.

Everything else tested in Step 1 — unauthenticated access (18/18 correctly
401), auth failing closed on a tampered/malformed JWT, and cross-tenant
IDOR on `emissions`, `team`, `brsr`, and `brsr-evidence` (all correctly
404/403 with no data leaked or altered) — passed.

### Extended audit — deeper IDOR coverage and isolated auth-dependency test

**Date:** 2026-07-26 (same day, follow-up pass). Branch consolidated onto
`claude/cleartrace-pdf-redesign-t5r7qq` per instruction — the separate
`claude/test-report-phase-1-xnjoas` branch was fast-forward merged into it
and is no longer used.

**Extended cross-tenant IDOR test, all remaining routers.** Priority given
to `/api/frameworks`, `/api/onboarding`, `/api/company`, `/api/recommendations`
(the four that had just failed the role-check test, on the theory that a
missing role check and missing tenant check are the same class of bug).
Live-tested cross-tenant access on every router with a real sub-resource id
(`recommendations/:id/status`, `validation/flags/:id`,
`validation/locked/:period`) and compared scoped output between two tenants
for every router without one (`kpi`, `charts`, `targets`, `benchmarking`,
`report`, `social`/`governance`/`water`/`waste`). **Result: no new
cross-tenant IDOR found.** `frameworks`, `onboarding`, and `company` have no
foreign-row-id attack surface at all — every write targets `req.companyId`
directly with nothing to substitute. `recommendations` and `validation`
both correctly scope with `WHERE id=$n AND company_id=$m`; live cross-tenant
attempts returned `404`. One non-security quirk found:
`DELETE /api/validation/locked/:period` against another tenant's period
returns `200 {"unlocked":true}` (the query has no matching row, so it's a
silent no-op) instead of `404` — misleading response, not a data leak; not
fixed in this pass since it wasn't in scope.

**Auth-dependency fail-open/closed test, isolated from the emissions crash
bug.** `middleware/auth.js` (JWT verification) and `middleware/roles.js`
(`requireRole`) were confirmed to have **zero external dependency** — both
are synchronous, in-memory checks. Live-tested during a real DB outage:
unauthenticated and tampered-JWT requests still correctly returned `401`.
They cannot fail open because they have nothing to fail open on.
`middleware/demoGuard.js` is the only auth-adjacent middleware with a real
dependency (its `is_demo` DB lookup). To test it without the confound of
the (now-fixed) emissions crash, the same live-outage test was re-run
against `/api/team/invite` — a fully try/catch-wrapped handler unrelated to
`isPeriodLocked()`. Result: the demo-flagged tenant's write was **not**
blocked with the normal `403 Demo mode` — it proceeded past the guard and
only failed later, cleanly, at its own DB call (`500`). Confirms
`demoGuard` fails open on its own dependency as an independent fact, not
merely as a side effect of finding #2.

### Remediation pass

All fixes below were verified against a live PostgreSQL instance with the
same reproduction steps that originally found each bug — reproduce first,
apply the fix, re-run the identical test, confirm the result flips.

| # | Finding | Status | Verification |
|---|---|---|---|
| 1 | `demo@cleartrace.io` never `is_demo`-flagged; static plaintext password committed in the repo | **Fixed** | `db/seed.js` and `scripts/seed-demo.js` now set `is_demo = true` on the same `INSERT` that creates the company (no longer reliant on a later `UPDATE ... WHERE name = ...`). Both scripts now hash `process.env.DEMO_SEED_PASSWORD` if set, otherwise a `crypto.randomBytes(9)` password generated at seed time and printed once — never a hardcoded literal. Live-verified on a fresh database: `SELECT is_demo FROM companies` showed `true` for both seeded tenants immediately after seeding (no restart needed); login with the old hardcoded passwords (`demo1234`, `Demo1234!`) now returns `401 Invalid credentials`; login with the generated password succeeds and `demoGuard` blocks a subsequent write with `403 Demo mode`. |
| 2 | Unhandled DB error in `routes/emissions.js` (`isPeriodLocked()` and sibling calls outside any `try/catch`) crashed the entire process for all tenants | **Fixed** | All four handlers in `routes/emissions.js` (`GET`, `POST`, `PATCH`, `DELETE`) now wrap their full body — including `ensureMigrated()`, `isPeriodLocked()`, and the company/jurisdiction lookup — in a single `try/catch`, with a new `isConnectionError()` helper returning `503` for connection-class errors (`ECONNREFUSED`, `ETIMEDOUT`, `ENOTFOUND`, `ECONNRESET`) instead of a generic `500`. `server.js` also registers `process.on('unhandledRejection', ...)` as a last-resort net that logs and does not exit, in case any other unguarded async path is found later. Verified by reproducing the original crash fresh on this branch (stopped PostgreSQL, POSTed as the demo-flagged tenant, confirmed `HTTP_CODE:000` and process death), then re-running the identical steps after the fix: response is now `503 {"error":"Service temporarily unavailable"}`, `ps` shows the process still running, and a follow-up request after restarting PostgreSQL succeeds normally — no restart of the app itself required. |
| 3 | `demoGuard` not mounted on `/api/company`, `/api/recommendations`, `/api/frameworks`, `/api/onboarding` — demo-flagged tenants could write through these | **Fixed** | `server.js` now mounts `demoGuard` on all four. Verified live: a demo-flagged tenant's `PATCH /api/company/sector` and `PATCH /api/recommendations/:id/status`, which previously returned `200`, now return `403 Demo mode`; the same requests from a non-demo tenant still succeed (`200`), confirming no regression for legitimate writes. |
| 4 | No role check at all on `PATCH /api/frameworks/:framework` and all six `/api/onboarding` write routes | **Fixed** | Added `requireRole('admin', 'editor')` to `frameworks.js`'s `PATCH /:framework` and to all six onboarding write routes (`/profile`, `/reporting`, `/baseline`, `/targets`, `/invites`, `/complete`). Re-ran the exact original live test — a `viewer` token renaming the company via `PUT /api/onboarding/profile` — with `demoGuard`'s effect isolated out (temporarily un-flagged the test tenant's `is_demo` so the role check, not the demo block, is what's under test): now returns `403 Access denied. Requires role: admin or editor.`, company name unchanged in the database; the same tenant's `admin` token still succeeds (`200`), confirming the check is a real role gate, not a blanket block. |
| 5 | `logAction()` audit coverage is 3 of 21 route files (BRSR's 16 write endpoints, team, company, and seven others have zero audit trail) | **Deferred — explicitly tracked, not forgotten, not blocking Phase 2.** | No code changed. This is a larger, cross-cutting change (adding `logAction()` calls consistently across ~10 route files) that wasn't in this pass's scope; flagging again here so it isn't lost between phases. |
| 6 | First-boot race: the intended demo tenant (`Verdant Group`) wasn't `is_demo`-flagged until the *second* server boot, because the startup migration's `UPDATE` ran before the post-listen seed created the row | **Fixed** | Same fix as #1 — `is_demo` is now set on the `INSERT` itself in `scripts/seed-demo.js`, not left to `demo_migration.sql`'s name-based `UPDATE` (which is left in place, harmless, as a backward-compatible safety net for databases seeded before this fix). Verified live on a completely fresh database: after a single `node server.js` boot (no restart), `SELECT is_demo FROM companies` showed `true` for `Verdant Group` immediately — the two-boot race no longer reproduces. |

### Second remediation pass

Branch note: `claude/cleartrace-esg-app-NoDQp` was fast-forwarded to
`claude/cleartrace-pdf-redesign-t5r7qq` (`0d56f6a..f26c28a`, confirmed a
fast-forward — no merge commit) and is now the branch this and all further
work happens on directly.

| # | Finding | Status | Verification |
|---|---|---|---|
| 7 | `demoGuard`'s fail-open-on-DB-error behavior (found during the Step A isolation test) had only been diagnosed, not fixed — the `catch` block still called `next()` | **Fixed** | `middleware/demoGuard.js`'s `catch` now returns `503 {"error":"Service temporarily unavailable"}` instead of calling `next()` — if the `is_demo` lookup itself fails, the tenant's demo status is unknown, so the write is denied rather than let through. Reproduced the original fail-open live first (stopped PostgreSQL, POSTed `/api/team/invite` as the demo-flagged tenant, got `500 Failed to process invite` — proof the request passed `demoGuard` and only died later at the route's own DB call), then re-ran the identical scenario after the fix: now `503` directly from `demoGuard`, before the route handler runs at all. Confirmed no regression: with the DB up, the same demo tenant is still correctly blocked with `403 Demo mode`, and service resumes normally once PostgreSQL is back. |
| 8 | `db/seed.js` only ran `schema.sql`, not `brsr_migration.sql`, but inserts a `brsr_submissions` row — on a truly fresh database this threw and aborted the whole `db/seed.js && server.js` production start command | **Fixed** | `db/seed.js` now also applies `brsr_migration.sql` (idempotent, same as every other migration file) before the `brsr_submissions` insert. Reproduced first on a genuinely dropped-and-recreated database: `node db/seed.js` failed with `relation "brsr_submissions" does not exist`, exit code `1`. After the fix, the identical steps (drop DB, recreate, run `node db/seed.js`) complete with `Demo seed complete.`, exit code `0`; a second run is a no-op (`Demo data already seeded, skipping.`), confirming idempotency is preserved. |

**Known, deferred, not fixed:** the `DELETE /api/validation/locked/:period`
no-op response for another tenant's period (found during the extended IDOR
pass) returns a misleading `200 {"unlocked":true}` instead of `404` — same
treatment as finding #5: tracked, not blocking Phase 2.

**Phase 2 started below.**

---

## Phase 2: Calculation Completeness

**Date:** 2026-07-26. **Scope:** the emission-factor resolution engine
(`lib/decide-factor.js`, `lib/factor-resolver.js`, `lib/flights.js`,
`lib/vehicle-fuel.js`, `lib/entry-method.js`, `lib/units.js`) and the live
`emission_factors` table. **Method:** same as Phase 1 — a live PostgreSQL
instance, real HTTP requests against a freshly-registered, non-demo tenant
(`Calc Test Co`, company id 3 — the two seeded tenants are both `is_demo`
after Phase 1's fixes and can't write). This pass reports only; nothing
below was fixed.

### Step 1 — coverage matrix

Built from the live `emission_factors` table (39 current rows) plus
`db/emission_factors.js`'s `custom:true` declarations. Regions actually
resolve through four tiers (`lib/factor-resolver.js`): **exact** region row
→ **declared fallback** (AE-family → AE-DU) → **GLOBAL** default → **Tier-4
unreviewed GB substitute**. "Fallback?" below is what tier fired, live-tested
per category — not inferred.

| Category | GB | IN | AE (bare) | AE-DU | AE-AZ/SH/NE | GLOBAL | Manual | Upload |
|---|---|---|---|---|---|---|---|---|
| Grid Electricity | real 2026 (0.14396) | real CEA V21.0 (0.7117) | fallback→AE-DU (0.4041) | real DEWA (0.4041) | fallback→AE-DU (0.4041) | n/a | ✓ | ✓ |
| Water Supply | real (0.149) | **Tier-4 GB fallback (0.149)** | real UAE desal. (2.7) | **BUG — Tier-4 GB fallback (0.149), skips the real 2.7** | **same bug** | n/a | ✓ | ✓ |
| District Heating | real (0.184) | Tier-4 GB fallback | Tier-4 GB fallback | Tier-4 GB fallback | Tier-4 GB fallback | n/a | ✓ | ✓ |
| Company Car (Diesel/Petrol/Average) — distance | real (0.17123/0.18110/0.17068) | Tier-4 GB fallback | Tier-4 GB fallback | Tier-4 GB fallback | Tier-4 GB fallback | n/a | ✓ | ✓ (no UI for method selection either way) |
| Refrigerants (R-134a/R-410A) | real (1430/2088) | Tier-4 GB fallback | Tier-4 GB fallback | Tier-4 GB fallback | Tier-4 GB fallback | n/a | ✓ | ✓ |
| Business Travel (Car/Rail) | real | Tier-4 GB fallback | Tier-4 GB fallback | Tier-4 GB fallback | Tier-4 GB fallback | n/a | ✓ | ✓ |
| Business Travel (Short-haul/Long-haul Flight) — **legacy flat categories** | real (0.15477/0.19304) | Tier-4 GB fallback | Tier-4 GB fallback | Tier-4 GB fallback | Tier-4 GB fallback | n/a | ✓ | ✓ — **only path reachable from the actual UI (see finding #2)** |
| Employee Commuting (Car/Rail) | real | Tier-4 GB fallback | Tier-4 GB fallback | Tier-4 GB fallback | Tier-4 GB fallback | n/a | ✓ | ✓ |
| Waste (Landfill/Recycled/Composted) | real | Tier-4 GB fallback | Tier-4 GB fallback | Tier-4 GB fallback | Tier-4 GB fallback | n/a | ✓ | ✓ |
| Water Treatment | real (0.272) | Tier-4 GB fallback | Tier-4 GB fallback | Tier-4 GB fallback | Tier-4 GB fallback | n/a | ✓ | ✓ |
| Natural Gas / Diesel (Stationary) / Petrol (Stationary) / LPG | n/a | n/a | n/a | n/a | n/a | real, region-independent by design, non-fallback everywhere | ✓ | ✓ |
| Vehicle fuel-basis: diesel/petrol/lpg (`method:"fuel"`) | resolves to the GLOBAL fuel rows above, everywhere | | | | | | ✓ (API/upload only — **no UI**, see finding #2) | ✓ |
| Vehicle fuel-basis: cng (`method:"fuel"`) | **clean 400 rejection everywhere — no seeded row, matches the "clean rejection" reference case** | | | | | | ✓ | ✓ |
| Business Travel (Flight) — **new banded category**, `domestic\|uk-international-short\|uk-international-long\|international-non-uk` × 4-5 cabin classes | region-independent (GLOBAL), real DESNZ 2026 banded figures, non-fallback | | | | | | ✓ (API/upload only — **no UI**, see finding #2) | ✓ |
| 14 `custom:true` GHG Protocol Scope 3 categories (Purchased Goods & Services, Capital Goods, Fuel & Energy Related Activities, Upstream Transport & Distribution, Waste Generated in Operations, Upstream Leased Assets, Downstream Transport & Distribution, Processing of Sold Products, Use of Sold Products, End-of-Life Treatment of Sold Products, Downstream Leased Assets, Franchises, Investments, Purchased Goods, Upstream Transport, Other Scope 3) | region never consulted — user-supplied `emission_factor` required; clean 400 if omitted | | | | | | ✓ | ✓ |

Legend: "real" = exact-region row, `isFallback=false`. "Tier-4 GB fallback" =
`isFallback=true`, GB value applied, reason string present — this is the
*documented, intended* behavior for every category this build never
researched region data for (refrigerants, waste, business travel, commuting,
water treatment, district heating), so it is not itself a defect. The one
row marked **BUG** is: this same Tier-4 mechanism firing where it
*shouldn't* have, because a real regional row exists but isn't reachable
from the region code a real UAE tenant would plausibly use.

### Step 2 — spot-verify against known reference values

| Reference | Computed live | Match? |
|---|---|---|
| Electricity AE-DU: ~404 kg per 1000 kWh (0.4041) | 1000 kWh × 0.4041 → `co2e_tonnes: 0.404100` = **404.1 kg** | ✅ exact |
| Diesel, global-default tier: ~258 kg per 100L | 100 L × 2.51920 → `co2e_tonnes: 0.251920` = **251.92 kg** | ⚠️ **251.92, not 258 — a 2.4% discrepancy.** See finding #4; this is the system's real, consistent answer (matches every path — manual, upload, vehicle fuel-basis — and the 2026-patch migration's explicit "no major changes" confirmation), not a bug I could find. Flagging the mismatch for you to resolve which figure is authoritative. |
| Flights, domestic (with-RF, per pkm) 0.22928 | `emission_factor: 0.229280` | ✅ exact |
| Flights, short-haul-UK economy 0.12576 | `emission_factor: 0.125760` | ✅ exact |
| Flights, long-haul-UK economy 0.11704 | `emission_factor: 0.117040` | ✅ exact |
| Flights, international-non-UK economy 0.10916 | `emission_factor: 0.109160` | ✅ exact |

### Step 3 — manual vs upload parity

Extended to all 22 non-custom DEFRA categories (one CSV upload + 22 matching
manual entries, same activity data, compared row-for-row) plus the two
special-method paths (vehicle fuel-basis, banded flights) and one
`custom:true` category. **Result: zero divergence across all 25 tested
categories/methods** — `emission_factor` and `co2e_tonnes` were byte-identical
between manual and upload for every one, including vehicle fuel-basis diesel
(`factor: 2.519200`, both paths) and long-haul economy flight (`factor:
0.117040`, both paths). Expected, since both routes call the same
`decideFactor()`/`resolveMethodFields()` — this pass exercised that shared
path rather than assuming it from the code.

### Step 4 — unit normalization sweep

Every registered `(unit, canonicalUnit)` pair in `lib/units.js` tested live,
confirming the conversion ratio actually applied (not just that it didn't
error):

| Canonical | Units tested | Result |
|---|---|---|
| kWh | kWh, kwh, MWh, GJ, Wh | All correct: MWh×1000, GJ×277.777778, Wh×0.001 |
| L | litres, L, liter, liters, m3, m³, gallon, gallons | All correct: m3/m³×1000, gallon(s)×4.54609 (UK gallon) |
| kg | kg, kilogram, kilograms, g, gram, grams, tonne, tonnes, t | All correct: g/gram(s)×0.001, tonne/tonnes/t×1000 |
| km | km, kilometre(s), kilometer(s), m, mile, miles | All correct: m×0.001, mile(s)×1.60934 |
| m3 | m3, m³, l, litre, litres, liter, liters | All correct: l/litre(s)/liter(s)×0.001 |
| pkm | pkm, km | Both ×1 (a passenger-km is a km for one traveller) |

**Unregistered pairs correctly throw, never default to 1.0** — live-tested
three cross-canonical mismatches: `Water Supply` (m3-canonical) + `gallons`
(only registered under L) → `400 Unrecognised unit "gallons" for canonical
unit "m3"`; `Grid Electricity` (kWh-canonical) + `litres` → same rejection
pattern; `Waste (Landfill)` (kg-canonical) + `lbs` (never registered anywhere)
→ same. No silent 1.0 found anywhere in the sweep.

### Step 5 — fallback consistency

For every category in the flagged-fallback tier (water treatment, waste,
refrigerants, commuting, business travel, district heating — i.e. everything
with only a GB row), tested GB / IN / AE, not just one spot-check each:
**`isFallback` and `fallbackReason` were set correctly and consistently in
every case** — `false`/`null` for the real GB row, `true`/a real
category-and-region-naming reason string for IN and AE. No inconsistency
found in this tier.

The one place fallback behavior is **not** consistent is Water Supply
(finding #1) — but that's a resolution-order bug, not an
`isFallback`-flagging bug: when the (wrong) Tier-4 path fires, it still
flags `isFallback=true` correctly and honestly. The bug is that Tier-4 fires
at all for `region=AE-DU`, when a correct, unflagged Tier-1 answer was
available two tiers earlier under `region=AE`.

### Step 6 — regression sweep

- **CNG** — still a clean `400` at every region tested (GB/IN/AE), both via
  distance-basis (no such category exists) and fuel-basis (`method:"fuel",
  fuel_type:"cng"`) — `"No emission factor is available for category
  \"CNG\"..."`. Never a fabricated factor.
- **Historical rows frozen** — Verdant Group's seeded 2023-01 Grid
  Electricity entry (`id=86`) still reads `emission_factor: 0.204930,
  factor_source: 'DEFRA 2023'` after the 2026 patch migration closed out
  that row and added the 2026 replacement — confirmed live via direct query.
  The generated `co2e_tonnes` column computes from each entry's own stored
  factor, never a live join, so nothing already computed can move
  retroactively. A fresh entry against the same category on the same tenant
  correctly gets the new 2026 figure (0.14396) — old and new coexist exactly
  as designed.
- **`custom:true` path** — still requires a user-supplied `emission_factor`
  (clean `400` if omitted: `"Category ... has no published emission factor.
  Supply emission_factor."`), still labels the stored row `factor_source:
  'user-supplied'`, confirmed via both manual and upload.
- **`baseline_emissions` / BRSR P6 typed totals** — confirmed **not**
  silently included in any calculated aggregate. Live test: inserted a
  deliberately huge baseline (999,999 t/scope) via
  `PUT /api/onboarding/baseline` for the test tenant; `/api/kpi`'s
  `totalEntries` and `/api/emissions`'s `total` were unchanged before and
  after (134 both times). Code-confirmed the same holds for BRSR P6
  (`brsr_p6_environment` is referenced only in `routes/brsr.js` — zero
  occurrences in `kpi.js` or `charts.js`, same isolation pattern as
  `baseline_emissions`, which the live test exercised directly).

### Findings, ranked by severity

| # | Severity | Finding |
|---|---|---|
| 1 | **High** | **Wrong water factor for explicit UAE emirate regions.** `lib/factor-resolver.js`'s Tier 2 ("declared fallback") hardcodes a lookup against `region='AE-DU'` for *any* category once the requested region starts with `'AE'` — the code comment says "UAE electricity only, for now" but the code itself isn't scoped to electricity. The verified UAE water factor is stored at the *bare* `region='AE'`, not `'AE-DU'`. Live-verified: `region=AE` (bare) correctly resolves Water Supply to the real 2.7 kg/m³ desalination figure, `isFallback=false`. `region=AE-DU`/`AE-AZ`/`AE-SH`/`AE-NE` — the specific-emirate values a real UAE tenant would plausibly set — instead fall through to Tier 4 and silently apply the *GB* figure (0.149, ~18x lower) flagged as an "unreviewed cross-region substitute," even though the correct, verified, already-present number was one tier away. `defaultRegionFromJurisdiction` happens to default a UAE company to the bare `'AE'` (so the common case is unaffected), but any entry or company explicitly on an emirate-level region gets this wrong. |
| 2 | **High** | **The two newest calculation features are unreachable from the product UI.** `frontend/index.html` / `frontend/js/dashboard.js` have no field for `method`, `fuel_type`, `cabin_class`, `touches_uk`, or `both_endpoints_uk`, and never list `'Business Travel (Flight)'` as a category option — grepped, zero occurrences. A real user can only log vehicle fuel receipts as distance driven (never fuel consumed) and can only log flights via the old flat GB-only per-km categories (no route banding, no cabin class) — verified those still resolve correctly, but the accurate, DESNZ-2026-banded, cabin-class-aware system that was built specifically to replace them (`lib/flights.js`, `lib/vehicle-fuel.js`) is reachable only via direct API calls or a correctly-formatted upload file, neither of which is documented anywhere a user would see. |
| 3 | **Medium** | **Dashboard shows a stale factor and sends it, on every grid-electricity entry.** `dashboard.js` carries its own hardcoded `DEFRA_FACTORS` copy (2023 vintage) and displays a "✅ 0.20493 kg CO₂e/kWh — DEFRA 2023" badge to the user, then actively sends `emission_factor: 0.20493, factor_source: 'DEFRA 2023'` to the server on submit. The server correctly discards this for GB (resolving 0.14396 instead — confirmed no data corruption, server-authoritative design holds), but this means every dashboard-submitted GB grid-electricity entry logs a "rejected client-supplied factor" server warning as its *normal* path, and the badge actively misleads the user about what will be recorded. |
| 4 | **Low** | **Diesel reference-value mismatch, unresolved.** This test's reference figure ("~258 kg per 100L") doesn't match the system's actual, internally-consistent answer (251.92 kg per 100L, confirmed identical across manual/upload/vehicle-fuel-basis, and unchanged/re-confirmed by the 2026 patch). Not fixed — no code path was found producing 258; flagging so you can confirm which number should be authoritative before Phase 2 closes. |
| 5 | **Low** | **Dead code:** `lookupFactor()`, `CEA_FACTORS`, `UAE_FACTORS` in `db/emission_factors.js` have zero callers anywhere (grepped) — the real resolution path is entirely `decideFactor` → `resolveRegionFactor` → the DB table. Their numbers still happen to match the live table today (CEA 0.7117, DEWA 0.4041), so there's no active divergence, but nothing enforces that going forward. |
| 6 | **Info** | Two independent, non-deprecated flight calculation paths now coexist — the legacy flat `'Business Travel (Short-haul/Long-haul Flight)'` categories and the new banded `'Business Travel (Flight)'` category — with no schema or UI signal that one supersedes the other. Compounds finding #2, since the UI can only reach the legacy path. |

### Needs a decision before fixing

- **Finding #1** (water/AE-DU) — straightforward to fix (Tier 2 should try
  the bare country code, not just the hardcoded electricity fallback
  region, before falling to Tier 4) but touches the same resolver every
  category goes through — want this scoped narrowly to water, or should Tier
  2 be generalized properly for any future country-level-but-not-electricity
  factor?
- **Finding #2** (UI gap) — is closing this in scope for this test-report
  effort at all, or is it a separate, larger frontend workstream? It's the
  single biggest gap between "what the calculation engine can do" and "what
  a user can actually do," but it's a UI build, not a calculation fix.
- **Finding #4** (258 vs 251.92) — need your call on which figure is
  correct before anything touches the diesel row.

### Remediation pass

Same discipline as Phase 1: reproduce first, apply the fix, re-run the
identical check, confirm the result flips — plus a saved before/after
fixture (`cleartrace/backend/tests/fixtures/`) so "no regression" is a
byte-for-byte diff, not a re-read of the code.

**Fixture methodology.** Before touching the resolver,
`tests/fixtures/generate-coverage-matrix.py` re-ran Phase 2's full Step 1
coverage matrix (every category × every region, plus vehicle fuel-basis,
flights, CNG rejection, and the custom:true path) against a live server and
saved the raw output as `tests/fixtures/phase2-coverage-matrix.before.json`
(22 categories × 7 regions + 4 vehicle-fuel cases + 4 flight cases + 2
custom-category cases). The same script, re-run after the fix, produced
`phase2-coverage-matrix.after.json`. A structural diff between the two
found **exactly 16 leaf differences, all four fields (`emission_factor`,
`region_resolved`, `fallback_reason`, `factor_source`) on exactly the four
cells that should have changed** — `Water Supply` at `AE-DU`, `AE-AZ`,
`AE-SH`, `AE-NE`. Every other cell in the matrix, including the one the
instructions specifically called out (`Grid Electricity` at `AE-DU` and
`AE-AZ`), was confirmed byte-identical before and after.

| # | Finding | Status | Verification |
|---|---|---|---|
| 1 | Explicit UAE emirate region codes (`AE-DU`/`AE-AZ`/`AE-SH`/`AE-NE`) got the wrong Water Supply factor — the resolver's declared-fallback tier hardcoded a lookup for `AE-DU` specifically, missing the real verified `AE`-level row | **Fixed — general fix, not a Water Supply special case.** | `lib/factor-resolver.js` gained a new Tier 2: any subdivision-shaped region (`'XX-YY'`) tries its bare country code (`'AE-DU'` → `'AE'`) before the old subdivision-specific fallback (now Tier 3) or the cross-region GB substitute (now Tier 5). Applies to any future `'XX-YY'` region, not just AE. Reproduced the original bug live first (`AE-DU` Water Supply → GB's 0.149, `isFallback: true`, "unreviewed cross-region substitute"), applied the fix, re-ran the identical request: now resolves the real `2.7` UAE desalination figure, `region_resolved: "AE"`, `isFallback: true` with an honest "country-level" reason — still flagged, just no longer wrong. Full-matrix fixture diff (above) confirms nothing else moved. Two new permanent regression tests added to `tests/emissions-region-resolution.test.js` (`AE-DU` and `AE-AZ` Water Supply); full suite run: **41/41 passing** (39 pre-existing + 2 new). |
| 2 | Vehicle fuel-basis and the DESNZ-2026-banded flight system are functionally correct but unreachable from the dashboard UI — no form fields exist for `method`, `fuel_type`, `cabin_class`, `touches_uk`, or `both_endpoints_uk`, and `'Business Travel (Flight)'` is never offered as a category | **Deferred — logged as a separate, scheduled workstream, not built in this pass, per instruction.** | No UI code touched. This is a frontend build (new form fields, category picker, conditional logic), not a calculation fix, and was explicitly out of scope for this remediation round. |
| 3 | Dashboard shows a stale "DEFRA 2023" grid-electricity badge and sends that superseded factor to the server on every submission (server correctly discards it, but it's noise + a misleading display) | **Not addressed this pass** — outside the four steps in this remediation round; still open. | — |
| 4 | Diesel reference-value mismatch: this test's "~258 kg per 100L" reference didn't match the system's actual output (251.92 kg/100L) | **Closed — confirmed a test-script error, not a system bug. No code change.** | The ~258 figure was a stale pre-verification reference used when drafting the Phase 2 test script, not a value derived from any DESNZ/DEFRA source in this codebase. The system's 251.92 kg/100L is confirmed correct: unchanged since DEFRA 2023, and explicitly re-confirmed current by the 2026 patch migration's citation of the DESNZ 2026 Major Changes report ("Fuels — no major changes this year," 5%+ materiality threshold). Every path — manual, upload, vehicle fuel-basis — agrees on 251.92; the diesel row is untouched. |
| 5 | Dead code: `lookupFactor()`, `CEA_FACTORS`, `UAE_FACTORS` in `db/emission_factors.js` have zero callers | **Not addressed this pass** — outside the four steps in this remediation round; still open. | — |
| 6 | Two independent, non-deprecated flight calculation paths coexist (legacy flat categories vs. the new banded category) with no schema/UI signal that one supersedes the other | **Not addressed this pass** — directly related to #2 (the legacy path is the *only* one the UI can reach); tracked together with it, not separately fixed. | — |

### Phase 2 close-out

**Step 1 — mapped before fixing.** Grepped `dashboard.js` for every
`DEFRA_FACTORS`/`CEA_FACTORS`/`UAE_FACTORS` use (11 call sites across
`updateGridElecBadge()`, `applyEmissionFactor()`, and the submit handler's
`efExtras` construction — full list in-session, not reproduced here).
Traced why the local table was never deleted: commit `d4d2690` ("Make the
server authoritative for emission factors") migrated exactly one usage —
the save-confirmation banner — and left a comment on the rest: *"the local
table survives until Step 3."* The build's actual Step 3 (per
`vehicle_flight_migration.sql`'s own header) turned out to be vehicle
fuel-basis and flight banding, not a dashboard cleanup — a dropped
commitment, not a reintroduced copy.

That mapping surfaced two premises in the original instructions that didn't
hold, both flagged and resolved with you before any code changed:

- `GET /api/emission-factors` was **not** region+date aware — it served the
  same static, frozen-2023 `DEFRA_FACTORS` object `dashboard.js` already
  hardcoded (confirmed live: `curl .../api/emission-factors` returned
  `0.20493`, not the current `0.14396`). Wiring the frontend to it as
  originally specified would have moved the staleness over HTTP without
  fixing it. Resolved: extend the endpoint to be genuinely live
  (`?region=` param, backed by the same `lib/factor-resolver.js` every real
  submission uses).
- `CEA_FACTORS`/`UAE_FACTORS` were **not** actually dead — `routes/brsr.js`
  uses both to auto-stamp a factor-source label on BRSR P6's Scope 2 save.
  Resolved: keep them, delete only `lookupFactor()` (which genuinely has
  zero callers), and log `routes/brsr.js`'s use of the same stale 2023
  figures as a new, separate finding (below) rather than silently leaving
  it out of the record.

**Step 2 — finding #3 fixed.** `server.js`'s `GET /api/emission-factors`
now accepts `?region=<code>` and, when present, resolves every category's
*current* factor via a new `lib/factor-preview.js` (`resolveAllFactors()`),
built on the exact same `resolveRegionFactor()` every real submission goes
through — verified live: `?region=GB` → `0.14396`/`defra-2026`,
`?region=IN` → `0.7117`/`cea-v21.0`, `?region=AE-DU` → `0.4041`/`uae-dewa`.
The region-factor migrations were added to `server.js`'s `STARTUP_MIGRATIONS`
so this public, unauthenticated route can't be the first request served
against a database that doesn't have the table yet.

`dashboard.js`'s hardcoded `DEFRA_FACTORS`/`CEA_FACTORS`/`UAE_FACTORS` are
deleted; `loadLiveFactors()` fetches all three regions once at page load
and every badge/scope/unit lookup now reads that. The submit handler no
longer constructs a client-side `emission_factor`/`factor_source` for grid
electricity at all — it sends `region` instead (`GB`/`IN`/`AE`) and lets
the server's resolver do the real work, matching how every other
non-custom category already worked.

Reproduced first in a real headless-Chromium session (Playwright, temporary
`--no-save` install, not a project dependency): badge showed `0.20493`,
saved value came back `0.143960`, server logged `[emissions] rejected
client-supplied factor fields ... server-resolved factor 0.143960
(defra-2026, region=GB) used instead` on a completely ordinary submit. After
the fix, identical flow: badge shows `0.14396 · defra-2026`, no warning in
the log for that submission. Separately confirmed the check itself is
unweakened — a manually crafted request with a spoofed `emission_factor:
0.001` still gets discarded and still logs the rejection warning,
unaffected by anything touched this pass (`decideFactor()` itself was never
modified). Full suite: **41/41 passing**, no regressions.

**Confirmed no other consumer of `GET /api/emission-factors` exists,
before treating the response-shape change as safe.** Grepped the whole
repository — not just `dashboard.js` — for every reference to
`emission-factors`, including case-insensitive `fetch(`/`axios` patterns,
across `.js`, `.html`, `.md`, `.json`, `.toml`, `.sh` files, the backend
`tests/` and `scripts/` directories, root-level configs, and the unrelated
`backend/`/`frontend/` OpsCommand app. The only functional caller anywhere
is `dashboard.js`'s own `loadLiveFactors()` — written in this same pass.
One incidental hit: the stray root-level patch file
`cleartrace-uae-scope3 2.txt` (already noted in `CLAUDE.md`'s C12 as a
committed `git diff` against `db/emission_factors.js`, not source) touches
the `emission_factors.js` *module* in its diff text, but has no connection
to the HTTP endpoint and isn't executed or consumed by anything — dead
text, not a caller. The shape change is safe by construction regardless:
without `?region=`, the response is byte-identical to the old behavior
(same raw `DEFRA_FACTORS` object) — no pre-existing caller could have been
relying on the new `?region=` path, since the endpoint never read
`req.query` before this pass.

**Step 3 — finding #5 fixed (narrowed per your decision).** Confirmed via
grep that `lookupFactor()` has zero callers anywhere and deleted it.
`CEA_FACTORS`/`UAE_FACTORS` are kept — `routes/brsr.js` is a real caller —
and are now also referenced by the new `lib/factor-preview.js`, so they're
no longer even partially dead code. `db/emission_factors.js` still exports
`DEFRA_FACTORS`, `CEA_FACTORS`, `UAE_FACTORS`, `LEGACY_ALIASES`,
`GHG_PROTOCOL_SCOPE3_CATEGORIES` — only `lookupFactor` removed. Full suite
re-run after deletion: **41/41 passing**; `routes/brsr.js` confirmed to
still load and resolve correctly.

**Step 4 — finding #6 left as-is.** No code touched. Remains tracked tied
to finding #2 in the table below, not separately decided or actioned.

Also noted while verifying this fix, unrelated and pre-existing:
`GET /api/onboarding/status` 500s with `column "industry_sector" does not
exist` — a schema/route mismatch with no connection to emission factors,
not investigated further here, not a numbered finding.

### Phase 2 — all findings, final status

| # | Finding | Final status |
|---|---|---|
| 1 | UAE emirate region codes got the wrong Water Supply factor | **Fixed** — general resolver fix, verified with a before/after fixture diff, 2 new regression tests, 41/41 suite passing. |
| 2 | Vehicle fuel-basis and banded flights unreachable from the dashboard UI | **Deferred as a scheduled workstream** — explicitly out of scope for calculation/data fixes; needs its own frontend build. |
| 3 | Dashboard showed a stale factor and sent it on every grid-electricity submission | **Fixed** — endpoint made genuinely region+date aware, frontend wired to it, local hardcoded tables deleted, tamper-detection confirmed still intact, verified live in a real browser. |
| 4 | Diesel reference value (~258) didn't match the system's actual output (251.92) | **Confirmed not a bug** — the reference was a stale figure in the test script itself; closed with no code change. |
| 5 | Dead code (`lookupFactor()`, `CEA_FACTORS`, `UAE_FACTORS`) | **Fixed, narrowed on investigation** — `lookupFactor()` deleted (genuinely zero callers); `CEA_FACTORS`/`UAE_FACTORS` kept, since `routes/brsr.js` is a real caller that deletion would have broken. |
| 6 | Two coexisting flight calculation paths (legacy flat vs. new banded) | **Tracked with #2** — not separately actioned; resolves naturally once #2's UI work decides whether to expose or deprecate the legacy categories. |
| 7 | `routes/brsr.js:658-685` auto-stamps BRSR P6's `emission_factor_source` disclosure field with the same class of stale data as the original finding #3 — a hardcoded `'DEFRA 2023 (0.20493 kg CO₂e/kWh)'` string for UK-jurisdiction companies, and the (unchanged) `CEA_FACTORS`/`UAE_FACTORS` vintages for IN/AE. Surfaced during this pass's Step 1/3 investigation, not part of the original six. | **Tracked, reserved for the BRSR redesign workstream** — not fixed now, not forgotten. `routes/brsr.js` is BRSR-module code, not the general emissions-entry path this Phase 2 pass scoped itself to; fixing it here would mean reaching into a module earmarked for its own redesign rather than patching it piecemeal. Revisit alongside that workstream, using the same live-resolver pattern (`lib/factor-preview.js`/`resolveRegionFactor()`) finding #3 used. |

**Phase 2 is closed.** Finding #7 is carried forward, untouched, reserved
for the BRSR redesign workstream. **Phase 3 not started, per instructions.**
