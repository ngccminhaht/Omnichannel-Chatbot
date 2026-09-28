# Frontend Target Architecture & Design System

Status: target design specification. The `CURRENT` statements below are verified against this repository; `TARGET` statements are implementation requirements for a future migration. No future module is claimed to exist today. Read this with `SYSTEM_TARGET_ARCHITECTURE.md`, `FRONTEND_ARCHITECTURE_AUDIT.md` and `FRONTEND_DEVELOPMENT_CONVENTION.md`. Where older documents describe the current static page, this specification defines the future shared frontend contract.

## 1. Frontend Design Vision

TARGET: one clean, compact, professional operations platform. It should be information dense, neutral, scannable and consistent. Use typography, spacing, borders and semantic state to establish hierarchy. Avoid marketing page styling, glass effects, decorative gradients, neon accents, oversized cards, arbitrary corner radii, decorative shadows and channel brand colors as the product theme. Inbox is one workspace inside the product.

## 2. Current Frontend Baseline

CURRENT files: `apps/web/public/index.html`, `apps/web/nginx.conf`, `apps/web/Dockerfile`. Nginx serves static files and proxies `/api/` to Fastify. There is no verified frontend framework, router, component package or frontend test suite. `index.html` contains the DOM, a `<style>` block and a `<script>` block. The CSS root declares semantic colors and two radii. The grid contains `.global-sidebar`, `.conversation-panel`, `.workspace` and `.context-panel`. At `1180px` the sidebar shrinks and context becomes a drawer; at `820px` the sidebar disappears and the list stacks above messages; at `560px` controls stack. The script stores page state in `state`, holds DOM references in `elements`, wraps `fetch` in `api()`, renders with `render*` functions, filters conversations locally and polls every three seconds. It reads Facebook OAuth result parameters from the URL. Browser requests currently contain a hardcoded local API key and user ID. The API has an SSE route, but this browser page currently uses polling.

Preserve: conversation search/channel filters; selected conversation and message history; send with idempotency key; AI/human handoff; Facebook connection; loading, empty and notice behavior; customer context panel; responsive drawer; keyboard focus and Escape handling. Preserve API endpoint compatibility during extraction. Do not copy local demo credentials into a new production bundle. Source evidence: `apps/web/public/index.html` lines 7–43, 76–80, 442–481, 486–580 and 582–991.

## 3. Target Frontend Architecture

TARGET directory shape, created only when code is actually migrated:

```text
apps/web/
  public/                         static assets only
  src/
    app/                          bootstrap, route registry, app providers
    core/                         auth session, workspace, permissions
    components/
      ui/                        shared visual and accessible primitives
      layout/                    AppShell, navigation, page and split layouts
    features/
      inbox/                     current Inbox UI, API and state
      customers/                 future, when implemented
      orders/                    future, when implemented
      ...                        other domains only when implemented
    services/                    base API client and transport policy
    styles/                      tokens.css, globals.css, limited utilities
    lib/                         dependency-light cross-feature helpers only
    tests/                       tests when a runner is selected
```

Choose framework, router and accessible primitive library in an ADR before P1; this repo does not yet establish them. `app` may import `core`, `features`, `components` and `services`. `features` may import `core`, `components`, `services` and public shared contracts. `components/ui` may import tokens and accessibility support, never business APIs. `components/layout` may consume auth/workspace/nav state through public interfaces, never Inbox implementation. Features cannot import another feature's private files. Shared `lib` contains only genuinely reusable, business neutral helpers.

## 4. Application Shell

TARGET desktop shell: persistent `AppSidebar` on the left, 56px `AppHeader` above the main viewport, one route workspace below. AppShell owns viewport sizing, shared navigation, workspace selector, responsive navigation drawer, global overlay portal and toast layer. A page supplies content and optional page title/actions through defined slots. Inbox supplies its internal three columns beneath the shell header; Orders/CRM supply their own content patterns in the same shell. Global sidebar may collapse. Shell dimensions are tokens, not page CSS. Keep page scroll regions explicit: the shell owns viewport height; workspace panes own local scrolling as needed.

## 5. Sidebar Base Design

TARGET expanded width `248px`, collapsed `72px`, minimum expanded `240px`; height fills shell. Brand top `56px`, footer/user area at least `56px`, middle navigation scrolls independently. Horizontal inset `12px`; item content inset `12px`; item height `40px`, icon `20px`, icon/text gap `10px`, nav text `14/20`, section heading `12/16`, selected radius `8px`. Use one `1px` semantic right border, no heavy shadow. Default uses sidebar surface/foreground. Hover uses subtle interactive surface. Selected has persistent semantic accent background and foreground plus `aria-current="page"`; focus has visible 2px ring; disabled is muted and unfocusable if inoperable. Collapsed state retains icons and labels via accessible name plus Tooltip; never rely on tooltip alone for critical information. Nested items indent by one 16px spacing step, expand on explicit control, and reveal active descendants. Sections use heading and 1px border separator only when useful. Long labels truncate with accessible full name; counters use the shared Badge, not custom color. Keep channel accounts out of global module navigation; show them as Inbox filters or Channels management content.

## 6. Global Header Base Design

TARGET height `56px`, `1px` semantic bottom border, horizontal padding `24px` desktop and `16px` tablet/mobile. Support breadcrumbs, current page/context title, workspace selector where appropriate, and right aligned global actions, notifications, help and user menu. Hide lower priority actions into a menu on narrow screens. `AppHeader` owns height; an Inbox conversation header is a separate local header below it and cannot redefine the global header height.

## 7. Page Container

