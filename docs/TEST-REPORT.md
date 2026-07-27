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
for the BRSR redesign workstream.

---

## Phase 3: Data Integrity

**Date:** 2026-07-26. **Scope:** every foreign-key relationship declared
across `schema.sql` and all 18 migration files, tested live against a real
PostgreSQL instance — not inferred from reading the SQL. Reframed from
"tenant isolation" per your instruction: Phase 1's remediation already
covered cross-tenant IDOR across all 18 routers; this phase is about the
database's own referential integrity, a different question. **Report-only
pass — no fixes.**

### Step 1 — foreign-key map

Every `REFERENCES` clause in the codebase, plus every same-named column
that looks like a relationship but isn't declared as one.

| Table.column | References | Constraint declared? | ON DELETE |
|---|---|---|---|
| `users.company_id` | `companies(id)` | Yes | CASCADE |
| `emissions_entries.company_id` | `companies(id)` | Yes | CASCADE |
| `emissions_entries.user_id` | `users(id)` | Yes | **undeclared → NO ACTION (blocks)** |
| `emissions_entries.factor_source` | *(`emission_factors.factor_source_id`, logically)* | **No — plain TEXT, zero constraint** | n/a |
| `framework_status.company_id` | `companies(id)` | Yes | CASCADE |
| `audit_log.company_id` | `companies(id)` | Yes | CASCADE |
| `audit_log.user_id` | `users(id)` | Yes | SET NULL |
| `audit_log.record_id` | *(polymorphic — `record_type` selects the table)* | **No — can't be, by necessity** | n/a |
| `validation_flags.company_id` | `companies(id)` | Yes | CASCADE |
| `validation_flags.entry_id` | `emissions_entries(id)` | Yes | CASCADE |
| `validation_flags.reviewed_by` | `users(id)` | Yes | SET NULL |
| `locked_periods.company_id` | `companies(id)` | Yes | CASCADE |
| `locked_periods.locked_by` | `users(id)` | Yes | SET NULL |
| `water_metrics.company_id` / `waste_metrics.company_id` | `companies(id)` | Yes | CASCADE |
| `water_metrics.entered_by` / `waste_metrics.entered_by` | `users(id)` | Yes | SET NULL |
| `social_metrics.company_id` / `governance_metrics.company_id` | `companies(id)` | Yes | CASCADE |
| `social_metrics.entered_by` / `governance_metrics.entered_by` | `users(id)` | Yes | SET NULL |
| `team_invites.company_id` | `companies(id)` | Yes | CASCADE |
| `team_invites.invited_by` | `users(id)` | Yes | CASCADE *(deletes the invite, not the inviter)* |
| `baseline_emissions.company_id` | `companies(id)` | Yes | CASCADE |
| `pending_invites.company_id` | `companies(id)` | Yes | CASCADE |
| `company_recommendations.company_id` | `companies(id)` | Yes | CASCADE |
| `company_recommendations.recommendation_id` | `recommendation_library(id)` | Yes | CASCADE |
| `company_recommendations.updated_by` | `users(id)` | Yes | SET NULL |
| `brsr_submissions.company_id` | `companies(id)` | Yes | CASCADE |
| `brsr_submissions.submitted_by` / `.locked_by` | `users(id)` | Yes | **undeclared → NO ACTION (blocks)** |
| `brsr_evidence_vault.company_id` | `companies(id)` | Yes | CASCADE |
| `brsr_evidence_vault.submission_id` | `brsr_submissions(id)` | Yes | CASCADE |
| `brsr_evidence_vault.uploaded_by` | `users(id)`, NOT NULL | Yes | **undeclared → NO ACTION (blocks)** |
| `brsr_period_locks.company_id` | `companies(id)` | Yes | CASCADE |
| `brsr_period_locks.submission_id` | `brsr_submissions(id)` | Yes | CASCADE |
| `brsr_period_locks.actioned_by`, NOT NULL / `.locked_by`, `.unlock_requested_by` (nullable) | `users(id)` | Yes | **undeclared → NO ACTION (blocks)** |
| `brsr_lock_audit.submission_id` | `brsr_submissions(id)` | Yes | CASCADE |
| `brsr_lock_audit.performed_by` | `users(id)`, NOT NULL | Yes | **undeclared → NO ACTION (blocks)** |
| `brsr_section_a.company_id` / `brsr_p6_environment.company_id` | `companies(id)` | Yes | CASCADE |
| `brsr_section_a.submission_id` / `brsr_p6_environment.submission_id` | `brsr_submissions(id)` | Yes | CASCADE |
| `brsr_section_a.entered_by` / `brsr_p6_environment.entered_by` | `users(id)`, NOT NULL | Yes | **undeclared → NO ACTION (blocks)** |
| `brsr_p1_ethics` / `p2_products` / `p4_stakeholders` / `p7_policy` / `p8_growth` / `p9_consumers` — `.company_id` | `companies(id)` | Yes | CASCADE |
| — same tables — `.submission_id` (all `UNIQUE`) | `brsr_submissions(id)` | Yes | CASCADE |
| — same tables — `.entered_by` (nullable) | `users(id)` | Yes | **undeclared → NO ACTION (blocks)** |
| `brsr_p3_employees.company_id` / `.submission_id` | `companies(id)` / `brsr_submissions(id)` | Yes | CASCADE |
| `brsr_p3_employees.entered_by`, NOT NULL | `users(id)` | Yes | **undeclared → NO ACTION (blocks)** |
| `brsr_p5_humanrights.company_id` / `.submission_id` (UNIQUE) | `companies(id)` / `brsr_submissions(id)` | Yes | CASCADE |
| `brsr_p5_humanrights.entered_by` (nullable) | `users(id)` | Yes | **undeclared → NO ACTION (blocks)** |
| `brsr_section_b.company_id` / `.submission_id` | `companies(id)` / `brsr_submissions(id)` | Yes | CASCADE |
| `brsr_section_b.entered_by`, NOT NULL | `users(id)` | Yes | **undeclared → NO ACTION (blocks)** |
| `benchmark_data`, `recommendation_library` | *(no `company_id` at all — global lookup tables)* | n/a | n/a |
| `emission_factors` | *(nothing references it via a declared FK)* | n/a | n/a |

**Every `company_id` column CASCADEs.** No exceptions found. **Every
`*_by`/`entered_by`/`uploaded_by` column that specifies `ON DELETE` uses
`SET NULL`** (audit-style columns — `reviewed_by`, `locked_by` on
`locked_periods`, `entered_by` on the metrics tables, `updated_by`). **Every
`*_by` column that omits `ON DELETE` entirely — 15 columns across
`emissions_entries` and 11 BRSR tables — defaults to Postgres's `NO ACTION`,
which blocks the delete rather than nulling or cascading.** That's not
"silently NO ACTION with no thought behind it" in the sense of being
inconsistent — it's the single largest pattern in the schema, applied
uniformly to every "who did this" column added across nine different
migration files by nine different authors/sessions, none of whom declared
an explicit behavior. Whether that's the *intended* behavior is a separate
question from whether it's *declared* — see Step 2.

`emissions_entries.factor_source` is the one relationship that's real in
the application's logic (Phase 2 established the whole "frozen history"
guarantee depends on it staying a snapshot) but has **zero** DB-level
enforcement — not because someone forgot, but because `emission_factors.
factor_source_id` isn't a unique/PK column (the same id, e.g. `'defra-2023'`,
is reused across many rows for different categories), so Postgres
structurally couldn't accept an FK there even if one were declared. This
is a deliberate design outcome, not an oversight — but it does mean nothing
in the database stops the live `emission_factors` table from losing a row
that history refers to by label. Tested in Step 2.

