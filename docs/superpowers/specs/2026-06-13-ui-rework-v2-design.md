# ccw UI Rework v2 — Hybrid (Atelier + Glass)

**Date:** 2026-06-13
**Status:** Approved direction, ready to plan
**Supersedes:** v1 (modern dashboard, cyan sidebar, topbar) — already implemented, uncommitted

## 1. Context

The v1 rework shipped a clean modern dashboard (Radix + Tailwind 4 + dark/light tokens, cyan brand, persistent sidebar). User feedback: "the v1 is fine but rework it totally one more time — make it different." This v2 does not preserve v1's visual identity. We keep v1's component library primitives (Radix, cva, cmdk, lucide) and stack (React 19, Vite 7, TypeScript), but the layout, navigation, and visual language are replaced.

The new direction: **Atelier (warm, krem, rounded, friendly) as the base, Glass (frosted + warm gradient) as accent on hero and key callouts only.** Glass is a *moment*, not a theme. Forms, tables, and long copy never use glass — readability beats aesthetic flourish.

## 2. Design Principles

1. **Calm surfaces, vivid moments.** 90% of every page is Atelier. Glass appears once or twice — hero, success, or one callout. Never a full glass page.
2. **Two typefaces, one voice.** Display: serif (Fraunces or system Georgia). Body: sans (Inter / system-ui). Use serif for h1, page intros, and key numbers; sans everywhere else.
3. **Hairline > shadow.** Borders are 1px solid `--border`. Shadows are *layered and soft* (two layers: 1px tight, 12px loose) — used only on cards lifted off the page (modals, popovers, hero).
4. **Density = function.** Forms and tables are dense. Marketing surfaces (Dashboard hero, empty states, preset cards) are generous. The page reads where it is from the density alone.
5. **Status through color, not chrome.** State is communicated by accent (`--accent`, `--success`, `--danger`), not by background fills or border weights. The same Provider card looks identical when active or inactive — only the pill color changes.
6. **No iconography where text works.** The shell has a logo, a search affordance, and a theme toggle — that's it. Route names are words, not glyphs. Settings rows are sentences, not icon buttons with tooltips.

## 3. Design System

### 3.1 Color tokens

Replace v1's cyan-on-dark tokens with warm-tone tokens. All values OKLCH.

**Atelier (base, light-first):**

| Token | Light value | Dark value | Use |
|---|---|---|---|
| `--paper` | `oklch(0.965 0.012 80)` | `oklch(0.16 0.015 60)` | Page background |
| `--surface` | `oklch(1 0 0)` | `oklch(0.21 0.018 60)` | Card background |
| `--surface-2` | `oklch(0.975 0.008 80)` | `oklch(0.26 0.02 60)` | Nested card / hover |
| `--ink` | `oklch(0.22 0.02 60)` | `oklch(0.96 0.008 80)` | Primary text |
| `--ink-muted` | `oklch(0.45 0.02 60)` | `oklch(0.72 0.012 70)` | Secondary text |
| `--ink-subtle` | `oklch(0.62 0.018 60)` | `oklch(0.5 0.015 60)` | Tertiary / metadata |
| `--line` | `oklch(0.91 0.01 75)` | `oklch(0.32 0.02 60)` | Borders (1px) |
| `--line-strong` | `oklch(0.84 0.015 75)` | `oklch(0.4 0.025 60)` | Emphasized borders |
| `--ring` | `oklch(0.72 0.13 60 / 35%)` | `oklch(0.78 0.15 75 / 40%)` | Focus ring |

**Accent (Champagne gradient, used on CTA buttons, brand mark, glass overlay):**

| Token | Value | Use |
|---|---|---|
| `--accent-1` | `oklch(0.92 0.05 80)` | Champagne top |
| `--accent-2` | `oklch(0.82 0.08 75)` | Champagne mid |
| `--accent-3` | `oklch(0.68 0.1 65)` | Bronze bottom |
| `--accent-fg` | `oklch(0.99 0 0)` | Text on accent (white) |

CTA gradient: `linear-gradient(135deg, var(--accent-2), var(--accent-3))` for solid; `--accent-1` only for hover state.

**Semantic (status):**

| Token | Light | Dark | Use |
|---|---|---|---|
| `--success` | `oklch(0.55 0.08 150)` | `oklch(0.7 0.12 150)` | "online", active pills |
| `--warning` | `oklch(0.7 0.12 75)` | `oklch(0.78 0.13 75)` | Thresholds, attention |
| `--danger` | `oklch(0.55 0.18 25)` | `oklch(0.7 0.18 25)` | Errors, delete confirm |

**Glass (special, only on hero / callout / success toast):**