TARGET `PageContainer` uses `24px` horizontal and vertical desktop padding, `16px` on narrower screens. Operational list/detail screens have no default max width. `constrained` variant may use `1200px` max for overview/configuration; form sections use `720px` maximum. `PageHeader` contains title, optional description and actions; `PageContent` manages main spacing, `PageSection` groups related information. Title `24/32/600`, section `18/26/600`, subsection `16/24/600`, body `14/20/400`, small `13/18/400`, metadata `12/16/400`. Use page title once; local panel titles use section/subsection roles.

## 8. Base Color System

TARGET initial light theme semantic tokens:

| Token | Value | Role |
|---|---|---|
| `--background` | `#F8FAFC` | app canvas |
| `--foreground` | `#0F172A` | primary text |
| `--surface` | `#FFFFFF` | panels/controls |
| `--surface-subtle` | `#F8FAFC` | low emphasis |
| `--surface-muted` | `#F1F5F9` | hover/secondary surface |
| `--border` | `#E2E8F0` | standard separators |
| `--border-strong` | `#CBD5E1` | emphasized boundary |
| `--muted-foreground` | `#64748B` | metadata |
| `--primary` / `--primary-hover` | `#2563EB` / `#1D4ED8` | product action |
| `--primary-foreground` | `#FFFFFF` | text on primary |
| `--secondary` / `--secondary-foreground` | `#F1F5F9` / `#0F172A` | secondary action |
| `--success` | `#16A34A` | successful state |
| `--warning` | `#D97706` | warning state |
| `--destructive` | `#DC2626` | destructive/error state |
| `--info` | `#2563EB` | informative state |
| `--ai` | `#7C3AED` | AI identity/state only |
| `--focus-ring` | `#2563EB` | keyboard focus |

The palette is a centralized starting point, not permission to use raw hex in feature styles. Define role-specific on-color/subtle-background tokens after checking contrast for success/warning/destructive/info/AI. Current `--info` is purple in `index.html`; target `--info` is blue and `--ai` takes the purple role. Migrate status badges by semantic meaning, not by copying old class names unchanged. Brand changes alter token values only.

## 9. Channel Colors

Facebook, Zalo, Instagram, WhatsApp and TikTok identity belongs in a small source icon, source badge or connected-account metadata. The initial Inbox can keep neutral `FB`/`ZO` marks from `.source-mark`. Channel colors must not define navigation selection, primary CTA, global focus or status meaning. If channel marks later use brand palettes, isolate those tokens under source-specific metadata.

## 10. Spacing System

TARGET 4px grid with approved values `0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64px`. Tokens `--space-0` through `--space-64` use those exact values. Use 4px for tight inline relationships, 8px for icons/text and compact gaps, 12px for internal compact controls, 16px for standard component padding, 24px for page/grid rhythm, 32px and above for section separation. Component dimension tokens may use non-grid values when explicitly specified here (for example 22px badge height); arbitrary page-local 13/17/27/31px spacing is prohibited.

## 11. Border Radius System

TARGET `--radius-sm: 6px`, `--radius-md: 8px`, `--radius-lg: 12px`, `--radius-full: 9999px`. Button, Input, Select, Card and Panel use 8px; Dialog uses 12px; Badge uses 6px or full; Avatar uses full. The current 6px control and 10px panel radii in `index.html` should map during migration. Do not introduce decorative 16–24px panel rounding.

## 12. Shadow System

TARGET `--shadow-none`, `--shadow-sm` for dropdowns and `--shadow-md` for dialogs/drawers. Shadow values live only in tokens; implementation chooses subtle neutral values and verifies contrast. Cards default to none. Use border/surface contrast for ordinary separation. The current context drawer `color-mix` shadow maps to the shared drawer elevation token. No decorative shadow scale beyond these three levels.

## 13. Button System

One shared `Button` with `primary`, `secondary`, `outline`, `ghost`, `destructive`, `link` variants. Sizes: small `32px` high, `12px` horizontal padding, `13px` type; medium default `36px`, `14px`, `14px`; large `40px`, `16px`, `14px`. Icon sizes are matching squares `32/36/40px` with 16px icon and 8px icon/text gap. Radius 8px. Every variant supports default, hover, active, focus-visible, disabled and loading. Loading keeps dimensions, announces progress and blocks duplicate activation. Icon leading/trailing and icon-only are supported. `IconButton` is a constrained Button composition, not a new visual system. `SaveButton`/`OrderButton` may wrap behavior, not restyle controls.

## 14. Input System

One `Input` primitive: default height `36px`, large `40px`, horizontal padding `12px`, font `14/20`, 1px border and 8px radius. `FormField` composes label, description/helper, error and required state. Input supports placeholder, prefix icon, suffix action, search, disabled and read-only. States: default, hover, focus-visible, error, disabled, read-only. Error text has a programmatic relation to the field; color is not the only cue. Password and numeric behavior require appropriate native input types.

## 15. Select / Combobox

Shared Select matches Input at 36px default or 40px large, 8px radius, 14px text and 1px border. Menu option height 36px, max panel height 320px before scrolling, menu min width matches trigger. Use a native select when its behavior suffices. Combobox is a distinct accessible searchable composition when needed; keyboard navigation, typeahead and selected state are mandatory. Date controls follow the same dimensions.

## 16. Textarea

Shared Textarea uses 14/20 text, 12px internal padding, 8px radius, 1px border and 80px default minimum height. It supports Input-like label, error and disabled behavior. Inbox composer is a feature variant with `56px` minimum and autosizing up to a documented maximum; it uses the same border/focus tokens.

## 17. Table / Data Grid

One reusable `DataTable` composition for future Orders, Products, Inventory, Customers and Users. Header 40px, standard row minimum 48px, dense row 40px, cell horizontal padding 12px, body text 14/20, metadata 12/16 or 13/18. Headings and sort state must be accessible. Feature column definitions supply content; shared table owns selection, sorting UI, loading/empty/error, sticky header, pagination, bulk actions and row action slots. Server-side pagination/filter/sort is preferred for large lists; never assume all rows are loaded. Mobile behavior is either horizontal scroll with clear affordance or a documented compact row variant, never a silently clipped table.

