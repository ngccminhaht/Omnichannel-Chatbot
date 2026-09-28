# ADR 001: Frontend runtime and routing

Status: accepted

## Context

The repository currently serves a static page through Nginx and has no frontend framework, router, component library or frontend build pipeline. The target architecture requires explicit application, layout, feature, service and style boundaries without inventing dependencies that are not yet justified.

## Decision

The first migration slice uses native browser ES modules, a small history-based route registry and semantic CSS tokens. The root route `/` redirects to `/inbox`; the Inbox page is mounted inside one shared AppShell. API calls remain behind a shared client and feature rendering/state stays inside `features/inbox`.

The implementation intentionally does not add React, a router package or an icon library in this slice. A framework can be adopted later through a new ADR when a second real page, component testing need or measured bundle/interaction complexity justifies it.

## Consequences

- The static Nginx deployment remains compatible and requires no bundler.
- Source ownership is explicit and endpoint strings stay in the Inbox feature layer.
- Native controls and browser history provide the initial accessibility and routing baseline.
- Production authentication still needs a server-provided session/auth adapter; `config.local.js` is local-only and ignored by version control.
