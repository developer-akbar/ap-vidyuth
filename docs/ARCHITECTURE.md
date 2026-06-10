# Vidyut — Architecture Reference

## Stack
React 18 + Vite + Capacitor 6 + SQLite (via @capacitor-community/sqlite)
Deployed: Vercel (API) + GitHub (source)
Package ID: com.akbar.apvidyuth

## Folder structure
src/
  app/           App.jsx — shell, routing, bottom nav
  features/
    electricity/ — all electricity feature code
      components/  ServiceCard, ApplianceCalculator, BillCalculator...
      hooks/       useElectricityServices
      utils/       billing.js, qrcode.js, notifications.js
    settings/    PrivacyPolicy, PrefixMigration, BackupRestore
  shared/
    components/  Loader, ConfirmDialog
    db/          storage.js — db.getSetting / db.setSetting
    utils/       formatInr, formatDate, getDueTone
  styles/        global.css — single CSS file, CSS variables only
  locales/       en/, te/ — i18next JSON

## Key rules
- .main is the ONLY scroll container — no overflow on page components
- All colours via CSS variables (var(--primary), var(--text-1) etc.)
- All persistence via db.getSetting(key) / db.setSetting(key, value)
- All pages have page__header--sticky header
- i18n: every user-visible string uses useTranslation() / t('key')
- Changed files only — never return full zips unless asked