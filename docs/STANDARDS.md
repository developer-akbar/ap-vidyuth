## Universal App Behaviour Standards

Apply these rules to every screen, component, and interaction in this app.
Stack: React + Vite + Capacitor (Android). Treat these as non-negotiable defaults
unless a specific screen explicitly overrides one.

---

### 1. NAVIGATION & BACK BEHAVIOUR

**Android hardware/gesture back button**
- Every screen that is not the root tab must handle the Android back button
- Use Capacitor's App.addListener('backButton') at the root app level, which broadcasts a custom `app-back-button` event.
- Sub-pages (opened from a nav tab) → go back to their parent tab (e.g. Privacy goes back to Settings).
- Dialogs/modals/bottom sheets MUST listen for the `app-back-button` event and `Escape` key to close themselves, and set `e.detail.handled = true` to prevent the root listener from navigating away.
- If already on a root tab with nothing open → show an "Exit app?" confirm toast,
  second back press within 2s exits the app via App.exitApp()

**Escape key (desktop / keyboard)**
- Every modal, dialog, drawer, bottom sheet, and sub-page must close/go back on Esc
- Add window.addEventListener('keydown', e => { if (e.key === 'Escape') close() })
- Attach in useEffect, remove in cleanup
- Priority order: innermost layer closes first (e.g. a dialog inside a sub-page:
  Esc closes dialog, second Esc goes back to parent page)

**Browser/web back (popstate)**
- On web builds, push a history entry when navigating to a sub-page or opening a modal
- Listen to popstate to handle browser back button the same as Android back
- Replace state on close so the history stack stays clean