## 18. Card / Panel

Card groups related content; it is not the default wrapper for every section. Default background `--surface`, 1px `--border`, 8px radius, 16px standard or 20px roomy padding, no shadow. `Panel` represents a full-height workspace region and owns its header/body scroll boundary. Avoid nesting cards merely for decoration.

## 19. Badges / Status

One `Badge` primitive with `neutral`, `primary`, `success`, `warning`, `destructive`, `info`, `ai`, `channel`. Height 22–24px, 12/16 font, 8px horizontal padding and 6px radius by default; count pills may use full radius. Use text/icon as well as color for business state. Domain maps status to semantic variant; UI primitive does not know order or conversation status enums. Check on-color contrast before using solid semantic backgrounds.

## 20. Icon System

Choose one icon library in the implementation ADR. Sizes: 16px inline/control, 18px ordinary control when needed, 20px navigation, 24px prominent. Use one visual weight/stroke family. Current text marks (`+`, `i`, `×`, `FB`, `ZO`) are migration placeholders. Icon-only actions require accessible name, visible focus and tooltip where discovery benefits; tooltip does not replace a label.

## 21. Tooltip

One shared Tooltip for collapsed navigation, icon-only controls and truncated labels. Show on hover and keyboard focus, close on Escape, avoid covering the triggering control. Essential business data remains in accessible text or a detail view; it must not exist solely in tooltip content.

## 22. Dialog / Modal

One shared Dialog with width variants small 400px, medium 560px, large 720px, extra large 960px, capped at `calc(100vw - 32px)`. Header, body and footer use standard spacing. It traps/restores focus, closes on Escape unless a destructive in-progress action requires otherwise, and uses an accessible title/description. Confirm consequential destructive operations with clear consequences. Feature code supplies content/actions, not a new modal implementation.

## 23. Drawer / Sheet

One shared Drawer/Sheet for mobile context, secondary detail and filters. Desktop widths 360, 420 or 480px; mobile width `min(100vw, desired width)` with at least 16px edge breathing where overlay layout allows. It owns backdrop, focus containment/restore, Escape, scroll lock and z-index. The current `.context-panel` becomes a `CustomerContextPanel` placed in Inbox layout on wide screens and inside the shared Drawer on narrow screens.

## 24. Dropdown / Menu

One shared DropdownMenu: option height 36px, horizontal padding 8–12px, 14px text. Support icon, label, shortcut, destructive item, separator and disabled state. Menu owns arrow-key, Enter/Space and Escape handling plus focus return. The menu is for actions; Select/Combobox is for choosing values.

## 25. Tabs

One Tabs primitive at 36–40px trigger height for local content switching. It owns active/focus/disabled states and keyboard navigation. Page-level routing stays in app navigation and router; tabs do not replace global navigation. Use URL state if a tab must be shareable or reload-stable.

## 26. Page Header

One `PageHeader` supports title, description, breadcrumb slot, primary and secondary action slots, optional local tabs and optional filters. Page features pass content; they do not choose height, typography or padding. Example future Orders screen: `PageHeader(title="Orders", actions=...)` inside `PageContainer`.

## 27. Filter Bar

One `FilterBar` composition supports SearchInput, domain filters, sort, date range, saved views, clear filters and bulk actions. At narrow widths, secondary filters move into shared Drawer while search and primary filter remain reachable. Orders, Customers, Products and Inbox provide filter definitions and state; none implements a separate filter layout.

## 28. Empty / Loading / Error States

Shared `EmptyState`, `LoadingState`, `ErrorState`, `Skeleton`, `PermissionDenied`, `NoSearchResults`. Every data screen distinguishes initial loading, genuinely empty dataset, empty filtered result, recoverable error and denied permission; stale/offline applies when the feature can detect it. Give users a relevant next action. Avoid replacing a failed fetch with an empty list. Current inline strings in `renderConversations`, `renderMessages` and `renderContext` map to these components.

## 29. Toast / Alert / Banner

Toast is short-lived success or low-risk feedback. Alert is a local actionable problem. Banner is a persistent global/workspace issue. All use semantic status and accessible announcement priority. Critical failures that require recovery stay visible in an Alert/Banner; they are not dismissed after a fixed timeout. The current `setNotice` maps to a shared toast/alert decision based on message severity.

## 30. Form Layout

One `FormSection` and `FormField` composition. Settings use vertical forms by default; label-column forms are an explicit desktop variant. Content width 640–720px; field gap 16px; section gap 32px. Save/Cancel actions have consistent placement at form end or a documented sticky footer. Labels, descriptions, validation and disabled/loading behavior use shared primitives.

## 31. Inbox Workspace

TARGET under AppShell: AppSidebar (global) | ConversationList | MessageWorkspace | CustomerContext. AppHeader stays above all three Inbox panes. At ≥1440px, list preferred 360px (min 320, max 420), context preferred 360px (default 320, max 400) and messages take the remaining width, aiming for at least 480px. The preferred columns plus 248px sidebar and gaps/borders require about 1448px, so around 1440px the context must collapse automatically; never force horizontal overflow to satisfy preferred sizes. At 1024–1439px use 72px collapsed sidebar, 320–360px list, flexible messages and context Drawer. At tablet use list/detail modes; on mobile show ConversationList → ConversationDetail → CustomerDetail drawer/page, one primary pane at a time. The global sidebar becomes a drawer on mobile. Conversation row min 64px, preferred 68–72px. Message bubbles max `min(72%, 672px)` on desktop and `92%` on mobile, with text wrapping. Composer stays at bottom of its pane, starts at 56px and expands to a documented cap (128px target); it must not disappear when messages scroll. Inbox channel account filtering moves from current global sidebar into list FilterBar/Channels section. Preserve existing search, filters, takeover, send and context data semantics. Do not manufacture missing CRM fields.

