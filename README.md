# etkwynn-api

Serverless Node.js API using TypeScript, structured for Vercel hosting.

## Scripts

- `npm run build` type-checks the API.
- `npm run typecheck` runs the same TypeScript validation.

For local development, run Vercel directly:

```bash
npx vercel dev
```

## Endpoints

- `GET /api` returns API metadata.
- `GET /api/health` returns a health check payload.
- `GET /api/player/summary?username=<ign>` returns player view metadata for Discord menus.
- `GET /api/territory/names` returns territory names for autocomplete.
- `POST /api/commands` dispatches command operations from the request body:
  `type: "map" | "territory" | "leaderboard-image"`.
- `POST /api/render` dispatches render operations from the request body:
  `type: "player" | "leaderboard-card" | "territory-map" | "territory-neighborhood-map"`.
- `POST /api/sync` dispatches sync operations from the request body:
  `type: "guild-raids" | "territories"`.

The sync endpoints require `ETKWYNN_SYNC_API_SECRET` on the API and the same value from the bot via
`X-ETKWynn-Sync-Secret` or `Authorization: Bearer <secret>`.

## Deploying to Vercel

1. Import this directory as the Vercel project root.
2. Add environment variables from `.env.example` as needed.
3. Deploy. Vercel will compile the TypeScript files under `api/` as serverless functions.