**Deep links & shortcuts**
- All deep link URLs (e.g. myapp://action/pay) must be handled in App.jsx via
  CapApp.addListener('appUrlOpen')
- Dispatch a CustomEvent from App.jsx and consume it in the relevant feature component
- Always clean up both the Capacitor listener and the CustomEvent listener

---

### 2. PAGE HEADER — STICKY BEHAVIOUR

- Every page (tab page and sub-page) must have a sticky header
- Use the class page__header--sticky on the header element
- CSS: position: sticky; top: 0; z-index: 30; backdrop-filter: blur(12px);
  background: var(--bg-1); border-bottom: 1px solid var(--border)
- Bleed the header to page edges: margin: -PAGE_PADDING -PAGE_PADDING 20px -PAGE_PADDING
  (where PAGE_PADDING is 24px desktop / 12px mobile)
- Sub-pages with a back button: place a ← icon-btn as the first child of the header,
  followed by the page icon (if any), title, and subtitle
- Never use a fixed header — always sticky so it scrolls with the page container,
  not the viewport
- Mobile breakpoint: adjust bleed margins to match mobile padding (12px)
- If a page has a secondary sticky band below the header (e.g. a summary card),
  give it top equal to the header height and z-index one level below (z-index: 20)

---

### 3. SCROLLING BEHAVIOUR

- The scrolling container is always .main (the shell's main content area)
- Individual page components must NEVER add their own overflow-y: auto or
  overflow-y: scroll — they live inside .main which scrolls
- Exception: modals, dialogs, and bottom sheets may have internal scroll for their
  body content (overflow-y: auto on the body section only, never on the overlay)
- Pull-to-refresh: implement on the root feed/list page using PTR gesture on .main;
  do not add PTR on sub-pages or modals
- Scroll position memory: when navigating back to a tab, restore the scroll position
  (store scrollTop in a ref before leaving, restore in useEffect on return)
- Momentum scrolling on iOS: add -webkit-overflow-scrolling: touch to .main

---

### 4. NAVIGATION TABS (BOTTOM NAV / SIDEBAR)

- Bottom nav is visible on mobile (≤700px); sidebar on desktop
- Active tab highlight must cover ALL states: direct tab match AND any sub-pages
  that belong to that tab (e.g. 'prefix-migration' and 'calculation-settings'
  both highlight the Settings tab)
- Tab switching must reset the sub-page stack: navigating away from a tab and
  back should land on that tab's root page, not its last sub-page
- Never show the bottom nav when a full-screen modal/dialog is open
- Tab labels truncate with ellipsis if too long; never wrap to two lines
- Provide haptic feedback on tab switch on Android:
  import { Haptics, ImpactStyle } from '@capacitor/haptics';
  Haptics.impact({ style: ImpactStyle.Light })

---

### 5. DIALOGS, MODALS & BOTTOM SHEETS

- Always render in a portal (React createPortal to document.body) so z-index
  stacking is predictable
- Overlay: background rgba(0,0,0,0.5), z-index: 100
- Dialog: z-index: 101, max-width: 480px, border-radius: var(--radius-lg),
  centered on desktop; bottom sheet on mobile (slides up from bottom)
- Trap focus inside the dialog while open (use a focus trap hook or library)
- Restore focus to the trigger element on close
- Animate: fade-in overlay + scale-up/slide-up dialog (150ms ease-out)
- Animate out on close before unmounting (100ms ease-in)
- Body scroll lock while dialog is open:
  document.body.style.overflow = 'hidden' on open,
  document.body.style.overflow = '' on close
- Esc key and overlay click both close the dialog (unless isDestructive, then
  only the explicit cancel/close button closes it)
- Never close a destructive confirm dialog on overlay click — require explicit
  button press

---

### 6. FORMS & INPUTS

- All inputs must have visible labels (never placeholder-only)
- Show validation errors inline below the field, not in a toast
- Numeric inputs on Android: use type="number" or type="tel" — never type="text"
  for numbers (avoids IME/keyboard issues)
- inputs inside position:fixed or position:sticky containers on Android cause
  the soft keyboard to push the layout — always use position:sticky (not fixed)
  for headers containing inputs, or move inputs out of fixed containers
- Required field errors appear on first submit attempt, not on blur
- Disable the submit button while a save operation is in progress; re-enable on
  success or failure
- After successful form save: close the dialog/sheet, show a toast, and update
  the UI optimistically where possible

---

### 7. LOADING & EMPTY STATES

- Every async data fetch must have three states: loading, empty, and populated
- Loading: show a skeleton or spinner centred in the content area; never a
  blank white screen
- Empty: show an illustration or icon + a human-readable explanation + a primary
  CTA (e.g. "Add your first service")
- Error: show an error message with a Retry button; log the error to console
- Never show a loading spinner for >3s without a timeout/error fallback
- Optimistic updates: apply UI changes immediately on user action; roll back
  with a toast on failure

---

### 8. TOASTS & FEEDBACK

- Use a single toast system (e.g. react-hot-toast) mounted once at the app root
- Success: green, 2s duration
- Error: red, 4s duration (longer so the user can read it)
- Info/warning: amber, 3s duration
- Never use browser alert() or confirm() — replace with toast + confirm dialog
- Toasts appear above the bottom nav (adjust bottom offset on mobile)
- Max 1 toast visible at a time — queue the rest

---

### 9. OFFLINE & NETWORK STATE

- Detect online/offline via window.addEventListener('online'/'offline') and
  navigator.onLine
- Show a persistent banner at the top of .main when offline:
  "You're offline — showing cached data"
- Disable all network-dependent actions (refresh, pay, sync) when offline; show
  a tooltip explaining why
- Cache last-known data locally (SQLite on Android, IndexedDB on web) so the
  app is usable offline
- Retry failed network requests once automatically when the device comes back online

---

### 10. PERMISSIONS & PRIVACY

**Privacy Policy**
- Must be accessible from the Settings page without login
- Must list every type of data collected, why, and how long it is retained
- Must have a contact email for data deletion requests
- On first launch (or after a policy update), show a dismissible banner linking
  to the policy — not a blocking modal

**Notifications**
- Always request notification permission only after the user has experienced the
  app's value (not on first launch)
- Explain WHY before triggering the OS permission prompt:
  show an in-app pre-prompt card ("We'll notify you when your bill is ready")
- If permission is denied, gracefully degrade — never show an error or block UX
- Provide a toggle in Settings to opt out of notifications without revoking OS
  permission (store preference locally)

**Storage**
- Never store sensitive data (passwords, payment card numbers) in localStorage
  or plain SQLite without encryption
- On Android, use the Capacitor SQLite plugin's encrypted option for sensitive tables
- Provide a "Clear all data" option in Settings → Data Management that wipes
  all local storage and resets the app to first-launch state

---

### 11. DATA MANAGEMENT

- **Backup / Export**: Settings → Data Management must offer:
  - Export as JSON (human-readable, importable)
  - Export as CSV (for spreadsheet use)
  - Share via native share sheet on Android, download on web
- **Restore / Import**: accept the same JSON format; validate before importing;
  show a preview of what will be imported; require explicit confirm
- **Wipe**: "Clear all data" with a destructive confirm dialog (type "DELETE" or
  tap confirm twice); this must be irreversible and clearly labelled
- Auto-backup prompt: after 10+ records exist, suggest enabling auto-backup to
  Google Drive or local file — never do it silently

---

### 12. USER PREFERENCES

Store all preferences in a persistent key-value store (db.setSetting / IndexedDB).

**Required preferences every app should support:**
- Theme: dark / light / system (default: system)
- Language / locale (if multi-language)
- Notification opt-in per category (e.g. bill alerts, reminders)
- Default landing tab / page
- Data display density: comfortable / compact (if the app has lists)

**Preference rules:**
- Apply preferences immediately on change — no save button needed
- Preferences survive app updates (never wipe them on version bump)
- On fresh install, apply system theme automatically
- Export / import must include preferences in the backup payload

---

### 13. ACCESSIBILITY

- Every interactive element must have an aria-label or visible text label
- Touch targets minimum 44×44px on mobile
- Focus ring must be visible in keyboard navigation mode (never outline: none
  without a replacement style)
- Colour contrast minimum 4.5:1 for body text, 3:1 for large text / UI components
- Never convey information by colour alone — always pair with an icon or text
  (e.g. red "overdue" badge must also say "Overdue", not just be red)
- Support system font size scaling — never use px for font sizes in body text;
  use rem or clamp()
- Provide alt text for all meaningful images and icons used as buttons

---

### 14. PERFORMANCE

- Lazy-load all route-level components (React.lazy + Suspense with a fallback)
- Virtualise any list with >50 items (use react-window or similar)
- Debounce search/filter inputs (300ms)
- Memoize expensive derived data with useMemo; memoize stable callbacks with
  useCallback when passed to child components
- Never block the main thread during DB reads — always async/await
- Images: use WebP, set explicit width/height to avoid layout shift, lazy-load
  below the fold
- First contentful paint target: <1.5s on mid-range Android (Moto G series)

---

### 15. ANDROID-SPECIFIC

- Status bar: set background colour to match the app header on each page
  using Capacitor StatusBar plugin
- Safe area insets: always pad the bottom nav and fixed elements with
  env(safe-area-inset-bottom) for gesture-navigation Android devices
- Splash screen: hide it only after the first meaningful data is loaded,
  not on DOM ready (prevents flash of empty state)
- Keyboard avoidance: set android:windowSoftInputMode="adjustResize" in
  AndroidManifest.xml so the layout reflows when the soft keyboard appears
- App version: display current version (from package.json) in Settings → About;
  include build number
- Install prompt (PWA): intercept beforeinstallprompt, store it, and offer
  "Add to Home Screen" from Settings or a contextual nudge — never auto-prompt

---

### HOW TO USE THIS PROMPT

When starting a new screen or feature, prefix your request with:
"Following the Universal App Behaviour Standards:" and then describe the feature.

When reviewing existing code, ask:
"Audit this component against the Universal App Behaviour Standards and list
every violation with a suggested fix."