### Step 2 — live cascade/orphan testing

All three tests run against a disposable test tenant (`FK Test Co`,
populated across every child table), not the seeded demo companies.

**1. Delete a company.** `DELETE FROM companies WHERE id=3` — clean, no
error. Verified with an explicit before/after row count across 9
representative child tables (`users`, `emissions_entries`,
`framework_status`, `water_metrics`, `baseline_emissions`, `team_invites`,
`brsr_submissions`, `brsr_section_a`, `brsr_p6_environment`): every one
went from its populated count to exactly `0`. **No orphans, no blocking —
company deletion cascades correctly end to end**, including through the
BRSR tables that didn't exist when `schema.sql` was first written.

One caveat, not a DB-integrity bug but adjacent to "evidence attachments"
specifically: `DELETE /api/brsr/evidence/:evidenceId` (`routes/brsr-
evidence.js:140-173`) removes the file from Supabase Storage *before*
deleting the DB row — but that cleanup is application code, not a DB
trigger. A `DELETE FROM companies` (or a cascade into
`brsr_evidence_vault` from any other direction) removes the **database
row** for any evidence the company had, but never calls Supabase to delete
the **actual file** — it can't; SQL cascades don't make HTTP calls. Today
this is dormant risk rather than an active bug, because **there is no
`DELETE /api/company` endpoint anywhere in the app** — company deletion is
only possible via direct database access, which is exactly how this test
performed it. If that ever changes, or if anyone deletes a company directly
against the database with evidence files attached, those files become
permanently orphaned in external storage with nothing in ClearTrace aware
they still exist.

**2. Delete a user with existing emissions entries / BRSR submissions
attributed to them.** Realistic scenario: company continues to exist, an
admin removes a team member via `DELETE /api/team/:userId`
(`routes/team.js:150-170`), the target user has logged one emissions entry
and is `brsr_submissions.submitted_by` on one submission.

Result: **blocked**, both times, independently:
```
DELETE /api/team/:userId error: update or delete on table "users" violates
foreign key constraint "emissions_entries_user_id_fkey" on table "emissions_entries"
```
surfaced to the admin as `500 {"error":"Failed to remove user"}` — no
indication of why, no path to resolve it from the app. Removed the blocking
emissions entry and retried: blocked again, this time by
`brsr_submissions_submitted_by_fkey`, same generic `500`. **Every one of
the 15 undeclared-`ON DELETE` columns from Step 1 is a live, independent
way for this exact failure to happen** — any user who has ever logged an
entry or touched any BRSR section becomes permanently un-removable from
their team through the app, full stop, with no error message that would
tell an admin why or what to do about it.

Note the scope of this: it only blocks removing a user **while their
company continues to exist**. Deleting the whole company (test 1, above)
cascades through `users` too — by the time Postgres gets to the `users`
row, everything that was blocking its deletion has already been cascaded
away by the company-level `CASCADE`, so there's no conflict. The bug is
specific to the "remove one team member, keep the company" path, which is
also the only one the app actually exposes.

**3. Delete an `emission_factors` row that historical entries reference
via `factor_source_id`.** Per Step 1, nothing stops this — confirmed live.
Created a real entry through the resolver (`id=140`, GB Grid Electricity,
`emission_factor=0.143960`, `factor_source='defra-2026'`), then
`DELETE FROM emission_factors WHERE id=28` (the exact row that resolved
it) — **succeeded immediately, no error, no warning.** Two effects,
checked separately:
- Entry `140`'s own stored `emission_factor`/`factor_source`/`co2e_tonnes`
  were **completely unchanged** — the frozen-history guarantee holds, but
  because of the snapshot-on-write design (Phase 2), not because anything
  in the database stopped the delete.
- A **new** GB Grid Electricity submission, immediately after, failed with
  `400 "No emission factor is available for category \"Grid Electricity
  (UK)\" in region \"GB\"."` — every GB tenant's grid-electricity logging
  was broken app-wide, silently, with nothing in the schema, a migration,
  or an audit trail to explain why, until someone noticed the 400s and
  traced it back. Restored the row immediately
  (`region_factors_2026_patch_migration.sql` is idempotent — re-running it
  re-inserted the exact same row) and confirmed resolution working again
  before continuing.

### Step 3 — orphan scan on current live data

