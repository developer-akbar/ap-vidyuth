# AP Vidyuth — Claude Code Context

## Quick reference
- App: AP Vidyuth — APSPDCL electricity bill tracker
- Package ID: com.akbar.apvidyuth
- Stack: React 18 + Vite + Capacitor 5 + SQLite
- Repo: developer-akbar/ap-vidyuth

## Standards & architecture
- Full behaviour standards: docs/STANDARDS.md
- App architecture & folder structure: docs/ARCHITECTURE.md

## Rules for every response
- Return only the files that changed — never the full repo
- Never return a zip unless explicitly asked
- Preserve all existing CSS variable names, db.setSetting() patterns,
  and the .main scroll container rule
- All pages must have page__header--sticky on their header element
- Never add overflow-y to page-level components
- Check docs/STANDARDS.md before implementing any new screen or feature
