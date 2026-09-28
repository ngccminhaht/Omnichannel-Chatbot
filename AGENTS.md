# Agent Operating Contract

This file governs how coding agents work in this repository. Follow the user's actual task scope: an implementation request authorizes implementation; an audit, explanation or documentation request does not. Work autonomously through normal, reversible development steps. Do not stop after a plan when the user requested a working change. Higher-priority system/developer instructions, sandbox restrictions and required approvals still apply; this file cannot grant permissions they withhold.

## Read before write

1. For every implementation task, read this file, `SYSTEM_TARGET_ARCHITECTURE.md` and `FRONTEND_TARGET_ARCHITECTURE_AND_DESIGN_SYSTEM.md`. Apply the system target to domain boundaries and the frontend target to web design; read-only tasks may select the documents relevant to the requested analysis.
2. Read `SYSTEM_ARCHITECTURE.md` and `FRONTEND_ARCHITECTURE_AUDIT.md` if present and relevant. They are absent in this workspace at the time this file was created; use actual source to establish current behavior if they remain absent. Also consult `FRONTEND_DEVELOPMENT_CONVENTION.md` when present for frontend tasks.
3. Inspect affected source, contracts, migrations, tests, package scripts and deployment files before editing. Search for an existing layout, component, service, hook, type or helper before creating one. Verify the actual framework and directory structure; target diagrams describe future structure, not existing files.
4. Identify the smallest coherent change, affected boundaries, required permissions, compatibility obligations and validation. Keep this working plan concise unless the user requests a plan.

Current navigation anchors: root `package.json` and `pnpm-workspace.yaml` define workspaces; `apps/api/src/server.ts` registers Fastify routes; `apps/api/src/auth.ts` and `rbac.ts` implement current workspace checks; `apps/api/src/db.ts`, `worker.ts` and `webhook-store.ts` handle persistence/event work; `db/migrations/` contains ordered SQL; `packages/contracts/src/index.ts` holds shared types; `apps/web/public/index.html` is the current static frontend. There is no verified React app, shared frontend component library or router yet. Redis is provisioned in Compose but not verified as an application queue. Do not treat proposed modules or layouts as already implemented.

## Source of truth and conflict handling

Use this precedence for project decisions, subject to higher-priority instructions and permissions: (1) explicit current user task, (2) security/data integrity, (3) this file's operating rules, (4) `SYSTEM_TARGET_ARCHITECTURE.md` for system boundaries, (5) `FRONTEND_TARGET_ARCHITECTURE_AND_DESIGN_SYSTEM.md` for frontend design, (6) verified current source for what exists and works, (7) current-state architecture/audit documents if present, (8) nearby conventions, (9) agent preference. The system target and frontend target govern different concerns; reconcile them rather than applying a numerical rank to unrelated decisions. Preserve working behavior while migrating toward the target. If a target conflicts with actual behavior, document the difference and migrate in a compatible step. Never invent implemented features from a target document.

Ask the user only when a material choice remains unresolved after inspecting the task and repository, or when required approval/credentials/external state is missing. Examples: mutually exclusive business rules, unclear destructive data deletion, or a security decision with materially different outcomes. Make routine implementation choices yourself. Do not ask “should I continue?”, “can I run tests?” or “may I create the requested file?” when the task already authorizes them. Do not use this autonomy rule to bypass tool approval, sandbox policy, user scope or irreversible-action safeguards.

## Implement within domain boundaries

- One platform, multiple business domains. Each business behavior has an owner: Platform for identity/workspaces/permissions; Integrations for channel connections, credentials, OAuth and provider adapters; Customers for customer identity; Conversations for conversation/message/handoff state; AI, Automation, Commerce, Growth and Analytics only when corresponding use cases are implemented. Keep future domains as design until needed.
- New substantial API flows use thin HTTP handlers for input/auth/validation/response mapping, application services for use-case coordination, domain policies for invariants and repositories/adapters for SQL/provider calls. Do not keep growing `server.ts` with unrelated flows. Refactor touched legacy code only as much as the task needs.
- A module accesses another module through its public service, contract, ID/reference or event. Do not import another domain's private files or manipulate its private tables directly. Cross-domain writes that must be atomic may share an application-level transaction while preserving ownership.
- Put provider-specific payload/token/rate-limit/error behavior behind provider adapters. Normalize inbound events before core domain logic. Keep provider credentials server-side and encrypted; never return them to clients or place them in frontend code, URLs, logs or public contracts.
- Use `packages/contracts` for stable API/event boundaries when both sides need them; do not publish database row types or all backend models there. Reuse existing contracts and version breaking changes.
- Every business query, command, cache key and job must preserve workspace ownership. Derive actor/workspace from verified server context, enforce permissions server-side, and check related records and assignees belong to the same workspace. Do not assume a UUID foreign key alone proves tenant isolation.
- Persistent changes use a new ordered migration; never edit applied migration history. Use parameterized SQL, appropriate indexes and transactions for multi-write operations. Review migration data preservation before applying destructive schema changes.
- Preserve Inbox/Outbox durability for relevant async flows. Jobs must tolerate retries/duplicates, carry tenant context, expose failure/retry status and recover from worker crashes. External side effects do not occur inside a database transaction without an explicit safe design. Do not assume current `worker.ts` consumes every Outbox event.
- Business logic does not belong in generic `utils`, `helpers`, `common`, `shared`, `App.tsx`, `index.ts` or a growing central route file merely for convenience. Shared code must be genuinely reusable.

## Frontend: one shell and design system