| Token | Value | Use |
|---|---|---|
| `--glass-bg` | `linear-gradient(135deg, rgba(255,255,255,0.72), rgba(255,255,255,0.42))` (light) / `linear-gradient(135deg, rgba(45,40,32,0.65), rgba(45,40,32,0.4))` (dark) | Glass surface |
| `--glass-border` | `oklch(0.82 0.08 75 / 22%)` (light) / `oklch(0.7 0.08 75 / 18%)` (dark) | 1px hairline |
| `--glass-glow` | `radial-gradient(circle, oklch(0.85 0.08 80 / 35%), transparent 70%)` | Corner glow (warm, not purple) |
| `--glass-blur` | `20px` | `backdrop-filter: blur()` |

**Rule for using glass:** if the surface is read in 3 seconds or less (hero, callout, success toast, primary CTA card) and isn't form-like, glass is allowed. Otherwise, Atelier.

### 3.2 Typography

| Role | Family | Size / Line | Weight | Tracking | Notes |
|---|---|---|---|---|---|
| Display (h1, hero) | Fraunces (Google Font) → Georgia fallback | 32/40 | 500 | -0.02em | Slight optical-size variation |
| Section title (h2) | Same serif | 20/28 | 500 | -0.01em | |
| Card title | Inter / system-ui | 14/20 | 500 | 0 | |
| Body | Inter / system-ui | 13/20 | 400 | 0 | |
| Body strong | Inter / system-ui | 13/20 | 500 | 0 | |
| Label (uppercase) | Inter / system-ui | 10/14 | 500 | +0.1em | Used for stat captions, breadcrumb segments |
| Footnote / meta | Inter / system-ui | 11/16 | 400 italic | 0 | For "anthropic · openai · google" tags |
| Mono (code, paths) | JetBrains Mono → ui-monospace | 12/18 | 400 | 0 | Used for API URLs, model IDs, log lines |

Fallbacks matter: Fraunces and Inter may not load offline or in tests. Always declare system fallbacks. The serif look degrades gracefully to Georgia; the sans degrades to system-ui.

### 3.3 Spacing & rhythm

8px baseline grid. Allowed values: `4 · 8 · 12 · 16 · 24 · 32 · 48 · 72 · 96`. No in-between magic numbers. Tailwind's default scale is fine; extend with the missing values via `tailwind.config.ts` or inline arbitrary `p-[18px]` only when truly needed (and discouraged).

Card padding: 16px (compact) or 24px (generous). Page padding: 32px desktop, 20px mobile.

Vertical rhythm between sections: 32px (within page) or 64px (between major page sections, e.g. Dashboard stats → router map).

### 3.4 Corner radius

`--radius-sm: 6px` (inputs, tags)
`--radius-md: 10px` (cards, list items)
`--radius-lg: 14px` (modals, hero glass)
`--radius-xl: 20px` (hero glass only when generous)

### 3.5 Shadow (only on lifted surfaces)

```css
--shadow-card: 0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.04);
--shadow-modal: 0 20px 60px rgba(0,0,0,0.12), 0 4px 12px rgba(0,0,0,0.06);
--shadow-glass: 0 8px 24px oklch(0.85 0.08 80 / 0.18), 0 2px 6px rgba(0,0,0,0.04);
```

Use only `--shadow-card` for cards at rest, `--shadow-modal` for popovers/dialogs, `--shadow-glass` for the glass hero. Do not add shadows on hover (use `--surface-2` for hover state instead).

### 3.6 Motion

Page transitions: 200ms cross-fade. Route content swaps with no slide.
Card hover: background-color change to `--surface-2`, no transform.
Modal: 180ms scale 0.96→1 + fade. No spring.
Glass hero on first paint: 600ms fade-in with 8px translateY settle.
No bouncy animations, no parallax, no autoplay. Reduced-motion media query disables all motion.

### 3.7 Iconography

Lucide icons (already in stack) at 16px stroke 1.5 for inline, 20px stroke 1.5 for buttons. The shell uses almost none — logo, command palette glyph, theme toggle, status dot. Page content uses icons sparingly: search, external link, copy, trash. Never decorative-only.

## 4. Shell & navigation

### 4.1 Layout

A single horizontal bar at the top of the page — *not* a sidebar. Below it, the main content area scrolls.

```
┌───────────────────────────────────────────────────────┐
│ [logo] ccw  Dashboard · Providers · Router · …    ⌘K  │  ← top bar (60px)
├───────────────────────────────────────────────────────┤
│                                                       │
│              page content (max-width 1100px)          │
│                                                       │
└───────────────────────────────────────────────────────┘
```

### 4.2 Top bar