## 32. Customer / CRM Layout

FUTURE TARGET: Customer list uses AppShell → PageContainer → PageHeader → FilterBar → DataTable/Pagination. Customer detail uses PageHeader, profile summary, tabs/sections for timeline and contact points, plus DetailPanel or Drawer for secondary context. Customer timeline entries reference the canonical customer identity from backend contracts. No separate CRM shell or customer-colored UI system. This module is not implemented in the current frontend.

## 33. Orders Layout

FUTURE TARGET: Orders list uses the same AppShell, PageHeader, FilterBar, DataTable, Pagination, StatusBadge and shared Drawer/Dialog. OrderDetail may use a split detail layout but not a new global header/sidebar. Order status colors come from semantic status mapping. No Orders page exists today.

## 34. Products / Inventory

FUTURE TARGET: Product and Inventory lists reuse DataTable, SearchInput, FilterBar and Pagination with feature-owned columns. Product editing uses FormSection/FormField and shared controls. Inventory detail can use a shared DetailPanel. Do not invent custom table/control styles in these modules; neither is currently implemented.

## 35. AI Agent Workspace

FUTURE TARGET: Agents, Knowledge, Automation, Evaluation and Settings are routes within AppShell. Their local sub-navigation may use a documented section nav or Tabs where appropriate. AI-specific labels can use `--ai` for identity, while buttons, surfaces, forms and shell remain shared. An AI runtime UI is not present today; the existing Inbox only exposes handling mode/handoff.

## 36. Global Navigation Information Architecture

TARGET grouping (display only when a route exists and the user is permitted): Overview → Dashboard; Customers → Inbox, Customers, Leads; AI & Automation → AI Agents, Knowledge, Automations; Commerce → Orders, Products, Inventory, Shipping, POS; Growth → Marketing, Promotions, Loyalty; Analytics → Reports; System → Channels, Team, Permissions, Integrations, Settings. Only Inbox and connected channel entry points are currently visible in the frontend. Future navigation labels must not be rendered as dead links.

## 37. Sidebar Scaling Rules

Use grouped sections with optional collapse when the navigation becomes long. Keep current route and its parent section visible. Middle area scrolls; brand and footer remain pinned. Connected Facebook Pages and other channel accounts belong in Inbox filters or Channels management, not one global sidebar item per account. On mobile, sidebar drawer closes after navigation and restores focus.

## 38. Responsive Breakpoint Strategy

TARGET ranges: mobile `<640px`, tablet `640–1023px`, desktop `1024–1439px`, large `≥1440px`. Use mobile-first media queries. Desktop permits expanded/collapsed sidebar; tablet starts collapsed or drawer according to available room; mobile uses a Drawer. Inbox at mobile uses navigable list/detail states rather than stacking four panes. The existing implementation switches at 1180/820/560px; migrate against actual content widths, test at 320, 390, 768, 1024, 1280 and 1440px, and preserve access to all current Inbox actions. Do not assume a 1440px viewport can fit all preferred pane sizes simultaneously.

## 39. Z-Index Scale

TARGET `--z-base: 0`, `--z-sticky: 10`, `--z-dropdown: 30`, `--z-drawer: 40`, `--z-modal: 50`, `--z-toast: 60`, `--z-tooltip: 70`. Overlay portals use this shared order. A toast may appear above a modal but should not steal focus from it. No arbitrary `99999` or feature-owned overlay scales.

## 40. Typography System

Keep current system font stack (`system-ui`, Apple system, `Segoe UI`, sans-serif) until branding requires a documented change. TARGET roles: page title `24/32/600`; section `18/26/600`; subsection `16/24/600`; body `14/20/400`; body medium `14/20/500`; small `13/18/400`; metadata `12/16/400`; button `14/20/500` (small button 13/18). Heading levels follow document hierarchy, not visual size alone. Feature code chooses roles, never arbitrary font size/weight.

## 41. Component Ownership

`components/ui` owns pure Button, Input, Select, Badge, Dialog, Drawer, DataTable and state primitives; no business APIs or domain labels. `components/layout` owns AppShell, AppSidebar, AppHeader, PageContainer, PageHeader, PageSection, SplitPane, DetailPanel and generic list/detail shells. `features/inbox` owns ConversationList, ConversationWorkspace, MessageComposer, CustomerContextPanel and conversation status mapping. Other `features/*` own their domain components when implemented. Domain components compose primitives; they cannot redefine base Button/Input/Table appearance.

## 42. API Layer

TARGET request flow: feature UI → feature query/mutation module (`features/inbox/api`, future `features/orders/api`) → `services/api-client` → versioned backend. The base client owns base URL, authenticated request context, request ID propagation, JSON/error parsing and abort handling. Domain API modules own endpoint paths and response mapping. No arbitrary endpoint strings in presentational components. Current `api()` and `load*()` in `index.html` are extraction sources. Replace the hardcoded demo API key/user ID through the selected auth flow before production use; no provider secret or long-lived credential in browser source. Avoid a second uncoordinated fetch wrapper per feature.

## 43. State Ownership

- Local UI state: ephemeral open/closed panels, composer draft, hover/selection when not shareable; owned near component.
- URL state: route, selected conversation ID, shareable filters, tabs and pagination where reload/navigation should preserve them.
- Server state: API data, loading/error and cache invalidation; owned by feature query layer with one cache policy, not copied into a global UI store.
- Global app state: authenticated user, workspace, effective permissions, theme and shell navigation; owned by core/app providers.
- Realtime state: subscription/cursor/reconnect logic in a shared transport; domain events invalidate or update feature queries.