The frontend target specification controls dimensions, colors, typography, spacing, radii, elevation, responsive behavior and component ownership. Use semantic tokens and supported variants; do not add feature-local raw colors or arbitrary visual values. Channel branding is source metadata, never the product's global theme. Keep one global AppShell, Sidebar and Header as they are introduced. Inbox may have its own internal multi-pane layout inside that shell. Every ordinary page uses the shared page container/header and base UI components. Before building a primitive, layout, filter bar, table, modal or state view, search the implemented shared library; reuse or extend it when appropriate. Because the current static frontend has no such library yet, create the first shared implementation once when the authorized migration requires it, rather than pretending it exists or creating unused scaffolding.

Feature components compose shared Button/Input/Select/Dialog/Drawer/Badge/Table/EmptyState patterns; they do not fork their styling. Keep presentational components free of provider credentials and arbitrary endpoint strings. API calls flow through feature API modules and a shared client once that layer exists. Separate local UI, URL, server, global app and realtime state by owner; do not place everything in a global store. Handle relevant loading, empty, filtered-empty, error, denied, disabled and pending-action states. Check desktop, narrow desktop/tablet and mobile behavior; do not squeeze Inbox's panes into unusable widths. Preserve keyboard navigation, visible focus, accessible labels, dialog focus handling, Escape behavior, contrast and non-color status cues. Do not install a framework or UI library merely because it appears in a target tree; make that a deliberate implementation/ADR decision when the task reaches that phase.

## Scope, safety and documentation

- Complete the requested behavior end to end when the task is an implementation. Do not leave fake handlers, dead buttons, placeholder APIs, missing migrations or TODO behavior and call it done. Do not broaden work into an unrelated rewrite.
- Preserve unrelated user changes. Inspect an already modified file before editing it. Never reset or discard user work to simplify a task.
- Avoid hardcoded secrets, token logging, permission bypass and weaker authentication. The current static page contains a local/demo API key; do not propagate that pattern into a production frontend.
- Do not drop data, erase migration history, reset a repository, force push, rotate credentials or delete large modules without clear task authority. Resolve exact targets and use recoverable operations where possible.
- Add a dependency only after checking existing solutions and the architectural fit. Do not add competing libraries for the same responsibility.
- Comments explain non-obvious rules, race/transaction behavior, security constraints and provider quirks, not obvious syntax. Names should reflect domain meaning; avoid vague `Manager`, `Helper2` and `CommonUtil` names.
- Update architecture docs only when requested or when an architecture/public contract change makes them materially inaccurate. Do not rewrite target documents to justify shortcuts. Record major architecture decisions in an ADR when that structure exists or as part of the authorized change; do not create empty architecture folders preemptively.

## Verify, self-review, fix

Run validation proportional to the change. The current root scripts are `npm run build`, `npm run typecheck` and `npm test`; API tests are under `apps/api/test`. There is no verified frontend test runner or lint script. Use relevant commands, not every command by ritual. For frontend changes also verify actual browser behavior, responsive widths and accessibility states as the available tooling permits. For migrations, verify ordered application and data compatibility in an appropriate environment. For documentation-only tasks, verify the document against source and links; do not mutate production or run unrelated builds.

Inspect the final diff or changed files (use `git diff` when the workspace is a Git checkout). Check behavior, architecture, reuse, duplicate code, tenant/permission enforcement, error and UI states, token use, secret exposure, dependency additions, debug leftovers and unrelated changes. If your change causes a failure, diagnose, fix and rerun the affected validation. Report pre-existing or external failures accurately; never claim a passing check that did not pass. Stop optional testing after the relevant risk is covered.

### Completion checklist

- [ ] Required target documents and relevant current source were read; missing documents were noted.
- [ ] Existing shared implementations and affected contracts, permissions and migrations were checked.
- [ ] Requested behavior is complete within scope and moves toward the target architecture.
- [ ] Domain ownership and workspace/permission boundaries are preserved.
- [ ] Existing layouts/components/services were reused; no avoidable duplicate or arbitrary design value was added.
- [ ] Relevant loading, empty, error, disabled, responsive and accessibility states were handled.
- [ ] Meaningful tests were added or updated where needed; relevant build/typecheck/tests or document checks were run.
- [ ] Changed files/diff were self-reviewed; agent-created regressions were fixed.
- [ ] No unrelated user changes were overwritten, and no false completion claim remains.

A task is done when requested behavior works, relevant contracts and safety constraints hold, verification succeeds or genuine external blockers are stated, and self-review is complete. For implementation work, report concisely under **Completed**, **Changed**, **Architecture**, **Validation** and **Remaining Issues** (`None` when there are none). For read-only or documentation tasks, adapt the report to the requested output. Do not ask whether the user wants the implementation after they already requested it.

## Required operating flow

```text
TASK RECEIVED
      ↓
READ AGENTS.md
      ↓
READ TARGET ARCHITECTURE
      ↓
READ TARGET FRONTEND/DESIGN SYSTEM
      ↓
INSPECT RELEVANT CURRENT CODE
      ↓
LOCATE EXISTING SHARED IMPLEMENTATIONS
      ↓
DETERMINE MINIMAL CORRECT CHANGE
      ↓
IMPLEMENT (OR ANALYZE/DOCUMENT IF THAT IS THE TASK)
      ↓
RUN RELEVANT VALIDATION
      ↓
SELF-REVIEW CHANGED FILES
      ↓
PROBLEM FOUND? ── YES → FIX → VALIDATE AGAIN
      │
      NO
      ↓
COMPLETE AND REPORT
```