Independent of the deletion tests above — scanned every relationship from
Step 1 against the database as it stands today (65 checks: every declared
FK's column, plus the one undeclared one).

**Every declared-constraint relationship: zero orphans**, across all 65
checks — expected, since Postgres enforces these regardless of application
code, but confirmed rather than assumed (full query and results captured
in-session).

**One real, already-existing orphan pattern found — the one relationship
Step 1 flagged as unconstrained:**
`emissions_entries.factor_source (unconstrained)` → **138 rows** whose
`factor_source` value doesn't match any `factor_source_id` in the live
`emission_factors` table. Traced to exactly the two seeded demo companies:
`GreenTech Solutions Ltd` (84 rows) and `Verdant Group` (54 rows), both
carrying the legacy label `'DEFRA 2023'` — a human-readable string from
before the region-aware `emission_factors` table existed, never matching
the machine-readable IDs (`'defra-2023'`, `'defra-2026'`, …) that table
actually uses. A freshly-resolver-created entry in the same database
(`factor_source='defra-2026'`) is correctly **not** counted — the scan
distinguishes real matches from stale ones precisely. Functionally
harmless today (nothing in the app joins on this column at runtime — it's
read and displayed, never looked up), but it is a genuine, silent,
already-existing inconsistency in the current data, exactly the kind Step
3 was designed to surface.

### Findings, ranked by severity

| # | Severity | Finding |
|---|---|---|
| 1 | **High** | **`emission_factors` rows have zero delete protection.** No FK references this table from anywhere (structurally can't, since `factor_source_id` isn't unique). A single `DELETE` — a bad migration, a manual DB fix gone wrong, compromised DB access — silently breaks live factor resolution for an entire category/region, app-wide, for every tenant, with no error and nothing in any audit trail pointing at the cause. Live-verified: deleting the current GB Grid Electricity row broke every new GB grid-electricity submission instantly while leaving history untouched, which is the deceptive part — the one signal that would normally reveal a data problem (existing rows changing) never fires. |
| 2 | **Medium** | **A user who has ever logged an emissions entry or touched any BRSR workflow can never be removed from their team through the app.** 15 columns across `emissions_entries` and 11 BRSR tables omit `ON DELETE`, defaulting to Postgres's `NO ACTION`. `DELETE /api/team/:userId` has no pre-check, so the admin gets a raw, unhelpful `500 {"error":"Failed to remove user"}` with no indication of which of 15 possible constraints fired or how to resolve it. In practice this affects nearly every active user, since logging one entry or touching BRSR once is enough to trigger it permanently. |
| 3 | **Medium** | **BRSR evidence files in Supabase Storage aren't cleaned up by any DB-level cascade** — only `DELETE /api/brsr/evidence/:evidenceId`'s own application code does that. Since company deletion has no app endpoint at all (only reachable via direct DB access, as this test used), this is dormant today but becomes a real orphan-file risk the moment company deletion is exposed any other way. |
| 4 | **Low** | **138 existing rows (both seeded demo tenants) already carry an orphaned `factor_source` label** (`'DEFRA 2023'`) that matches nothing in the live `emission_factors` table — confirmed via live orphan scan, not inferred. Harmless today (display-only field), but a real, pre-existing data-quality gap, not a hypothetical one. |
| 5 | **Info** | Two structurally near-identical tables exist for pending team invitations — `team_invites` (`team_migration.sql`) and `pending_invites` (`onboarding_migration.sql`) — both `company_id`-scoped, serving overlapping purposes from two different onboarding paths. Not itself an integrity bug, but doubles the surface area for the same class of reasoning this phase covers. |
| — | **Positive** | Company deletion — the single most consequential cascade in the schema — is completely correct: every one of 27 child tables (companies' full dependency graph) cascades cleanly with zero orphans, verified live, not assumed from the `ON DELETE CASCADE` clauses alone. |

### Remediation pass

Same discipline as Phases 1 and 2: reproduce the original bug live first,
apply the fix, re-run the identical scenario to confirm it flips, then the
full regression suite.

**Finding 1 — DB-level delete guard.** Reproduced first: with
`routes/emissions.js`'s lazy migration already warmed by a prior request
(otherwise its own `ensureMigrated()` self-heals a freshly-deleted current
row via its `ON CONFLICT DO NOTHING` re-insert on the very next request —
a real quirk of this codebase's lazy-migration architecture, not a fix for
the finding, worth remembering separately), deleted the active GB Grid
Electricity row directly via SQL and confirmed a new submission failed
with the same `400 "No emission factor is available..."` this phase
originally found. Added
`cleartrace/backend/db/emission_factors_delete_guard_migration.sql`: a
`BEFORE DELETE` trigger on `emission_factors` that raises an exception
naming the row's id/region/category/subtype whenever `valid_to IS NULL`
(the active vintage), and points at the correct fix (`UPDATE ... SET
valid_to`, then `INSERT` the replacement row) in the error text itself.
Wired into both places that currently touch this table's schema
(`routes/emissions.js`, `routes/upload.js`, each behind their own
independent `ensureMigrated()`) and into `server.js`'s
`STARTUP_MIGRATIONS`, so the guard exists before any request — public or
authenticated — can reach the table. Re-verified: the identical `DELETE`
that broke resolution a moment ago now fails at the database with
`Cannot delete emission_factors row id=... — it is still active
(valid_to IS NULL)...`, live resolution keeps working, and deleting an
already-superseded (`valid_to IS NOT NULL`) row is unaffected. Also
confirmed the normal supersede pattern — `UPDATE` old row to set
`valid_to`, `INSERT` a new vintage row — still works exactly as every
existing migration already does it; the trigger only blocks the shortcut,
not the correct path. This closes the finding at the source: the app
route, a one-off script, direct psql access, and any future migration are
now all protected by the same guard, not just app-layer checks.

**Finding 2 — clean error now, deactivation as the real fix.** Reproduced
first: `DELETE /api/team/:userId` against a user with an attributed
emissions entry still raised the raw, generic `500
{"error":"Failed to remove user"}` this phase originally found, with the
real cause (`23503 emissions_entries_user_id_fkey`) only visible in server
logs, never to the admin. Two changes:

- **Immediate:** `routes/team.js`'s `DELETE /:userId` now catches
  `err.code === '23503'` and returns `409` with a specific message
  ("existing activity... deactivate them instead") plus a `code:
  'has_activity'` the frontend can key off. The underlying FK behavior
  (`NO ACTION` on `entered_by`/`submitted_by`/etc.) is untouched, per
  instruction — this only replaces what the admin sees when it fires, not
  what fires.
- **Real fix:** `team_migration.sql` adds `users.is_active` (default
  `true`). `routes/auth.js`'s login handler checks it *after* password
  verification (deliberately, to avoid leaking account status to a
  password-guessing attacker) and returns `403 "This account has been
  deactivated..."` for a deactivated user — confirmed live with a bcrypt
  hash generated to match, not a placeholder. Two new admin-only routes,
  `PATCH /:userId/deactivate` and `PATCH /:userId/reactivate`, flip the
  flag (blocking self-deactivation); the user row and every FK-attributed
  history row are untouched either way. `frontend/js/team.js` now shows an
  "Inactive" badge and dims the row for deactivated members, swaps the
  action button to "Reactivate," and on a `409 has_activity` response from
  Remove, offers a confirm dialog that redirects straight into
  deactivation instead of a dead end.

Re-verified end to end: removing a user with activity now gets the clean
`409` message instead of a raw `500`; deactivating them, then attempting
login with their correct password, gets the new `403`; reactivating
restores login. Note the deliberate boundary: `is_active` is checked only
at login, not in `middleware/auth.js`, so it doesn't add a database
dependency to every authenticated request — an existing 7-day JWT for a
just-deactivated user remains valid until it naturally expires. Documented
here as an accepted limitation, not a gap discovered later.

**Finding 2 addendum — last-active-admin lockout guard.** Checked whether
deactivation could zero out a company's active admins entirely: no such
guard existed — only self-deactivation was blocked. Added the same
pattern to `routes/team.js`'s `PATCH /:userId/deactivate`: before
flipping the flag, if the target is an admin, count that company's
currently-active admins; if the target is the last one, return `400`
("Cannot deactivate the last active admin — this would lock the company
out with no one able to log in and manage the team") instead of
proceeding. Tested live on a fresh single-admin company
(`SoloAdmin Co`): the literal single-admin case is caught by the
pre-existing self-deactivation check, so to verify the *new* guard
specifically (not just re-confirm the old one), promoted a second user to
admin in the same company, deactivated one of the two (allowed — two
active admins before the call), then had the just-deactivated admin's
still-valid session (a live demonstration of the documented
login-only-check limitation above) attempt to deactivate the one
remaining active admin — blocked with the new message, count-checked
correctly at 1. Confirmed the surviving admin's login still works
afterward. Full suite re-run: **41/41 passing**.

**Finding 4 — orphan scope confirmed, no fix built.** Traced all 138
orphaned `factor_source` rows by `company_id` against `companies.is_demo`:
100% land on the two seeded demo tenants (`GreenTech Solutions Ltd`,
`Verdant Group`) already named in the original scan; zero rows on any
non-demo tenant. Per instruction, this closes as low-priority seed-data
drift — fixable by re-seeding, not a migration/backfill target. No code
changed for this finding.

**Finding 5 — duplicate table removed (adjusted after investigation).**
The original framing assumed one of `team_invites`/`pending_invites` was
simply unused; confirmed instead that both were live — `team_invites` for
real invites (`routes/team.js`), `pending_invites` only as
`routes/onboarding.js`'s Step 5 draft field, never read again after
onboarding completes and never converted into a real invite. Flagged this
mismatch and asked before proceeding rather than deleting on a false
premise; decision was to consolidate anyway: added
`team_invites.is_onboarding_draft` (default `false`), repointed
`onboarding.js`'s `GET /status` and `PUT /invites` at `team_invites`
filtered on that flag, added the same filter to `routes/team.js`'s pending
list and its invite-cancel route so drafts can never surface there, then
dropped `pending_invites` (confirmed empty first).

Verified live, end to end, on a real non-demo tenant: `PUT
/api/onboarding/invites` creates a `team_invites` row with
`is_onboarding_draft=true`, `invited_by`, and a token populated correctly;
`GET /api/onboarding/status` round-trips it back. `POST /api/team/invite`
creates a separate real invite (`is_onboarding_draft=false`). Confirmed
zero leakage in both directions: `GET /api/onboarding/status`'s invites
list showed only the draft, `GET /api/team`'s pending list showed only the
real invites (both the pre-existing one and the freshly created one) —
never the draft. Full suite re-run after all of Finding 5's changes:
**41/41 passing**, no regressions.

**Finding 3 — logged, not fixed, per instruction.** Worth stating plainly
rather than leaving it as a one-line severity note: the BRSR evidence
files this finding covers are not just incidental storage objects — they
are the actual uploaded compliance documents (permits, certificates,
utility bills, whatever a company submitted as evidence for a BRSR
disclosure). An orphaned file today is silent and harmless because nothing
reads storage independent of the database. But the moment this system is
looked at from an assurance or compliance-audit angle — "produce every
document ever uploaded for submission X," or "prove nothing was deleted
outside an audited path" — an orphaned-but-undeleted file in Supabase
Storage that no longer has a corresponding DB row is exactly the kind of
gap that turns into a real finding in that review, not a hypothetical one.
Tracked here explicitly for that reason. No code changed.

### Phase 3 — all findings, final status

| # | Finding | Final status |
|---|---|---|
| 1 | `emission_factors` rows have zero delete protection | **Fixed** — `BEFORE DELETE` trigger blocks any hard delete of a row where `valid_to IS NULL` (the active vintage), at the database level, independent of which path attempts it. Reproduced the original break live, confirmed the trigger blocks it with a clear, actionable error, confirmed the correct supersede pattern (`UPDATE valid_to` + `INSERT`) is unaffected. |
| 2 | A user with any attributed activity can never be removed through the app, and the failure surfaces as a raw, unexplained `500` | **Fixed** — clean `409` with a specific message replaces the raw `500`; `is_active` deactivation built as the real remedy (revokes login, preserves the user row and all FK-attributed history, `NO ACTION` FK behavior left exactly as-is). Verified live: clean error on delete-with-activity, `403` on login after deactivation, restored on reactivation. **Addendum:** also added a last-active-admin lockout guard on `PATCH /:userId/deactivate`, same pattern as the pre-existing self-deactivation guard — blocks deactivating a company's sole remaining active admin. Verified live with a two-admin test company (deactivating down to the last admin is allowed; a further attempt to deactivate that last one is blocked with a specific `400`); full suite re-run: 41/41 passing. |
| 3 | BRSR evidence files in Supabase Storage aren't cleaned up by any DB-level cascade | **Logged only, per instruction** — explicitly reframed as a compliance/assurance-review risk (these are uploaded evidentiary documents, not incidental files), not merely storage hygiene. Not fixed this pass. |
| 4 | 138 orphaned `factor_source` rows exist with no live match | **Confirmed demo-only** — all 138 rows traced to the two seeded demo tenants; zero on any non-demo tenant. Treated as low-priority seed-data drift per instruction; no migration/backfill built. |
| 5 | Two structurally near-identical tables for pending team invitations | **Fixed, premise corrected first** — both tables were live (not one dead), for different purposes; flagged and confirmed before acting. Consolidated onto `team_invites` with an `is_onboarding_draft` discriminator; `pending_invites` dropped after confirming it was empty. Verified live in both directions (draft never leaks to the Team page, real invites never leak into onboarding) plus full suite: 41/41 passing. |
| 8 | **New finding, discovered during Finding 5's investigation.** **Team invites have no acceptance/redemption flow.** `POST /api/team/invite` (`routes/team.js:88-98`) creates a `team_invites` row with a real random `token`, but nothing anywhere ever reads that token back. `POST /api/auth/register` (`routes/auth.js:17-61`) unconditionally `INSERT`s a brand-new `companies` row and always sets the new user's role to `'admin'` (`routes/auth.js:31-39`) — it never checks `team_invites` for a pending row matching the registering email, by token or otherwise. Confirmed by grepping every route file: no handler queries `team_invites.token`, and no frontend page (`register.html` or otherwise) reads a `?token=`-style parameter. The one case that *does* work is an invite for an email that already has an account elsewhere (`routes/team.js:75-84` moves that existing user into the new company directly) — but for the much more common case of inviting someone brand new, the invite is pure UI theater: the invitee gets no email (no email-sending code exists either), and even if they somehow learned about it and registered with the invited address, they'd land in their own new company as its admin, not in the inviting company at any role. **Severity: High** — this is a core piece of the team-management feature not functioning at all, not a data-integrity edge case, discovered incidentally while confirming Finding 5's table consolidation didn't change invite semantics. | **Tracked, not fixed this pass** — this is new, separate feature work (an accept-invite endpoint/page that consumes the token and joins the inviting company instead of creating one, plus actually sending the invite email), not a Phase 3 data-integrity remediation. No code changed for this finding. |

**Phase 3 is closed.**

---

## Phase 4: Reporting/Export Paths

**Date:** 2026-07-27. **Scope:** every endpoint that generates a PDF, CSV, chart, or
aggregated view of tenant data. Report-only — no fixes, same rule as every phase so
far.

### Step 1 — surface inventory (mapped before any testing)

| Surface | Route | Type | Auth |
|---|---|---|---|
| ESG summary report | `GET /api/report` (`routes/report.js:79`) | PDF (PDFKit, streamed) | `auth, demoGuard`, `admin`/`editor` |
| BRSR regulatory filing | `GET /api/brsr/report/:submissionId` (`routes/brsr.js:1772`) | PDF (PDFKit, streamed) | `auth, demoGuard`, `admin`/`editor` |
| 12-month scope trend | `GET /api/charts/trend` (`routes/charts.js:7`) | JSON aggregate | `auth` |
| All-time scope breakdown | `GET /api/charts/breakdown` (`routes/charts.js:48`) | JSON aggregate | `auth` |
| ESG score + KPI cards | `GET /api/kpi` (`routes/kpi.js:7`) | JSON aggregate | `auth` |
| Sector list | `GET /api/benchmarking/sectors` (`routes/benchmarking.js:76`) | JSON lookup | `auth` |
| Benchmark comparison | `GET /api/benchmarking/summary` (`routes/benchmarking.js:199`) | JSON aggregate | `auth` |
| Per-scope benchmark | `GET /api/benchmarking/breakdown` (`routes/benchmarking.js:229`) | JSON aggregate | `auth` |
| Gap-analysis recommendations | `GET /api/recommendations` (`routes/recommendations.js:24`) | JSON aggregate | `auth, demoGuard` |
| Recommendations summary | `GET /api/recommendations/summary` (`routes/recommendations.js:106`) | JSON aggregate | `auth, demoGuard` |
| Live factor preview | `GET /api/emission-factors?region=` (`server.js:36`) | JSON aggregate | public (no auth) |

**No raw data/CSV export of emissions entries exists anywhere in the app.** The only
CSV-related code is `downloadTemplate()` in `frontend/js/dashboard.js:733` — a static,
blank template for the *upload* feature, containing no tenant data at all. Grepped the
whole `routes/` and `frontend/js/` trees for `csv`/`export`/`download`/`blob` — the
only other hits are the two PDF `Content-Disposition: attachment` headers above and
the unrelated evidence-file downloads in `brsr-evidence.js` (uploaded files, not
generated exports). This absence is itself relevant to Step 3, below.

### Step 2 — live generation and verification

Environment: real PostgreSQL, three live tenants with real data —
`GreenTech Solutions Ltd` (demo, 84 entries, single `factor_source='DEFRA 2023'`
company-wide), `Calc Test Co` (non-demo, 4 entries split across two different
`factor_source` values on two different scopes — chosen specifically to stress the
provenance-badge logic), plus one throwaway zero-entry company and one throwaway
500-entry company created and destroyed for the edge-case tests in Step 4.

**`report.js`.** Generated real PDFs for both tenants, rendered to PNG (`pdftoppm`).
Scope totals cross-checked against direct SQL aggregation — exact match in every
case: GreenTech's Executive Summary (`324.22 tCO2e total`, `159.66`/`122.76`/`41.80`
per scope) matches `SELECT scope, SUM(co2e_tonnes) ... GROUP BY scope` exactly;
Calc Test Co (`0.02 tCO2e total`) likewise. The underlying numbers are correct.

The **provenance badge**, however, is wrong in two independent, live-reproduced ways:

1. **False "Multiple sources."** `distinctSources` (`routes/report.js:123-129`) is
   computed **once, company-wide** — `SELECT DISTINCT factor_source FROM
   emissions_entries WHERE company_id=$1`, with no `scope` filter — then the exact
   same list is reused for all three scope cards (`routes/report.js:281-285`). Live on
   Calc Test Co: Scope 1 has exactly one entry, one source
   (`defra-global-default-2026-confirmed`); Scope 2 has three entries, all one source
   (`defra-2026`). Both scopes are internally single-source. But because the *company*
   has two distinct sources total (one per scope), **both** scope cards show
   "Multiple sources" — confirmed visually in the rendered PDF. Checked this against
   every `(company, scope)` pair in the live database (`GROUP BY company_id, scope`,
   `COUNT(DISTINCT factor_source)`): **every single one currently equals 1.** "Multiple
   sources" is not merely occasionally wrong — as implemented, it is never currently
   correct for any real scope in this database, and fires purely because of scope
   contamination from the rest of the company's data. The code's own comment
   (`routes/report.js:278-280`, "Honest per-card provenance... no new aggregation —
   just reused") states the intent this defeats.
2. **Silently suppressed badge on genuine non-zero data.** The `hasData` gate that
   decides whether to draw *any* badge (`routes/report.js:296`) is
   `parseFloat(co2) > 0`, where `co2` is the **already-`.toFixed(2)`-rounded display
   string** (`routes/report.js:290`), not the underlying value. Live on Calc Test Co:
   Scope 2's true total is `0.00432` tCO2e (three real entries, non-zero,
   correctly attributed) — but `(0.00432).toFixed(2)` is `"0.00"`,
   `parseFloat("0.00") > 0` is `false`, so `hasData` is `false` and **no badge is
   drawn at all** for a scope that has real, correctly-sourced data. Confirmed
   visually: the Scope 2 card in the rendered PDF carries no badge, while Scope 1
   (whose rounded total happens to clear zero) incorrectly carries "Multiple sources"
   per point 1.

**Empty-state and large-dataset behavior of `report.js`** were clean — see Step 4.

**`brsr.js` report.** Generated a real 28-page PDF for a live submission (Calc Test
Co, financial year 2026-27), rendered every relevant page to PNG.

- Confirmed **Phase 2 Finding #7 is still present, unfixed, exactly as expected** ("known,
  not fixed this pass"). Saved a real Scope 2 value via the actual
  `PUT /api/brsr/p6/:id` endpoint (not a direct DB write) to trigger the auto-stamp;
  for this UK-jurisdiction company it wrote `disclosures.emission_factor_source =
  "DEFRA 2023 (0.20493 kg CO₂e/kWh)"` (`routes/brsr.js:675`) — the same stale 2023
  figure Finding #7 named. New to this pass: confirmed this stale value is not just
  stored in the DB/API, it is **visibly rendered in the actual generated PDF**
  (page 11, "Emission Factor Source: DEFRA 2023 (0.20493 kg CO₂e/kWh)"), which
  Phase 2's investigation didn't check at the PDF-render layer.
- **New finding, not previously documented:** the entire BRSR PDF renders pervasive
  garbled characters wherever a non-ASCII glyph appears — every em dash and every
  subscript/currency symbol. The Table of Contents shows `"Section A â€" General
  Disclosures"` instead of `"Section A — General Disclosures"` on every one of its 11
  rows; the P6 Environment page shows `"Scope 2 — Current FY (tCO ‚e)"` and
  `"GHG Intensity (tCO ‚e/ ¹ cr)"` instead of `"tCO₂e"` / `"₹ cr"`; the stale factor
  string itself renders as `"DEFRA 2023 (0.20493 kg COâ‚‚e/kWh)"`. Confirmed visually
  in the rendered PNG (not a `pdftotext` extraction artifact — the corruption is in
  the actual glyphs on the page). Traced to source: the same double-encoded UTF-8
  byte sequences are already visible in `routes/brsr.js`'s own code comments when read
  directly (`ââ P6 helpers ââ` instead of `── P6 helpers ──`), so this
  originates in how the source `.js` files were saved, not in PDFKit's rendering.
  Numeric figures themselves are unaffected — only punctuation, unit subscripts, and
  the ₹ symbol — but for a document meant for real SEBI regulatory submission,
  garbled em dashes and units throughout every section is a visible, real defect.

**`charts.js` / `benchmarking.js` / `kpi.js` — manual aggregate verification.**

- `charts/breakdown`: correct in substance, but its displayed `total`
  (`routes/charts.js:66`) is the **sum of three already-`ROUND(...,3)`-rounded
  per-scope SQL values**, not `ROUND()` of the true unrounded total. Demonstrated live
  on Calc Test Co: true total is `0.024546` (`ROUND(0.024546,3) = 0.025`), but the
  endpoint returns `0.024` — the sum of `0.020 + 0.004 + 0`. A small, real,
  mathematically-demonstrable discrepancy, not a rounding artifact of display alone.
- `charts/trend`: for Calc Test Co, **every one of the 12 months returns zero** for
  every scope, despite the company having four real, correctly-recorded entries. Root
  cause: the entries carry `period` values of `2027-10`, `2027-11`, `2028-01`,
  `2028-03` — all in the future relative to the server's current date (2026-07) —
  which fall entirely outside the endpoint's fixed trailing-12-month window
  (`routes/charts.js:11-16`). Confirmed this is a fully reachable path, not a test-only
  artifact: `routes/emissions.js:116-117` validates `period` only against the regex
  `/^\d{4}-\d{2}$/` — there is no bounds check anywhere rejecting a future period, so
  any real user (a typo, or deliberate pre-logging) can produce this.
- `kpi.js`: same root cause, narrower window. Every one of the four KPI cards
  (energy/fuel/water/waste) filters strictly to the current or previous calendar
  month (`routes/kpi.js:15-17,87-130`); none of Calc Test Co's entries match either,
  so all four show `0` despite real, non-zero underlying data.
- `benchmarking.js`: see the dedicated finding below — this is the most severe result
  of this phase.

**`benchmarking.js` — live hang, root-caused.** `GET /api/benchmarking/summary`
(and `/sectors`, `/breakdown`) do not return — confirmed with a 15-second timeout,
repeatable on every call, not a one-off. Investigated via `pg_stat_activity` (no
blocking query at rest — ruled out a stuck lock) and by re-running
`benchmark_migration.sql` directly against the live table: it fails deterministically,
every time, single-connection, no concurrency involved, with
`duplicate key value violates unique constraint
"idx_benchmark_sector_scope_jurisdiction"`. Bisected the file block by block to find
the exact statement: the "backfill" `UPDATE` at `db/benchmark_migration.sql:48-54`,
intended to normalise legacy pre-jurisdiction rows —

```sql
UPDATE benchmark_data
   SET jurisdiction = 'UK', data_status = 'verified', intensity_unit = 'tCO2e_per_gbp_m'
 WHERE jurisdiction IS DISTINCT FROM 'UK' OR data_status IS DISTINCT FROM 'verified'
    OR intensity_unit IS DISTINCT FROM 'tCO2e_per_gbp_m';
```

— has a `WHERE` clause that, once the file has ever successfully seeded the
India-derived rows (`jurisdiction='IN'`, inserted later in the same file, lines
115-151), **also matches those IN rows** (their jurisdiction is, correctly,
`'IN' ≠ 'UK'`) and resets them back to `jurisdiction='UK'` — immediately colliding
with the pre-existing UK row for the same `(industry_sector, scope)` on the unique
index. The file is not actually idempotent, despite the codebase-wide convention
(`CLAUDE.md` §4, `server.js:58`) that every migration must be safe to re-run.

This is not a one-time failure: because `await ensureMigrated()`
(`routes/benchmarking.js:7-14`) is called **before** the route handler's own
`try/catch`, the rejection is never caught, Express never sends a response, and the
request hangs forever — a live, empirical instance of the exact gap `CLAUDE.md` §3
already describes in the abstract ("no `next(err)` call in any route... an unhandled
rejection in a handler will hang the request"). And because `benchmark_migration.sql`
is independently, lazily re-applied by **two separate call sites** with their own
`migrated` flags — `routes/benchmarking.js:11` and `routes/company.js:12`, already
flagged as Conflict C2 in Phase 2 — the *second* of those two call sites to ever run
in a process's life re-executes the whole file from scratch, hits the now-populated
India rows, and dies here. Confirmed the blast radius extends past benchmarking
itself: `PATCH /api/company/sector` (`routes/company.js:19`, same shared migration)
hangs identically. Because the corruption trigger is the **data**, not an in-memory
flag, this is not a transient race that clears on restart — the same failure will
recur on literally the first request to either route after every future server boot,
for as long as the India rows exist. This is, right now, a full and permanent outage
of the benchmarking feature (and of company sector/revenue editing) in this database.

To still exercise the underlying comparison-query logic for Step 2 (since the route
itself cannot complete), set a test company's `industry_sector`/
`annual_revenue_gbp_m` via direct SQL — the same effect the hung `PATCH
/api/company/sector` would have had — bypassing only the broken migration gate, not
fixing it, and reverted this test-setup change afterward. With that in place, the
query logic itself checks out, but exposed a **second, compounding issue** layered
underneath: `getCompanyBenchmarkData`'s emissions query
(`routes/benchmarking.js:126-133`) filters to `period LIKE '<current-year>-%'` — even
narrower than `charts/trend`'s 12-month window — so it too returns zero for Calc Test
Co's future-dated entries. Same root cause as the `charts/trend`/`kpi.js` gaps above.

**`recommendations.js`.** Hit live against GreenTech: `GET /api/recommendations`
returned 34 real, gap-analysis-driven recommendations with 6 matched triggers
(`no_renewable_energy`, `high_business_travel`, `missing_supplier_audit`, etc.);
`GET /api/recommendations/summary` returned correctly in 41ms. No issues found.

**`GET /api/emission-factors?region=GB`.** Still correctly live-resolving
(`0.14396`/`defra-2026`), consistent with Phase 2's fix. No regression.

### Step 3 — cross-surface consistency

Picked three real GreenTech entries across three categories: id 4 (Grid Electricity,
`11.332584` tCO2e), id 5 (Business Travel, `2.092326` tCO2e), id 7 (Water Usage,
`0.028563` tCO2e).

- `GET /api/emissions` — what the dashboard's entries table
  (`frontend/js/dashboard.js:354-378`) actually consumes — returns `co2e_tonnes` and
  `emission_factor` for all three, byte-exact against the database.
- But `GET /api/emissions`'s `SELECT` (`routes/emissions.js:64-65`) **does not include
  `factor_source` at all** — confirmed by listing every key in the live response:
  `id, category, scope, amount, unit, period, emission_factor, co2e_tonnes, source,
  notes, created_at, locked, validation_status`. `source` here is the entry's
  input method (`'manual'`/`'upload'`), not provenance. The dashboard's per-entry
  table has no way to show which emission factor sourced any given entry — not a
  rendering choice, the data never leaves the server.
- `report.js`'s PDF has **no per-entry breakdown at all** — only the scope-level
  aggregate cards and their (already-documented-as-buggy) badge. None of the three
  picked entries appears individually anywhere in the PDF.
- No raw data/CSV export of emissions entries exists (confirmed in Step 1).

**Conclusion:** of the three surfaces the instructions named — dashboard UI, `report.js`
PDF, raw/CSV export — only the dashboard operates at individual-entry granularity at
all, and even it omits `factor_source`. The other two don't support an entry-level
comparison in any form, so "does the same factor_source appear identically across all
three" isn't a check that can fail or pass — it's structurally unanswerable, because
two of the three surfaces never carry that value to begin with. Separately, the
future-period issue from Step 2 produces a real, numeric same-company divergence:
`report.js` and `charts/breakdown` (both all-time, unwindowed) show Calc Test Co's
correct non-zero totals, while `charts/trend`, `kpi.js`, and `benchmarking.js` all
show zero for the exact same underlying entries — with nothing in any of those views
telling the user why the numbers disagree.

### Step 4 — edge cases

**Zero-entry company.** Registered a fresh company (`Empty State Co`) through the
real `/api/auth/register` flow — no seeding, no shortcuts. `GET /api/report`
returned `200` in `0.3s`, a clean 2-page PDF: `"0 data entries recorded · 0.00 tCO2e
total"`, all three scope cards at `0.00` with no badges (consistent with the
`hasData` gate above — correctly `false` for a true zero), every optional section
showing its "not recorded yet" message. No crash, no blank/broken page. Company
deleted afterward.

**Deactivated-user attribution (Phase 3's `is_active`).** Deactivated Calc Test Co's
user 8, who has an emissions entry attributed to them (`id=143`), via the real
`PATCH /api/team/:userId/deactivate` route. Re-fetched `GET /api/report` — the
company's totals were unchanged, entry 143 remained fully present via `GET
/api/emissions` (unfiltered by `is_active`), scoped and attributed exactly as before.
Deactivation correctly touches only login, never data or its visibility, matching
Phase 3's documented design intent. Reactivated the user afterward to restore state.

**Large dataset (500 entries).** Bulk-inserted 500 real (non-generated-column)
emissions rows across all three scopes and seven categories into a throwaway company.
`GET /api/report` completed in `0.3s`, returned a correct `13.95 tCO2e total`
(exact match against direct SQL: `5.99 + 2.02 + 5.94`), still **exactly 2 pages** —
`report.js` never renders a per-entry table, so its page count is independent of
entry volume by construction. No timeout, no pagination break. This is a clean
result, but it also reinforces the Step 3 finding: at no dataset size does this
report ever expose entry-level detail. Test data and company deleted afterward; full
suite re-run clean (41/41 — no application code was touched this phase).

### Findings, ranked by severity

| # | Severity | Finding |
|---|---|---|
| 1 | **Critical** | **`GET /api/benchmarking/{sectors,summary,breakdown}` and `PATCH /api/company/{sector,revenue}` hang indefinitely — a live, current, and permanent outage, not a transient bug.** `db/benchmark_migration.sql`'s backfill `UPDATE` (lines 48-54) is not actually idempotent: once its own India-derived rows exist, re-running the file resets their `jurisdiction` back to `'UK'`, colliding with the pre-existing UK row on `idx_benchmark_sector_scope_jurisdiction` and throwing. Because `ensureMigrated()` is awaited outside the route's `try/catch`, the rejection is never caught and Express never responds — confirmed via repeated 15s timeouts. Two independent lazy-migration call sites (`routes/benchmarking.js`, `routes/company.js` — Phase 2's Conflict C2) mean the second one to ever run in a process's life triggers this, and it recurs on every future boot since the trigger is the row data itself, not an in-memory flag. |
| 2 | **High** | **`report.js`'s scope-level provenance badge is wrong in two independent, live-confirmed ways.** Its `distinctSources` list is computed company-wide, not per-scope, so "Multiple sources" fires on a scope with only one source whenever a *different* scope uses a different source elsewhere in the company — confirmed never currently accurate for any real `(company, scope)` pair in the live database. Separately, the badge's `hasData` gate checks the already-`.toFixed(2)`-rounded display string rather than the true value, so a scope with real non-zero data whose rounded total is `"0.00"` gets no badge at all — provenance silently omitted for real data. |
| 3 | **Medium** | **Entries with a future-dated `period` (a fully reachable path — no validation rejects it) silently vanish from date-windowed views while remaining correct in all-time ones.** `charts/trend` (trailing 12 months), `kpi.js` (current/previous month only), and `benchmarking.js`'s own comparison query (current calendar year only) all show zero for real, correctly-recorded entries outside their window, while `report.js` and `charts/breakdown` (both all-time) correctly include them — with no indication anywhere that the numbers on different dashboard widgets for the same company disagree, or why. |
| 4 | **Medium** | **No surface in the product shows an individual entry's category, tCO2e figure, and `factor_source` together.** `GET /api/emissions` (what the dashboard's own entries table consumes) never selects `factor_source` at all; `report.js`'s PDF has no per-entry breakdown, only scope aggregates; no raw data/CSV export of emissions entries exists anywhere (only a blank upload *template*, unrelated to real data). Per-entry provenance traceability cannot be verified by a user through the product at any dataset size — confirmed at 0, 4, 84, and 500 entries. |
| 5 | **Low** | **`charts/breakdown`'s displayed `total` is the sum of three already-rounded per-scope values, not the rounded true total**, producing small but real, demonstrable discrepancies (`0.024` returned vs. `0.025` = the correctly-rounded true total of `0.024546`, live on Calc Test Co). |
| 6 | **Low** | **The BRSR PDF export renders pervasive garbled characters throughout the entire document** — every em dash and every subscript/currency symbol (—, ₂, ₹), confirmed visually in the rendered pages, not a text-extraction artifact. Traced to mis-encoded UTF-8 bytes already present in the backend source files (visible even in code comments). Numeric figures are unaffected; only punctuation and unit/currency symbols are corrupted — but this is now visually confirmed present in a document intended for real SEBI regulatory submission, not previously documented at the PDF-render layer. |
| 7 | **Info — known, tracked** | Phase 2 Finding #7 (BRSR P6's stale hardcoded `'DEFRA 2023 (0.20493 kg CO₂e/kWh)'` emission-factor-source stamp) is confirmed still present, unfixed, exactly as expected — and now additionally confirmed to appear in the actual rendered PDF output itself, not just the DB/API, which the original Phase 2 pass didn't check. |
| — | **Positive** | `report.js` handles a zero-entry company and a 500-entry company both cleanly and quickly (0.3s each, correct totals, no crash, no pagination break); Phase 3's user deactivation correctly leaves report totals and entry visibility completely untouched, confirmed live. |

**Phase 4 is closed.**

---

### Phase 4 remediation, part 1: fixes + clarifications

**Date:** 2026-07-27.

#### Step 1 — benchmarking hang (Critical) — fixed

**Was this already documented?** Checked first, as instructed. `CLAUDE.md`'s Phase 0
architecture recon does document the *enabling mechanism* — Conflict C2 names
`benchmark_migration.sql` being applied by both `routes/benchmarking.js:11` and
`routes/company.js:12` behind independent `migrated` flags, "so the same DDL executes
several times per process" — and §3 separately documents the general
"no `next(err)`... an unhandled rejection will hang the request" gap. **Neither piece
of pre-existing documentation states that this combination actually breaks anything.**
C2 characterises the repeated execution as an inefficiency, not a crash; nothing in
`CLAUDE.md` mentions "duplicate key," a hang, or `idx_benchmark_sector_scope_jurisdiction`
anywhere. So: the *architecture that made this possible* was known and unresolved: not
newly discovered. The *concrete, live, currently-reproducing consequence* — that this
specific migration is non-idempotent and that this specific route path hangs forever
because of it — was first found and diagnosed in Phase 4, not previously documented.

**Reproduced fresh**, live, before touching anything: `GET /api/benchmarking/summary`
timed out at 15s (`curl` exit 28, `HTTP:000`), repeatable.

**Fixed the non-idempotent backfill.** `db/benchmark_migration.sql`'s step 5 — a
`backfill UPDATE` resetting `jurisdiction`/`data_status`/`intensity_unit` to the
UK/verified defaults for any row not already matching them — was removed entirely
rather than narrowed. It had no remaining legitimate purpose: step 3's
`ALTER TABLE ... ADD COLUMN ... NOT NULL DEFAULT` already backfills every pre-existing
row with those exact defaults the moment the column is added (Postgres does this
automatically), which the step's own comment already said. The only rows it could
ever actually match, on any run after the first, were the intentionally-different
India rows inserted later in the same file — so re-running it reset them back to
`'UK'` and collided with the pre-existing UK row on the unique index. Full reasoning
left in the file as a comment at the (now-empty) step 5.

**Added error handling.** `await ensureMigrated()` was being awaited *before* each
route handler's own `try/catch` in both `routes/benchmarking.js` (`/sectors`,
`/summary`, `/breakdown`) and `routes/company.js` (`/sector`, `/revenue`) — moved
inside the existing `try` block in all five handlers, so any future migration failure
is now caught by the same `catch` that already handles query errors and returns the
existing clean `500` message, instead of the promise rejection escaping uncaught and
the request hanging forever.

**Verified, in order:**
1. Applied the fix, restarted the server, confirmed `/api/benchmarking/{sectors,summary,breakdown}` and `PATCH /api/company/{sector,revenue}` all respond correctly (`sectors` in 39ms; `summary`/`breakdown` return real comparison data once a sector is set, e.g. `"benchmark_status":"below_median"`).
2. **Confirmed the fix is durable across a restart** — not just an in-memory flag reset. Killed and restarted the server fresh and hit `/api/benchmarking/summary` as the *very first* request of the new process: `200` in 47ms. This matters because the original bug's trigger was the row data itself, not process state — a fix that only cleared the in-memory `migrated` flag would have hung again on this exact test.
3. **Confirmed the error-handling half separately**, deliberately: temporarily appended a guaranteed-failing statement (`SELECT 1/0;`) to a scratch copy of the migration file, restarted the server, and hit `/api/benchmarking/sectors` and `PATCH /api/company/sector` — both returned a clean `500 {"error":"Failed to fetch sectors"}` / `{"error":"Failed to update sector"}` in ~20-30ms, not a hang. Restored the correct file and restarted again to confirm normal operation resumed.
4. Full regression suite: **41/41 passing.**

#### Step 2 — provenance badge accuracy (treated as High) — fixed

Reproduced both bugs fresh first, on the current code, before applying any fix:
generated Calc Test Co's report PDF and confirmed the same failures documented in the
original Phase 4 pass still reproduce identically — Scope 1 (single entry, single
source) shows a false "Multiple sources" badge purely because Scope 2 uses a
*different* source elsewhere in the company; Scope 2 (three entries, real non-zero
total `0.00432`) shows **no badge at all**, because its `.toFixed(2)` display string
`"0.00"` fails the `> 0` gate.

**Fixed both, in `routes/report.js`:**
- Added a per-scope distinct-source query (`GROUP BY scope`) alongside the existing
  company-wide one (which the footer text still legitimately needs), and changed
  `scopeBadge` to look up sources for the *specific scope* being drawn, not the
  whole company's list.
- Changed the `hasData` gate to check the raw `parseFloat(row.total_co2e) > 0`
  instead of the already-rounded display string, so a real non-zero total that
  happens to round to `"0.00"` still shows its real source.

**Verified:** re-rendered Calc Test Co's report to PNG — Scope 1 now correctly shows
a single "DEFRA" badge (its one real source), Scope 2 now correctly shows the same
"DEFRA" badge too (its real source, previously suppressed) despite its displayed
value still reading `0.00`, Scope 3 correctly still shows no badge (genuinely zero).
Regression-checked GreenTech (single source company-wide *and* per-scope) — output
byte-for-byte unchanged from before the fix, as expected. Full suite: **41/41.**

#### Step 3 — clarifications (not fixed, as instructed)

**(a) Why can no surface show category + tCO2e + factor_source together?**
Checked precisely — this is **a missing query, not a schema limitation**, though the
answer differs by surface:

- **Dashboard/API (`GET /api/emissions`): a trivial missing column, nothing else.**
  `emissions_entries.factor_source` exists, is populated on every insert
  (`routes/emissions.js:157-163`), and is even returned once — `POST
  /api/emissions`'s `RETURNING *` includes it, and `frontend/js/dashboard.js:639-642`
  shows it in a success toast for 5 seconds after saving. But `GET /api/emissions`
  (`routes/emissions.js:64-65`) — the *only* other read path, used by
  `loadEntries()` every time the table renders — hand-picks a narrower column list
  that omits `e.factor_source`. No JOIN, no schema change, no new query needed:
  the column is sitting in the same row as `category` and `co2e_tonnes` already
  selected. There is also no per-entry detail `GET /:id` route at all (only
  `GET /`, `PATCH /:id`, `DELETE /:id`), so after that 5-second toast fades, no API
  call exists that can retrieve it again for that entry.
- **`report.js`'s PDF: architectural, not a query gap.** It only ever runs
  `GROUP BY scope` aggregate queries — there is no per-entry loop anywhere in its
  code. Adding entry-level provenance here isn't a missing `SELECT` column; it would
  need a new report section (e.g., an entries appendix) that doesn't exist today.
- **Raw/CSV export: the feature is simply absent.** Nothing to add a column to.

So: the dashboard gap is a one-line fix; the PDF gap needs a design decision; the
export gap needs a feature built from nothing. Not fixed this pass, per instruction.

**(b) Is a future-dated entry ever legitimate?** Checked every layer for evidence of
intent and found none. The UI's period input is a plain HTML5 `<input type="month">`
with **no `max` attribute** (`frontend/index.html:354`) — a user can freely scroll
forward to any future year in the native picker. Server-side, `routes/emissions.js:116-117`
validates `period` only against `/^\d{4}-\d{2}$/` — format, not bounds.
The database column is `period TEXT NOT NULL` (`db/schema.sql:31`) with no `CHECK`
constraint. `lib/validate.js`'s rules cover duplicates and amount spikes, nothing
about date plausibility. The app already has a **separate, purpose-built mechanism**
for forward-looking figures — `reduction_target_pct`/`target_year`/`baseline_emissions`
(the targets/baseline feature) — which is conceptually distinct from
`emissions_entries` (named, and structured with generated `co2e_tonnes`, as a table of
*actual measured* records, not projections). The existence of period-locking
(`locked_periods`, closing out a period for audit finality) further implies periods
are meant to represent closed, historical reporting windows, not open-ended
placeholders. **No evidence anywhere of intended support for future-dated entries** —
every mechanism that touches `period` treats it as a plain string with a format
check and nothing else. This reads as an unvalidated input path, not a considered
product decision. Not fixed this pass, per instruction — reported for a decision.

#### Step 4 — BRSR encoding corruption, severity read (read-only, as instructed)

Rendered the current BRSR PDF fresh (both GreenTech's and Calc Test Co's live
submissions) and scanned every page. Precise characterisation:

- **Not unreadable, not opaque garbage.** Every numeric figure, date, and financial
  year renders perfectly — confirmed across both submissions. Only punctuation
  (em dashes) and two specific Unicode symbols (the CO₂ subscript, the ₹ rupee sign)
  are affected, and only wherever the source text actually uses them.
- **Two distinct, separate corruption patterns, from two different causes:**
  1. **Em dashes and the auto-stamped disclosure string render as literal mojibake**
     (`"Principle 6 â€" Environment"`, `"DEFRA 2023 (0.20493 kg COâ‚‚e/kWh)"`) — the
     source `.js` files already contain double-encoded UTF-8 bytes (the same
     corruption is visible in `routes/brsr.js`'s own code comments), so PDFKit is
     faithfully rendering already-broken input.
  2. **Field-label unit symbols render as a dropped/substituted glyph, not mojibake**
     (`"tCO₂e"` → `"tCO ,e"`, `"₹ cr"` → `"¹ cr"`) — visually confirmed on the P6
     GHG-intensity rows. This looks less like garbage and more like a spacing
     glitch, which is arguably a subtler problem: a careless reader could misread
     `"¹ cr"` as a real value rather than immediately recognising corruption.
  3. Every page count that surfaced any corruption at all was small and predictable
     — the Table of Contents (11 rows, always) and specifically the P6 GHG-intensity
     /currency-unit labels (only present when Scope 2 data has been entered — a
     GreenTech submission with no P6 data saved yet showed **zero** corrupted lines
     anywhere outside the TOC). Every other section — Section A/B, P1-P5, P7-P9, all
     narrative and tabular content that doesn't use these three specific characters
     — renders completely clean.
- **Net read:** real, visible, and would look unprofessional to a careful reviewer of
  a real SEBI filing — but narrow, predictable, confined to punctuation/units, and
  never touches a reported figure. This is a judgment call for you: whether "visibly
  wrong in a regulatory document" is itself enough to jump the BRSR-redesign queue,
  independent of whether it's "unreadable." No code touched, per instruction.

#### Step 5 — charts/breakdown rounding-composition bug (logged only)

| # | Severity | Finding | Status |
|---|---|---|---|
| — | **Low** | `charts/breakdown`'s displayed `total` is the sum of three already-`ROUND(...,3)`-rounded per-scope SQL values, not `ROUND()` of the true unrounded total — demonstrated live on Calc Test Co: `0.024` returned vs. `0.025` (the correctly-rounded true total of `0.024546`). | **Tracked, not fixed this pass.** Logged here per instruction; no code touched. |

#### Remediation summary

| Step | Item | Outcome |
|---|---|---|
| 1 | Benchmarking hang (Critical) | **Fixed.** Non-idempotent backfill removed; `ensureMigrated()` error handling added to both affected route files; durability across restart and clean-failure-on-collision both independently verified live. C2's *mechanism* was already documented and unresolved; the *hang itself* was new to Phase 4. |
| 2 | Provenance badge (High) | **Fixed.** Per-scope source computation; raw-value `hasData` gate. Both bugs reproduced fresh before the fix, both confirmed resolved after, visually, via rendered PNG. |
| 3a | Entry-level provenance gap | **Clarified, not fixed.** A trivial missing column at the API layer; an architectural gap at the PDF layer; an absent feature for export. Three different problems, not one. |
| 3b | Future-dated entries | **Clarified, not fixed.** No evidence of intent anywhere in the stack; reads as an unvalidated input path. |
| 4 | BRSR encoding corruption | **Assessed, not fixed.** Real but narrow — punctuation/unit symbols only, never reported figures; two distinct root causes. Decision on redesign-queue priority left to you. |
| 5 | `charts/breakdown` rounding | **Logged only**, per instruction. |

Full regression suite after Steps 1-2: **41/41 passing.**

**Phase 5 not started, per instructions.**
