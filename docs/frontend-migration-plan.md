# Frontend Design-Token Migration Plan

_Created: 2026-09-25. Scope: the existing static inbox prototype in `apps/web/public/index.html`._

## Decision and scope

The audit found no frontend framework, CSS build pipeline, shared component directory, or theme provider. The smallest safe migration is therefore to retain the inline CSS architecture and establish one CSS-variable token source in the page’s existing `:root` block.

This plan is intentionally limited to visual foundations and accessibility states. It does not change API requests, data structures, polling behavior, routes, or product workflows.

## Token mapping

| Old token / value | New semantic token | Affected selector / file |
|---|---|---|
| `#fbfdfe` | `--background` | `body` in `apps/web/public/index.html` |
| `#18323d` | `--foreground` | `body` |
| `white` | `--card` | `header`, `aside`, `.conversation`, `.message`, `form` |
| `#168aad` / `--primary` | `--primary` and `--primary-foreground` | `header h1`, action buttons, active conversation border, input focus border |
| `#117797` | `--primary-hover` | Primary-button hover state |
| `#e6f6fb` / `--primary-light` | `--accent` and `--accent-foreground` | Selected conversation row |
| `#e6f6fb` / `--primary-light` | `--secondary` and `--secondary-foreground` | Outbound message surface |
| `#cbdde3` / `--border` | `--border`, `--input`, `--sidebar-border` | Dividers and input border |
| `#5f7480` / `--text-muted` | `--muted-foreground` | Metadata and empty states |
| `#285b6b` | `--foreground` / `--card-foreground` | `h2` headings |
| `#9bd4e2` | `--ring` | Focus-visible outline; outbound border maps independently to `--border` |

The complete required semantic architecture will be declared even where the current prototype has no consumer. This creates the foundation for settings, channel status, error handling, AI states, and a future sidebar without adding duplicate theme systems.

## Ordered implementation phases

### P0 — Theme foundations

- Files: `apps/web/public/index.html`
- Work: replace the four-token `:root` block with the complete semantic token set and use the convention’s light palette only as token values.
- Risk: low; no markup, browser JavaScript, or API contract changes.
- Verification: confirm all declarations outside `:root` reference `var(--...)`; confirm the static page renders without CSS parse errors.
- Rollback: restore the original `:root` block and selector colors.

### P1 — Local primitive normalization

- Files: `apps/web/public/index.html`
- Work: map existing button, input, conversation-row, and message selectors to semantic tokens; add focus-visible and disabled styles; add a screen-reader-only input label.
- Risk: low; visual state only.
- Verification: use keyboard Tab/Shift+Tab, hover each interactive item, select a conversation, send a message, and observe the disabled input state during the request.
- Rollback: remove the state selectors and accessibility-only label without touching JavaScript.

### P2 — Core inbox layout

- Files: `apps/web/public/index.html`
- Work: map header/sidebar/cards to navigation and surface tokens, preserve the existing `720px` stacked layout, and keep the composer visible in the main grid.
- Risk: low.
- Verification: inspect desktop and a viewport narrower than 720px; ensure the page has one readable column and the composer remains usable.
- Rollback: restore only layout-related selectors; token definitions remain valid.

### P3 — Feature UI as it is built

- Files: future inbox, contacts, settings, status, and channel components.
- Work: consume `success`, `warning`, `destructive`, and `info` for semantic states; use small channel-source metadata rather than channel colors for global actions.
- Risk: medium because it depends on future UI/data behavior.
- Verification: each state includes text/icon in addition to color and has loading/empty/error behavior where relevant.
- Rollback: revert the feature-level component only.

### P4 — Hardcoded-color cleanup

- Files: all future frontend source files.
- Work: remove raw component colors after the corresponding semantic token is in use.
- Risk: low if performed after P0-P3.
- Verification: search frontend source for `#`, `rgb(`, `hsl(`, and inline `color` styles, allowing values solely inside the central token definition.
- Rollback: restore the affected selector mapping, not the whole theme.

## Product-owner decisions not needed for this first implementation

The current static prototype has no dark-mode capability, brand guideline, or alternative palette. The convention’s light neutral-blue starting palette will be used only in centralized token definitions. A future branded palette, dark-mode support, and component-framework choice require separate product/technical decisions.

## Implementation record — 2026-09-25

The user explicitly authorized an end-to-end implementation after the initial P0-P2 migration. The static frontend architecture was retained; no JavaScript framework, UI library, API contract, or database schema was introduced.

Completed work:

- P0: declared the required semantic token architecture in the single existing `:root` source of truth.
- P1: standardized local button, input, badge, message, and list-row patterns; added focus-visible, disabled, loading, empty, success, and error states.
- P2: replaced the two-column prototype with the responsive four-region Inbox layout: global workspace/channel sidebar, conversation list, conversation workspace, and customer-context panel. On narrower desktop widths the context panel becomes an accessible drawer; on mobile the conversation list stacks above the workspace.
- P3 (available API scope): connected the UI to real channel, conversation, message, Facebook OAuth, and AI/human handoff endpoints. Search and filters operate client-side over server-returned conversation data. Channel colors remain neutral source metadata rather than product-action colors.
- P4: all selector-level colors now consume semantic variables; literal color values remain only in the central token declaration.

Known API-bound limits:

- The current API has no read endpoint for contact phone/email, tags, notes, history across channels, or current assignment; the context panel does not fabricate these fields.
- The API has no server-side conversation search/filter endpoint; the current list filters the loaded page of up to 50 conversations.
- Live updates continue to use the existing three-second polling behavior. The available SSE endpoint requires custom authorization headers, which browser `EventSource` cannot attach; replacing polling needs a server-supported browser auth mechanism or a tokenized SSE route.

Verification completed:

- `npm.cmd run typecheck` passed.
- `npm.cmd test` passed (5/5 tests).
- Inline browser JavaScript syntax check passed.
- Nginx web image built and the `web` service was recreated from the modified source.
- Smoke tests through `http://localhost:18080` returned HTTP 200 for the web shell, channels, conversations, and the selected conversation's message timeline.
