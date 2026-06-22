---
name: Vidyuth Indigo
colors:
  surface: '#f7f9fb'
  surface-dim: '#d8dadc'
  surface-bright: '#f7f9fb'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f4f6'
  surface-container: '#eceef0'
  surface-container-high: '#e6e8ea'
  surface-container-highest: '#e0e3e5'
  on-surface: '#191c1e'
  on-surface-variant: '#464555'
  inverse-surface: '#2d3133'
  inverse-on-surface: '#eff1f3'
  outline: '#777587'
  outline-variant: '#c7c4d8'
  surface-tint: '#4d44e3'
  primary: '#3525cd'
  on-primary: '#ffffff'
  primary-container: '#4f46e5'
  on-primary-container: '#dad7ff'
  inverse-primary: '#c3c0ff'
  secondary: '#4648d4'
  on-secondary: '#ffffff'
  secondary-container: '#6063ee'
  on-secondary-container: '#fffbff'
  tertiary: '#41485e'
  on-tertiary: '#ffffff'
  tertiary-container: '#586076'
  on-tertiary-container: '#d4dbf5'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e2dfff'
  primary-fixed-dim: '#c3c0ff'
  on-primary-fixed: '#0f0069'
  on-primary-fixed-variant: '#3323cc'
  secondary-fixed: '#e1e0ff'
  secondary-fixed-dim: '#c0c1ff'
  on-secondary-fixed: '#07006c'
  on-secondary-fixed-variant: '#2f2ebe'
  tertiary-fixed: '#dae2fd'
  tertiary-fixed-dim: '#bec6e0'
  on-tertiary-fixed: '#131b2e'
  on-tertiary-fixed-variant: '#3f465c'
  background: '#f7f9fb'
  on-background: '#191c1e'
  surface-variant: '#e0e3e5'
  bg-sidebar: '#ffffff'
  surface-card: '#ffffff'
  surface-inner: '#f1f5f9'
  border-subtle: rgba(15, 23, 42, 0.05)
  border-medium: rgba(15, 23, 42, 0.10)
  text-secondary: '#475569'
  text-muted: '#64748b'
  badge-due-bg: '#fee2e2'
  badge-due-fg: '#e11d48'
  badge-paid-bg: '#d1fae5'
  badge-paid-fg: '#059669'
  chart-cyan: '#0891b2'
  chart-violet: '#7c3aed'
typography:
  display-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 30px
    fontWeight: '800'
    lineHeight: 36px
    letterSpacing: -0.03em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 20px
    fontWeight: '700'
    lineHeight: 24px
    letterSpacing: -0.01em
  amount-hero:
    fontFamily: Plus Jakarta Sans
    fontSize: 28px
    fontWeight: '800'
    lineHeight: 32px
    letterSpacing: -0.03em
  amount-hero-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 22px
    fontWeight: '800'
    lineHeight: 28px
    letterSpacing: -0.03em
  body-base:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 22px
  body-bold:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 22px
  label-caps:
    fontFamily: Plus Jakarta Sans
    fontSize: 11px
    fontWeight: '700'
    lineHeight: 14px
    letterSpacing: 0.05em
  mono-data:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.02em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 4px
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  gutter: 14px
  margin-mobile: 12px
  margin-desktop: 24px
---

## Brand & Style

The design system for this utility application is defined by a **Corporate Modern** aesthetic with a specific focus on **High-Density SaaS** patterns. It prioritizes information architecture and rapid data scanning for power users managing multiple utility accounts. 

The brand personality is technical, reliable, and precise. It utilizes a "Dark Slate + Indigo" palette to convey a sense of modern infrastructure and financial stability. The interface relies on structural grid alignment, meticulous metric hierarchies, and subtle tactile feedback—such as scale-down transforms on interaction—to feel responsive and premium.

**Key Stylistic Pillars:**
- **Information Density:** Content is grouped into structured cards and grids that maximize screen real estate without sacrificing legibility.
- **Technical Precision:** Use of monospaced fonts for numerical data highlights the "utility" nature of the product.
- **Glassmorphism Lite:** Sticky headers employ background blurs to maintain context during scroll operations.
- **High-Contrast Semantics:** Clear color-coding for bill statuses (Paid, Due, Pending) ensures immediate user comprehension.

## Colors

The color system is built on a foundation of cool slates and vibrant indigos. It supports both light and dark modes, though the default state is a clean, high-contrast light mode.