CURRENT is a single page `state` object with manual refresh/polling. Select a server-state solution only when framework choice is made; do not add a global store for every state category.

## 44. Routing

FUTURE TARGET routes: `/dashboard`, `/inbox`, `/inbox/:conversationId`, `/customers`, `/customers/:customerId`, `/ai/agents`, `/ai/knowledge`, `/automations`, `/orders`, `/orders/:orderId`, `/products`, `/inventory`, `/settings/*`. Route ownership belongs to each feature; AppShell wraps authenticated workspace pages once. Route guards check auth/workspace and permission; backend remains authoritative. Unknown routes render a shared not-found page. Deep links restore selected entity and list state. Current frontend has one document at `/` and no router; the OAuth result query in `index.html` needs a deliberate redirect destination when routing is introduced. Do not register future routes before modules exist.

## 45. Layout Components Required

Implementation sequence must create and reuse: `AppShell` (global frame), `AppSidebar` (module navigation), `AppHeader` (global context/actions), `PageContainer` (page gutters/width), `PageHeader` (title/actions), `PageSection` (section rhythm), `SplitPane` (resizable or fixed split semantics), `DetailPanel` (secondary detail), `InboxLayout` (specialized panes), `SettingsLayout` (form/settings navigation) and `ListDetailLayout` only if at least two domains need it. `SplitPane` must not imply drag resize in initial implementation. Avoid page-specific shell copies.

## 46. Base UI Components Required

Inventory for implementation as use cases arise: Button, IconButton, Input, Textarea, Select, Checkbox, Radio, Switch, Badge, Avatar, Tabs, Tooltip, Popover, DropdownMenu, Dialog, Drawer, Alert, Toast, Skeleton, EmptyState, LoadingState, ErrorState, Pagination, DataTable, SearchInput, FilterBar, Breadcrumb and FormField. DatePicker is deferred until an actual date-selection flow exists. An accessible, established library may provide interaction primitives after the framework decision; wrap it with the shared tokens/variants instead of reimplementing focus traps and keyboard patterns. Do not create unused components merely to fill this inventory.

## 47. Composition Rules

Correct future composition: `OrdersPage → PageContainer → PageHeader + FilterBar + DataTable + Pagination`; `CustomersPage → PageContainer → PageHeader + SearchInput/FilterBar + DataTable`; `InboxPage → AppShell → InboxLayout → ConversationList + ConversationWorkspace + CustomerContextPanel`. Incorrect: `OrdersCustomHeader`, `OrdersCustomButton`, `OrdersCustomSearch`, `OrdersCustomModal` with their own visuals. A feature may provide specialized behavior and content through slots/props; it may not fork the base design. If a primitive lacks a needed variant, update the primitive contract once and verify existing consumers.

## 48. No Hardcode Rule

Feature styles cannot declare raw hex/rgb/hsl colors, arbitrary spacing/font sizes/radii/shadows, independent button/input heights, or sidebar/header widths. Use semantic tokens and supported component variants. Exceptions require a named token and a short reason in the design system change. Calculated content-specific geometry (for example a chart position) may use dynamic values, but cannot introduce a parallel visual theme.

## 49. CSS / Token Architecture

TARGET `styles/tokens.css` is the sole source of design values; `globals.css` holds reset, font defaults and accessibility base; `utilities.css` is small and contains stable layout helpers only. Components own scoped styles that consume `var(--...)`. Features own layout composition only and consume semantic tokens. Avoid duplicated token declarations across modules, CSS variables that encode one domain's brand as global theme, and global selectors that leak into feature internals. The existing `:root` block in `index.html` is the migration source.

## 50. Theme Future Proofing

Initial delivery uses the light theme. Keep semantic roles (`surface`, `foreground`, `border`, `primary`, status colors) separate from palette values so brand color, dark mode and enterprise themes can later change token sets without modifying feature components. Test contrast per theme. A theme switcher or dark palette is not required until product need is defined.

## 51. Accessibility

Visible keyboard focus, semantic buttons/links, labels and error descriptions, correct heading hierarchy, sufficient contrast, keyboard list/menu navigation, modal focus trap/restore, Escape behavior and screen-reader names for icon buttons are required. Business state always has text or icon, not color alone. Keep native controls when sufficient. Preserve current `<label>`, `aria-label`, `aria-live`, `aria-expanded`, `role="log"` and Escape behavior while correcting incomplete semantics during extraction. Respect reduced-motion preference already present in CSS.

## 52. Performance Rules

Paginate server data and avoid rerendering unrelated panes on each refresh. Conversations, customers, orders and products may later need virtualization, but do not add it before list measurements show a problem. Keep stable row keys and row component boundaries so it can be introduced. Split future routes by actual usage only after bundle size is measured. Debounce search when it becomes server-backed, and cancel stale requests when selection changes.

## 53. Frontend Testing Strategy

TARGET categories: primitive interaction/accessibility tests; feature state tests for Inbox list, send and handoff; API integration tests with contract-shaped fixtures; responsive visual checks at target viewport widths; keyboard/focus checks; critical E2E flows for conversation selection, reply, handoff and Facebook connect. Test runner/browser framework is an implementation decision, not already present. Prioritize tests that protect behavior during extraction, not tests that mirror internal component structure.

## 54. Migration From Current `index.html`

The following mappings are extraction targets, not existing files. Preserve current behavior and API paths while moving each region.