- Height: 60px.
- Left: brand mark (small gradient square) + "ccw" wordmark in serif 14px.
- Center-left: nav links inline, separated by 18px gaps. Active link is `--ink` bold; inactive is `--ink-muted`.
- Right: ⌘K search trigger, theme toggle (sun/moon glyph), avatar (24px circle, gradient).
- Background: `--paper` (matches page).
- Border: 1px `--line` only on the bottom edge.
- No icons in nav links. No "section headers" (v1 had Workspace/Tools groups — remove).

### 4.3 Command palette

`⌘K` opens a cmdk palette centered on screen (not fullscreen). Search input at top, results below grouped by section: Navigation, Actions, Recent. Glass background, 14px radius, `--shadow-glass`. Selecting a route navigates; selecting an action runs it.

### 4.4 Page structure

Every page follows:

```
[page header]
  ↳ h1 (serif) + subtitle (sans, italic-muted)
  ↳ right-aligned primary action button (gradient)

[page body]
  ↳ at most 1 hero glass card (Dashboard, Presets market, Login)
  ↳ 0–n atelier cards in a single column or grid
  ↳ empty state centered, large mark + sentence + CTA
```

## 5. Page-by-page direction

### 5.1 Login

Full-viewport centered. Single glass card, 380px wide, contains the lockup: brand mark + "Sign in to your account" + subtitle + API key input + "Sign in" button (gradient). Below: small footnote with version. No nav, no chrome. This is the only page that is mostly glass.

### 5.2 Dashboard

- **Hero (glass):** Gateway status dot, big serif headline ("Your gateway is online and routing."), one-sentence summary in muted ink, and right-aligned `142 req/s` metric.
- **Stats row (atelier):** 4 cards in a row — Providers, Models, Routes, Transformers. Each shows a label, a serif number, a footnote in italic-muted.
- **Router map (atelier):** a card containing a list of routes. Each row: small uppercase label, model name in serif, provider tag right-aligned. "Edit" link top-right of card.
- **Quick actions (atelier):** 3 small cards in a row linking to Providers, Presets, Transformers.
- **Empty variant:** if no providers, the stats collapse to a single glass hero "Add your first provider" with a primary CTA. The empty state replaces the stats and router map.

### 5.3 Providers

- **Header:** h1 "Providers" + subtitle + right-aligned "Add provider" gradient button.
- **Search:** inline search field at the top of the list, sticky inside the list card. "X of Y" count next to it.
- **List:** rows in a single card (no internal borders between rows except 1px `--line` dividers). Each row: avatar (gradient square with first letter, model color), name + meta on left, status pill (active/inactive, success/warning) on right, kebab menu (edit/delete) on far right.
- **Add/Edit modal:** glass hero small, then form fields stacked. Fields use atelier inputs (1px border, `--surface-2` background). Modal footer: Cancel text-link + Save gradient button. Save & Test in primary if user wants to verify connectivity inline.
- **Empty:** centered glass hero "No providers yet" + Add provider button. Below: a sentence about presets.

### 5.4 Router

- **Header:** h1 "Router" + subtitle explaining the role.
- **Routes grid:** one atelier card per route type (Default, Background, Think, Long context, Web search, Image). Each card: uppercase label, current model or "Unassigned" in serif italic-muted, a combobox to change. Threshold input on Long context card.
- **Helper sentence** at the bottom: "ccw routes each request to the model that fits its kind. The default applies to anything that doesn't match a more specific rule."

### 5.5 Transformers

- **Header:** h1 + subtitle + "Add transformer" button.
- **List:** cards in a 1–2 column grid. Each card: name, path, options count badge, kebab menu.
- **Add/Edit modal:** fields for name, path, options (JSON code editor via Monaco), parameters (key/value pair editor).

### 5.6 Presets

- **Tabs:** "Installed" / "Market" inline at top, active tab underlined with accent.
- **Installed tab:** list of installed presets as rows. Each row: name, author, version, kebab menu.
- **Market tab:** a grid of preset cards. Each card: name (serif), author, short description, "Install" button. Glass hero at the top showing featured / latest.
- **Install dialog:** when installing from URL, a modal with form: repository URL, optional name. On submit, fetches details and shows another modal with required secrets.
- **Detail dialog:** a modal showing full preset metadata (author, repo, license, keywords) and required config form. "Apply preset" button gradient.

### 5.7 Logs

- **Header:** h1 "Log files" + subtitle.
- **Layout:** left column = file list (compact atelier), right column = selected file content (monospace, `--paper` background, no chrome). Resizable divider between them.
- **Toolbar above content:** file size, group-by-request toggle, download, clear.
- **Grouped view:** if grouped, content shows expandable request groups. Each group: request ID header + nested log lines.

### 5.8 Debug