- **Primary & Secondary:** Indigo serves as the "Brand Active" color, used for primary actions, selected states, and focus indicators.
- **Neutral & Surface:** A multi-tiered neutral palette (`#f8fafc` to `#e2e8f0`) creates depth without relying on heavy shadows. `surface-card` is used for primary content containers, while `surface-inner` defines nested data sections like metric grids.
- **Semantic Mapping:** Colors are strictly tied to status. Red indicates urgent dues, green indicates successful payments, and amber is reserved for tariff warnings or consumption spikes.
- **Interactive States:** Primary buttons use the indigo base, while "Ghost" variants utilize secondary text colors that shift to primary on hover.

## Typography

Typography in this design system is split between **Plus Jakarta Sans** for interface elements and **JetBrains Mono** for data-heavy strings (service numbers, units, and currency).

- **Hierarchy:** We use an Extra-Bold (`800`) weight for large currency displays and page titles to provide visual "punch" against dense data grids.
- **Captions & Labels:** Small labels utilize `label-caps` (all-caps, bold, increased tracking) to ensure legibility on low-resolution mobile screens.
- **Data Display:** Account numbers, usage units, and timestamps must always use the `mono-data` role to ensure characters align vertically in lists and tables.
- **Responsiveness:** Hero amounts scale down by roughly 20% on mobile viewports to prevent text wrapping in service cards.

## Layout & Spacing

The system follows a disciplined **4px grid** for internal component spacing and a **Fluid Grid** model for page layouts.

- **Grid Model:** Service cards are arranged in a responsive grid using `repeat(auto-fill, minmax(340px, 1fr))`. This ensures cards remain a consistent size while filling the horizontal space on large monitors.
- **Desktop Layout:** Features a fixed-width sidebar (224px) and a standard page gutter of 24px.
- **Mobile Layout:** At breakpoints below 700px, the sidebar is hidden in favor of a 56px fixed bottom navigation bar. Page margins compress to 12px to maximize horizontal space for cards.
- **Compact Mode:** A utility class (`.shell--compact`) can be applied to reduce global spacing units (e.g., changing `lg` from 16px to 12px) for high-density monitoring.

## Elevation & Depth

This design system uses **Tonal Layers** and **Subtle Outlines** rather than heavy shadows to indicate hierarchy.

- **Surface Tiers:** Backgrounds use `--bg`, while interactive cards use `--surface`. Nested structures (like usage breakdowns) use a darker tint (`--surface-2`) to create "wells" within the card.
- **Borders:** Hierarchy is defined by border contrast. Use `--border-subtle` for standard dividers, `--border-medium` for interactive field boundaries, and `--border-hi` for modal or floating dialog edges.
- **Interaction Elevation:** On hover, cards should translate `-1px` on the Y-axis and increase shadow depth slightly. 
- **Sticky Blur:** Fixed headers must use a `12px` backdrop-filter blur to maintain a sense of translucency and depth while scrolling.

## Shapes

The shape language is consistently **Rounded**, reflecting the approachable yet modern SaaS aesthetic.

- **Primary Cards:** Use `rounded-lg` (16px) for main service cards and modals.
- **Input Fields & Buttons:** Use `rounded-sm` (8px) to maintain a crisp, professional look for interactive elements.
- **Badges:** Status labels use `rounded-full` (pill-shaped) to distinguish them from structural buttons.
- **Status Dots:** Pure circles are used for real-time status indicators (Live/Due/Paid).

## Components

### Buttons
- **Primary:** Solid indigo background with white text. Height: 38px (Desktop) / 44px (Mobile).
- **Secondary:** Light gray surface with a medium border.
- **Icon Buttons:** 32px square hit areas. On mobile, use a negative margin offset to maintain visual alignment while keeping a 44px touch target.

### Service Cards (`.scard`)
- **Structure:** Vertical stack including Header (Name + Status), Hero (Amount + QR Code), Metrics Grid (3-column units/date/sync), and Action Bar.
- **Status Stripes:** A glowing neon dot on the top left indicates status (e.g., pulsing red for "Due").

### Inputs & Forms
- **Standard Field:** 42px height with a soft gray background. Labels are bold, uppercase, and positioned 6px above the input.
- **Segmented Controls:** Pill-shaped sliders used for toggling between "Current Bill" and "Usage Trends."

### Usage Charts
- **Styling:** Use 2px stroke widths for line charts with a semi-transparent indigo area fill (`--primary-dim`). Use semantic colors (Cyan/Violet/Orange) for multi-segment bill breakups.

### Navigation
- **Bottom Nav (Mobile):** 56px height. Active icons scale to `1.1x` to provide visual confirmation.
- **Sidebar (Desktop):** Vertical stack with 2px gaps between items. Active items use a tinted background and indigo text.