| CURRENT HTML/CSS region | TARGET owner | Preservation detail |
|---|---|---|
| `.app-shell` | `AppShell` + `InboxLayout` | Global frame separated from Inbox panes |
| `.global-sidebar`, `.brand`, `.nav-current`, `.sidebar-footer` | `AppSidebar` | Navigation/accessibility; channel accounts move to Inbox filter |
| `.channel-list`, `.channel-account`, `.source-mark` | `features/inbox/ChannelFilter` or Channels management | Connected account filter behavior |
| `.conversation-panel`, `.panel-header`, `.toolbar` | `InboxLayout` + `ConversationList` + `FilterBar` | Search/filter/count and scroll region |
| `.conversation`, `.avatar`, `.unread` | `ConversationRow` + shared `Avatar`/`Badge` | Selected, unread and metadata display |
| `.workspace`, `.workspace-header`, `.header-meta` | `ConversationWorkspace` + local `ConversationHeader` | Distinct from global AppHeader |
| `.messages`, `.message-stack`, `.message` | `MessageTimeline` + `MessageItem` | Scroll position and directional styles |
| `.composer`, `.composer-input` | `MessageComposer` + shared Textarea/Button | Sticky bottom, disabled/send state |
| `.context-panel`, `.context-scroll` | `CustomerContextPanel` + shared Drawer on narrow screens | Current fields only; Escape/focus |
| `.notice` | shared Toast/Alert host | Success versus recoverable failure |

| CURRENT JS function/state | TARGET owner | Preservation detail |
|---|---|---|
| `api()` and hardcoded headers | `services/api-client` + core auth | Same response/error behavior initially; remove demo credentials before production |
| `state` / `elements` | feature-local UI state, server queries, DOM via framework | Do not create a single global god store |
| `escapeHtml()` | rendering safety framework/native text | Preserve XSS safety; avoid unsafe raw HTML |
| `initials()`, label/time formatters, `channelMark()` | feature display helpers or shared Avatar/format utility | Preserve Vietnamese labels and formatting |
| `setNotice()` | shared toast/alert action | Keep actionable failures visible |
| `selectedConversation()`, `filteredConversations()` | Inbox selectors / URL-state helper | Preserve selection, search and filters |
| `renderChannels()`, `renderConversations()` | ChannelFilter, ConversationList | Preserve click/pressed/current states |
| `badgeClassForState()`, `renderConversationDetails()` | status mapper + ConversationHeader | Map current `--info`/AI semantic change carefully |
| `renderContext()`, `renderMessages()` | CustomerContextPanel, MessageTimeline | Preserve fallback text and scroll behavior |
| `selectConversation()`, `loadMessages()` | Inbox navigation + message query | Ignore stale response after selection change |
| `loadChannels()`, `loadConversations()` | feature API/query modules | Keep existing endpoints and server payload semantics |
| `refresh()` and `setInterval(..., 3000)` | Inbox query invalidation / realtime transport | Poll until browser-compatible SSE auth exists |
| `changeHandlingMode()`, `connectFacebook()` | Inbox/Channels mutation actions | Preserve permission/error feedback and redirect |
| composer submit listener | `sendMessage` mutation + MessageComposer | Preserve `Idempotency-Key` and loading state |
| `URLSearchParams` OAuth result | route callback/notification handler | Preserve result feedback and clean URL |

| CURRENT CSS source | TARGET token/component | Change |
|---|---|---|
| `:root` colors | `styles/tokens.css` | map card/popover to surface roles; `--info` blue and `--ai` purple |
| `--radius-control: 6px`, `--radius-panel: 10px` | radius-sm/md/lg tokens | map controls/panels to 8px target; dialogs 12px |
| `.app-shell` four-column widths | AppShell + InboxLayout dimension tokens | 248/72 sidebar; 320–420 list; context drawer by fit |
| `.button*`, `.field`, `.filter-select`, `.badge*` | shared UI component styles | unify sizes, variants and states |
| `.avatar`, `.empty-state`, `.notice` | Avatar, EmptyState, Toast/Alert | centralize visual language |
| `.message*`, `.composer*`, `.context*` | Inbox feature styles consuming tokens | retain message direction and composer behavior |
| media queries 1180/820/560 | shared breakpoint tokens and feature pane modes | replace stacked mobile list/messages with navigable views |
| `z-index: 5/10` and context shadow | shared elevation/z tokens | use overlay scale consistently |

Backend compatibility checks before extraction: list channels, list conversations, list messages, send with idempotency key, takeover/return-to-AI, Facebook OAuth start and callback. The current SSE endpoint requires auth headers; native `EventSource` cannot attach them, so retain polling until backend supports a browser-safe stream auth approach. Do not place API key in the URL to work around this.

## 55. Migration Phases

| Phase | Goal and files | Risk | Validation | Rollback point | Exit criteria |
|---|---|---|---|---|---|
| P0 | Record tokens, component contracts and behavior baseline in this document; inspect `index.html` | Low: doc drift | Cross-check maps against markup/CSS/JS and existing API paths | Existing static UI is untouched | All existing UI regions/functions mapped |
| P1 | Choose framework/router/accessibility tooling in ADR; add build entry under `apps/web`, update Dockerfile/nginx only as needed | Medium: build/deploy | Built page serves under current origin and `/api/` still proxies | Static `public/index.html` remains deployable | Build and smoke route pass with no feature migration |
| P2 | Extract AppShell, AppSidebar, AppHeader and tokens from `index.html` | Medium: shell layout | Desktop/tablet/mobile widths, keyboard navigation, current Inbox visibility | Keep legacy page path available until parity | Single global shell owns nav/header/overlays |
| P3 | Implement shared Button, Input, Select, Badge, Avatar, Drawer, states used by Inbox | Medium: styling/accessibility | Component keyboard/focus/disabled checks; visual comparison | Legacy CSS/classes remain until consumers migrate | Inbox controls use shared primitives |
| P4 | Move Inbox regions into InboxLayout, ConversationList, MessageTimeline, Composer and Context | High: interaction regression | Conversation select/send/handoff/connect and responsive flows | Route/feature flag can return to legacy page during cutover | Parity at defined viewport widths and no duplicated global shell |
| P5 | Move `api()`/`load*()`/polling to client and feature query modules; introduce auth adapter | High: stale data/auth | API integration tests, idempotent send, stale response handling, workspace scope | Keep existing endpoints and polling fallback | No endpoint strings in presentational components; auth context correct |
| P6 | Add routing when a second real page is ready; migrate OAuth result handling | Medium: deep links | Direct reload of `/inbox/:id`, unknown route, back/forward, OAuth callback | Root Inbox route remains until new paths stable | AppShell wraps every protected route once |
| P7 | Add first new domain page with shared shell, primitives and API layer | Medium: reuse gaps | DoD checklist plus cross-page visual review | New route can be disabled independently | New page introduces no duplicate shell or base control |