- **Two-pane layout:** top pane = request (method dropdown + URL + headers/body Monaco), bottom pane = response (status + headers + body Monaco). Toolbar at top: Send button (gradient), history drawer trigger.
- **History drawer:** slides in from the right (40% viewport width, glass background). List of past requests, click to restore.

### 5.9 Settings

- **Single column.** Each section is an atelier card: title in serif, description in muted, fields below.
- **Sections:** Logging, Server, Authentication, Claude, Advanced, Status line (the latter is the existing statusline configurator).
- **Save:** a sticky bottom bar appears when changes are unsaved: "X changes" + Save / Save & restart buttons.

## 6. Component library

Reuse the v1 primitives where they fit. Adapt where v1 was cyan/dark-first.

| Component | v1 | v2 change |
|---|---|---|
| `Button` | cyan solid / outline / ghost | Replace cyan with accent gradient. Outline uses `--line-strong`. Ghost text-only with hover background. |
| `Card` | dark surface, soft border | `--surface` (white-ish) in light mode, `--line` border, `--shadow-card` |
| `Input` | cyan focus ring | `--ring` warm. Background `--surface-2` on default, white when focused. |
| `Modal/Dialog` | full dark with backdrop | Glass background on backdrop, atelier surface on dialog, `--shadow-modal` |
| `Tabs` | cyan underline | Accent underline, label-only, no chrome |
| `Tooltip` | dark, cyan border | Warm dark in light mode, white in dark mode |
| `Toast` | dark, success/danger colors | Atelier surface for danger/success, glass for top-line "Saved" toasts (limited use) |
| `Combobox` | dark dropdown | Atelier surface, accent text for selection |
| `Switch` | cyan track | `--line` track off, accent gradient on |
| `Empty state` | icon + text | Large serif sentence + small muted sub + CTA, optionally inside a glass card |
| `Status pill` | small dot + label | Small dot + uppercase label, only 2px tall, no fill background |
| `Avatar` | letter in circle | Gradient square (10px radius) with letter, 28px default size |
| `Stat card` | big number + label | Serif number (32px) + uppercase label + italic-muted footnote |
| `Command palette` | cyan-tinted | Glass surface, accent active row |
| `Theme toggle` | sun/moon | Same, but smaller (16px) and inline in the top bar |

## 7. Dark mode

Inherit the v1 dark/light mechanism (`.dark` / `.light` class on `<html>`, persisted in localStorage). Differences from v1:

- v1 defaulted to dark. v2 defaults to **light** (the Atelier hero is paper-warm; that experience is the headline).
- The dark mode of v2 is paper-inverted: background becomes warm-charcoal (`oklch(0.16 0.015 60)`) instead of cold-blue (`oklch(0.14 0.006 245)`).
- The brand mark still uses the same accent gradient in both modes. The glass hero inverts its tint (warmer dark glass in dark mode).
- First-paint theme application: same v1 anti-flash approach (`applyTheme` before React mount).

## 8. i18n

Keep v1's `en.json` / `zh.json` keys. Add new keys for: page intros, hero copy, stat captions, status pill labels. Don't translate brand strings ("ccw", "Dashboard") or technical terms ("anthropic", "openai"). Allow interpolation in hero copy (`{{reqCount}} requests today`).

## 9. Implementation order

1. **Design system tokens** — replace `index.css` tokens. Verify light/dark parity.
2. **Component library update** — Button, Card, Input, Modal first. Higher-level components (Stat card, Avatar) last.
3. **Shell** — new top bar, new `AppShell` composition. Update Sidebar → inline nav in top bar.
4. **Page-by-page, in this order:** Login → Dashboard → Providers → Router → Settings → Transformers → Presets → Logs → Debug → 404.
5. **i18n keys** — added per page during page work, not as a separate pass.
6. **Polish** — focus states, reduced-motion, keyboard nav, mobile breakpoints.

## 10. Out of scope

- New features (no new routes, no new transformers, no new config sections).
- Backend changes (the config schema is unchanged; v2 only reshapes the UI surface).
- Documentation site rework (separate effort; not bundled).
- Mobile app or PWA features.
- Theming beyond light/dark (no "high contrast" or "system accent color picker" in this rework).

## 11. Open questions deferred to implementation

- Fraunces font load: bundle locally (woff2 in `public/`) or fetch from Google? Bundle recommended for offline-first (matches the gateway's "control panel" mental model).
- Statusline configurator page: keep the v1 visual or rebuild? Recommendation: rebuild using v2 system, since the page is form-heavy and benefits from atelier consistency.
- Auto-save vs explicit save in Settings: keep explicit-save-with-sticky-bar (v1 behavior). Do not introduce auto-save.
- Provider avatar color: deterministic from name hash, or static brand colors? Recommendation: deterministic from hash, mapped to a curated warm palette (8–10 swatches, no neon).
