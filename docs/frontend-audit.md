# Frontend Audit — Omnichannel Inbox

_Audit date: 2026-09-25. This report describes the codebase before the first design-token migration._

## 1. Current Frontend Architecture

The frontend is a single static HTML application, not a React, Next.js, Vue, or other component-framework project.

| Area | Current implementation | Evidence |
|---|---|---|
| Frontend runtime | Static HTML, inline CSS, and browser JavaScript | `apps/web/public/index.html` |
| Framework/router | None; Nginx falls back to `index.html` | `apps/web/nginx.conf` |
| Styling | Plain CSS in one `<style>` block | `apps/web/public/index.html:7-33` |
| UI library | None | Root `package.json`; no frontend package manifest or library configuration |
| Icon library | None | `apps/web/public/index.html` |
| Font | `system-ui, sans-serif` | `apps/web/public/index.html:9` |
| Theme/dark-mode provider | None; light-only stylesheet | `apps/web/public/index.html:8-33` |
| Build/deployment | Nginx copies `apps/web/public` directly | `apps/web/Dockerfile` |

The workspace is a TypeScript pnpm monorepo, but its packages are the Fastify API and shared contracts. There is no `apps/web/package.json`, no frontend build tool, and no frontend test or lint script. The web container proxies `/api/` to the API service through Nginx.

Relevant files:

- `package.json` and `pnpm-workspace.yaml` — monorepo scripts and workspace membership.
- `apps/web/public/index.html` — entire frontend structure, styles, and browser behavior.
- `apps/web/Dockerfile` and `apps/web/nginx.conf` — static-file serving and API proxy.
- `docker-compose.yml` — local web container exposure on port 18080.

The product design documents define future screens such as settings, contacts, authentication, and analytics, but those views have not been implemented. The only current product screen is a compact Facebook inbox prototype.

## 2. Current Styling System

Styling is plain CSS in `apps/web/public/index.html:7-33`. The `:root` declaration contains four color variables; all remaining layout, type, radius, and state styling is local to the same stylesheet.

- No Tailwind CSS, PostCSS, CSS Modules, SCSS, styled-components, Emotion, or CSS-in-JS.
- No `components.json`, Tailwind configuration, global stylesheet, theme object, or provider.
- No dark-mode selector, `prefers-color-scheme` query, or alternate token definitions.
- Layout is a two-column CSS grid (`.page`) that becomes one column at 720px.
- Controls, messages, and conversation rows independently use `border-radius: 4px`; this is consistent in the existing page but not expressed as a reusable token.
- The page uses raw CSS selectors instead of reusable UI primitives.

## 3. Existing Color Palette

| Color / Token | Value | Usage | File |
|---|---:|---|---|
| `--primary` | `#168aad` | Brand heading, primary buttons, active conversation border, focused input border; 5 variable references | `apps/web/public/index.html:8,11,13,20,30` |
| `--primary-light` | `#e6f6fb` | Active conversation and outbound-message backgrounds; 2 references | `apps/web/public/index.html:8,20,26` |
| `--border` | `#cbdde3` | Header, sidebar, list, message, composer, and input dividers/borders; 7 references | `apps/web/public/index.html:8,10,16,20,25,28,29` |
| `--text-muted` | `#5f7480` | Message metadata and empty states; 2 references | `apps/web/public/index.html:8,27,31` |
| Foreground (hardcoded) | `#18323d` | Main body text | `apps/web/public/index.html:9` |
| Canvas (hardcoded) | `#fbfdfe` | Body background | `apps/web/public/index.html:9` |
| Primary hover (hardcoded) | `#117797` | Header and composer button hover | `apps/web/public/index.html:14` |
| Heading (hardcoded) | `#285b6b` | All `h2` headings | `apps/web/public/index.html:17` |
| Outbound/focus border (hardcoded) | `#9bd4e2` | Outbound message border and input focus outline; 2 occurrences | `apps/web/public/index.html:26,30` |
| Surface (keyword) | `white` | Header, sidebar, conversation row, message, and composer | `apps/web/public/index.html:10,16,20,25,28` |

There are no Tailwind classes, arbitrary Tailwind colors, `rgb()`, `hsl()`, or inline `style` color attributes in production frontend code.

## 4. Existing Design Tokens

Existing tokens: `primary`, `primary-light`, `border`, and `text-muted`.

Missing semantic roles include `background`, `foreground`, `card`, `popover`, `input`, `ring`, `secondary`, `muted`, `accent`, `destructive`, status tokens, and all sidebar tokens required by the frontend convention.

`--primary-light` represents two different concepts: selected navigation and outbound-chat surface. This is a semantic collision: a selection state and an agent-authorship state may need to evolve independently. `#9bd4e2` is also reused both for a message border and an input focus indicator, which couples two unrelated states.

## 5. Hardcoded Colors

| Value | Usage count | Example files |
|---|---:|---|
| `#18323d` | 1 | `apps/web/public/index.html:9` |
| `#fbfdfe` | 1 | `apps/web/public/index.html:9` |
| `#117797` | 1 | `apps/web/public/index.html:14` |
| `#285b6b` | 1 | `apps/web/public/index.html:17` |
| `#9bd4e2` | 2 | `apps/web/public/index.html:26,30` |
| `white` | 5 | `apps/web/public/index.html:10,16,20,25,28` |

All direct colors are in the one stylesheet; there are no inline styles or other frontend files to scan.

## 6. Shared UI Components

There are no reusable component files or variant system. The static page contains these local element patterns:

| UI type | Current implementation | Finding |
|---|---|---|
| Primary action | `header button, form button` rule | One shared selector, but no named Button primitive or disabled/loading visual state |
| Conversation row | Dynamic `<button class="conversation">` | A single local pattern with default, hover, and active styles |
| Message bubble | Dynamic `<div class="message">` and `.outbound` | One local pattern; inbound and outbound states share most styling |
| Composer | `<form>` containing a bare `<input>` and `<button>` | No reusable Input primitive; input has no associated label |
| Channel list | Dynamic `.channel` markup | Informational text only; no badge/source component |

No CVA (`class-variance-authority`) dependency or duplicate Button/Input/Dialog component files exist.

## 7. UI Inconsistencies

| Issue | Concrete evidence | Impact |
|---|---|---|
| Partial token coverage | `body` uses `#18323d` and `#fbfdfe`, `h2` uses `#285b6b`, while only four roles are tokens | A theme change requires hunting raw values and may leave surfaces inconsistent |
| State colors have mixed meanings | `#9bd4e2` is both `.message.outbound` border and `form input:focus` outline | Focus indication and message authorship cannot be tuned independently |
| Selected and outbound surfaces share `--primary-light` | `.conversation.active` and `.message.outbound` at `apps/web/public/index.html:20,26` | Navigation selection is visually tied to a chat-message type |
| No shared semantic status roles | Channel status and message status are rendered as unstyled data at `apps/web/public/index.html:99-102,129` | Future error, waiting, success, and AI/human states have no consistent visual language |
| Incomplete keyboard-focus treatment | Only `form input:focus` is styled at `apps/web/public/index.html:30`; buttons and conversation rows rely on browser defaults | Keyboard focus is inconsistent across interactive controls |
| Composer input lacks a label | `#text` has only `placeholder` at `apps/web/public/index.html:58` | Placeholder is not a durable accessible label |
| No status/state feedback styles | `#status` is plain text at `apps/web/public/index.html:38,154-156`; API failures use `window.alert` | Loading, connected, and error states do not have semantic styling or live-region announcement |
| Missing app regions | No global navigation, customer-context panel, settings, authentication, dashboard, or source badges | The current prototype cannot yet implement the four-region inbox convention |

The existing 720px breakpoint correctly prevents a squeezed two-column layout by stacking the sidebar over the main area. There is no customer context panel to move into a drawer.

## 8. Recommended Token Architecture

Use the existing `:root` CSS-variable mechanism as the single source of truth; do not introduce Tailwind, shadcn/ui, or another theme framework solely for this prototype. Define the required semantic roles:

```css
--background; --foreground;
--card; --card-foreground;
--popover; --popover-foreground;
--primary; --primary-foreground;
--secondary; --secondary-foreground;
--muted; --muted-foreground;
--accent; --accent-foreground;
--destructive; --destructive-foreground;
--border; --input; --ring;
--success; --success-foreground;
--warning; --warning-foreground;
--info; --info-foreground;
--sidebar; --sidebar-foreground;
--sidebar-primary; --sidebar-primary-foreground;
--sidebar-accent; --sidebar-accent-foreground;
--sidebar-border;
```

For this light-only prototype, use the convention’s initial neutral-blue palette in token definitions only. Components/selectors must consume tokens, not literal colors. Keep dark mode out of scope until the product requires it or a theme toggle exists.

Map the current page intentionally:

- body canvas/text → `background` / `foreground`;
- header, sidebar, composer, messages, rows → `card` and `card-foreground`;
- CTA and active conversation border → `primary`;
- selected conversation → `accent`;
- outbound message surface → `secondary` so it is independent of selected navigation;
- metadata and empty states → `muted-foreground`;
- input border and keyboard focus → `input` / `ring`.

## 9. Migration Strategy

| Phase | Scope | Risk | Verification / rollback |
|---|---|---|---|
| P0 — Theme foundations | Add semantic variables in the existing `:root`; replace raw color declarations with semantic variables | Low: CSS-only, one file | Inspect page in browser; rollback is one CSS block revert |
| P1 — Shared component patterns | Normalize local button, input, conversation-row, and message selectors around tokens; add focus-visible and disabled states | Low: does not alter JS/API behavior | Keyboard-tab through controls, send a message, select a conversation |
| P2 — Core layout | Apply sidebar/card token mapping and retain the existing narrow layout breakpoint | Low | Check ≥ desktop width and ≤720px width; ensure message area and composer remain usable |
| P3 — Feature UI | Apply status tokens when assignment, AI/human, failure, and channel badges are actually implemented | Medium: depends on future data/UI | Check semantic labels plus color in the relevant new view |
| P4 — Hardcoded-color cleanup | Verify no raw colors remain outside the central `:root` token values | Low | Search `apps/web/public` for hex/rgb/hsl; revert selector-level migration if needed |

## 10. Files Likely to Change

| File | Reason | Priority | Risk |
|---|---|---|---|
| `apps/web/public/index.html` | Contains all CSS and current UI patterns; add semantic token foundation and map existing selectors | P0/P1/P2/P4 | Low |
| `docs/frontend-migration-plan.md` | Records approved token mapping and phased rollout | P0 | Low |
| Future `apps/web` source files | No source/component structure exists yet; only change when a real frontend architecture is introduced | P1-P3 | Medium |

## 11. Recommended Next Step

Implement P0-P2 in `apps/web/public/index.html`: centralize the required semantic variables in `:root`, replace local hardcoded colors with those tokens, split selected-row and outbound-message surfaces into separate semantic roles, and add visible keyboard focus plus an accessible composer label. Do not introduce a component framework or alter the API behavior in this migration.