Each phase lands independently; do not delete the legacy page before feature parity is verified. The rollback points are deployment/revert strategies for a future implementation, not instructions to change code now.

## 56. Definition of Done for Any New Page

A new page is complete only when it uses AppShell, PageContainer/PageHeader as appropriate, semantic tokens, shared base controls and the approved API layer. It handles initial loading, empty, filtered empty, recoverable error and permission denied states; supports relevant narrow screens and keyboard navigation; does not introduce hardcoded design values; respects workspace/permission rules; and has proportionate feature/integration validation. A special full-viewport workspace may replace PageContainer's gutter variant through a documented layout prop, not a separate shell.

## 57. AI Coding Agent Rules

1. Inspect existing layout/UI contracts before adding a screen.
2. Read `FRONTEND_DEVELOPMENT_CONVENTION.md` and this specification.
3. Inspect current components and tokens before creating variants.
4. Render every primary page inside one AppShell.
5. Never recreate the global Sidebar or Header in a feature.
6. Never change shell dimensions from feature CSS.
7. Reuse PageHeader and PageContainer.
8. Reuse shared Button; do not create feature-colored buttons.
9. Reuse shared Input, Select and FormField.
10. Reuse shared Dialog/Drawer with accessible focus handling.
11. Reuse DataTable/FilterBar patterns for list screens.
12. Use semantic tokens; no raw colors in feature CSS.
13. Keep channel branding out of the global product palette.
14. Use spacing/radius/shadow/type scales from tokens.
15. Do not put API/provider credentials in frontend source or URLs.
16. Keep endpoint strings in feature API modules.
17. Do not copy server data into a global UI store without a clear need.
18. Keep local view state near the owning feature.
19. Preserve existing Inbox behavior during migration.
20. Preserve idempotency keys for retried message sends.
21. Do not display missing customer fields as fabricated data.
22. Handle loading, empty, filtered-empty, error and denied states explicitly.
23. Preserve labels, visible focus, keyboard access and reduced motion.
24. Use one icon family after the tooling ADR.
25. Add a future feature folder only when implementing that feature.
26. Verify desktop, tablet and mobile behavior against the defined modes.
27. Run relevant build and behavior checks before reporting completion.
28. Document any new shared visual variant in tokens/component contract.

## 58. Final Design Token Table

All values here are TARGET defaults. `px` values are CSS pixels. Palette values live only in `tokens.css` or equivalent central source.

| Token | Default value | Usage |
|---|---:|---|
| `--background` | `#F8FAFC` | app canvas |
| `--foreground` | `#0F172A` | primary text |
| `--surface` | `#FFFFFF` | panel/control surface |
| `--surface-subtle` | `#F8FAFC` | subtle surface |
| `--surface-muted` | `#F1F5F9` | secondary/hover surface |
| `--border` | `#E2E8F0` | standard border |
| `--border-strong` | `#CBD5E1` | strong border |
| `--muted-foreground` | `#64748B` | metadata |
| `--primary` | `#2563EB` | product primary action |
| `--primary-hover` | `#1D4ED8` | primary hover |
| `--primary-foreground` | `#FFFFFF` | primary on-color |
| `--secondary` | `#F1F5F9` | secondary action |
| `--secondary-foreground` | `#0F172A` | secondary on-color |
| `--success` | `#16A34A` | success status |
| `--warning` | `#D97706` | warning status |
| `--destructive` | `#DC2626` | destructive status |
| `--info` | `#2563EB` | info status |
| `--ai` | `#7C3AED` | AI identity/status |
| `--focus-ring` | `#2563EB` | keyboard focus |
| `--space-0/4/8/12/16/20/24/32/40/48/64` | same number in px | approved spacing scale |
| `--radius-sm/md/lg/full` | `6/8/12/9999px` | badge, control/panel, dialog, avatar |
| `--shadow-none/sm/md` | none/subtle/subtle elevated | card, dropdown, dialog/drawer; exact shadow CSS set centrally |
| `--sidebar-width-expanded` | `248px` | AppSidebar desktop |
| `--sidebar-width-collapsed` | `72px` | collapsed AppSidebar |
| `--sidebar-width-expanded-min` | `240px` | minimum expanded width |
| `--sidebar-item-height` | `40px` | global nav row |
| `--sidebar-padding-x` | `12px` | nav region inset |
| `--sidebar-item-padding-x` | `12px` | row internal inset |
| `--sidebar-icon-size` | `20px` | nav icon |
| `--sidebar-icon-gap` | `10px` | icon/text gap |
| `--sidebar-brand-height` | `56px` | branding slot |
| `--sidebar-footer-min-height` | `56px` | user/footer slot |
| `--header-height` | `56px` | global AppHeader |
| `--page-padding-desktop` | `24px` | page gutters and top/bottom |
| `--page-padding-compact` | `16px` | tablet/mobile gutters |
| `--page-constrained-max` | `1200px` | optional settings/overview variant |
| `--form-content-max` | `720px` | form layout maximum |
| `--control-height-sm/md/lg` | `32/36/40px` | button/input/select variants |
| `--control-padding-x-sm/md/lg` | `12/14/16px` | button horizontal padding |
| `--input-padding-x` | `12px` | Input/Select/Textarea |
| `--button-icon-size` | `16px` | action icon |
| `--button-icon-gap` | `8px` | icon/text |
| `--textarea-min-height` | `80px` | default Textarea |
| `--table-header-height` | `40px` | DataTable header |
| `--table-row-height` | `48px` | standard row minimum |
| `--table-row-height-dense` | `40px` | dense row minimum |
| `--table-cell-padding-x` | `12px` | cell gutter |
| `--badge-height` | `24px` | Badge standard (22px compact variant) |
| `--badge-padding-x` | `8px` | Badge text inset |
| `--menu-item-height` | `36px` | dropdown/select option |
| `--menu-max-height` | `320px` | scroll threshold |
| `--tabs-height` | `40px` | Tabs default (36px compact variant) |
| `--card-padding` | `16px` | default Card (20px roomy variant) |
| `--dialog-width-sm/md/lg/xl` | `400/560/720/960px` | dialog variants, viewport capped |
| `--drawer-width-sm/md/lg` | `360/420/480px` | shared Drawer variants |
| `--inbox-list-width-min/preferred/max` | `320/360/420px` | conversation pane |
| `--inbox-message-min-width` | `480px` | message pane when space allows |
| `--inbox-context-width-default/preferred/max` | `320/360/400px` | context pane; collapses by fit |
| `--inbox-conversation-row-min/preferred` | `64/72px` | list rows |
| `--inbox-message-max-width` | `672px` | bubble absolute cap plus 72% container cap |
| `--inbox-composer-min/max-height` | `56/128px` | autosizing composer |
| `--z-base/sticky/dropdown/drawer/modal/toast/tooltip` | `0/10/30/40/50/60/70` | overlay order |

