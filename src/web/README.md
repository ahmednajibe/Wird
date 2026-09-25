# Web UI (Phase 2)

Reserved for the Vite + React app. It will build into `dist/web`, which the
server serves in production with an SPA fallback. The UI can import the pure
engine and types from `src/shared` (imports use `.js` extensions, which Vite
resolves to the `.ts` sources). During development, proxy `/api` to
`http://127.0.0.1:4545`.
