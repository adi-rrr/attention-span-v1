# Attention Span

Intentional save-for-later app. Specs: `architecture.md`, `product-spec.md`.

## Repo layout

```
apps/
  api/          # Fastify + Postgres (P0+)
  mobile/       # Expo React Native (P0+)
db/
  migrations/   # SQL schema
docs/
  api-contracts.yaml
```

## Quick start (API)

```bash
cd apps/api
cp .env.example .env
npm install
npm run dev
```

Needs Postgres. Apply schema:

```bash
psql "$DATABASE_URL" -f ../../db/migrations/001_init.sql
```

## Build order

1. **P0** Auth, Save CRUD, preview, share → Understand screen  
2. **P1** Understand LLM + skip + folder after last Q  
3. **P2** Folders + weighted search  
4. **P3** Reminders  
5. **P4** Map  
6. **P5+** Calendar, selective offline, conflicts  