Typography tokens: `--type-page: 24px/32px 600`, `--type-section: 18px/26px 600`, `--type-subsection: 16px/24px 600`, `--type-body: 14px/20px 400`, `--type-body-medium: 14px/20px 500`, `--type-small: 13px/18px 400`, `--type-metadata: 12px/16px 400`, `--type-button: 14px/20px 500`. Implement these as suitable font-size/line-height/weight custom properties or typography classes; do not set an invalid composite CSS `font` value without a family. Breakpoints: mobile `<640px`, tablet `640–1023px`, desktop `1024–1439px`, large `≥1440px` (CSS media queries rather than raw custom properties where browser support requires).

## 59. Final Component Inventory

| Component(s) | Layer | Responsibility | Allowed dependencies |
|---|---|---|---|
| Button, IconButton | UI | actions/variants/loading | tokens, accessible primitive support |
| Input, Textarea, Select, Checkbox, Radio, Switch, FormField | UI | accessible form controls | tokens, form context |
| Badge, Avatar | UI | status/identity presentation | tokens; no domain APIs |
| Tabs, Tooltip, Popover, DropdownMenu | UI | local disclosure/navigation | tokens, accessibility support |
| Dialog, Drawer | UI | overlays and focus management | tokens, overlay portal |
| Alert, Toast, Skeleton, EmptyState, LoadingState, ErrorState | UI | feedback/data states | tokens, generic slots |
| Pagination, DataTable, SearchInput, FilterBar, Breadcrumb | UI/composition | list navigation/filters | UI primitives, generic callbacks |
| AppShell, AppSidebar, AppHeader | Layout | global shell/navigation | core auth/workspace/nav interfaces, UI |
| PageContainer, PageHeader, PageSection | Layout | standard page frame | UI, tokens |
| SplitPane, DetailPanel, SettingsLayout, ListDetailLayout | Layout | specialized reusable geometry | UI, tokens; no feature API |
| InboxLayout | Inbox feature/layout composition | list/message/context panes | shared layout/UI, Inbox state |
| ConversationList, ConversationRow, ChannelFilter | Inbox feature | conversation navigation | Inbox API/state, UI |
| ConversationWorkspace, MessageTimeline, MessageComposer | Inbox feature | read/reply flow | Inbox API/state, UI |
| CustomerContextPanel | Inbox feature | verified conversation/customer context | Inbox API/state, UI/Drawer |
| API client | Service | auth-aware HTTP transport | core auth, public contracts |
| Feature API modules | Feature | domain endpoint ownership | API client, public contracts |
| Future Customers/Orders/etc. pages | Feature | domain workflows | shared layout/UI, own API modules |

## 60. Final Frontend Architecture Diagram

```text
App bootstrap + route registry
  ├── Core: auth session, workspace, permissions
  ├── Shared UI: tokens → primitives → feedback/forms/tables
  ├── Shared Layout: AppShell → Sidebar + Header + PageContainer
  │                         └── overlay/toast host
  └── Feature routes inside AppShell
      ├── Inbox (CURRENT behavior, TARGET extracted modules)
      │   ├── InboxLayout → ConversationList | MessageWorkspace | Context
      │   └── inbox API/state → shared API client
      ├── Customers/CRM (FUTURE)
      ├── AI + Automation (FUTURE)
      ├── Orders/Products/Inventory/POS (FUTURE)
      ├── Growth + Analytics (FUTURE)
      └── Settings/Channels/Team (FUTURE)

Feature UI → shared layout/UI + own feature API → shared API client → backend
Shared UI ↛ feature internals; global shell ↛ Inbox internals.
```

Every future primary page uses the same shell and base controls. A feature can own workflow and content, but cannot own a parallel design system.
