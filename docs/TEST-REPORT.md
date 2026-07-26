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

**Phase 2 (Calculation Completeness) not started, per instructions.**
