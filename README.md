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
- `POST /api/commands/map` returns `/map` reply content and rendered map file data.
- `POST /api/commands/territory` returns `/territory` data and rendered focus map file data.
- `POST /api/commands/leaderboard-image` returns rendered leaderboard image page data.
- `GET /api/render/player?username=<ign>` returns a player card PNG.
- `POST /api/render/leaderboard-card` returns a leaderboard card PNG.
- `POST /api/render/territory-map` returns a territory map JPEG.
- `POST /api/render/territory-neighborhood-map` returns a focused territory JPEG.
- `POST /api/sync/guild-raids` runs the guild raid database sync and returns changed rows.
- `POST /api/sync/territories` runs the territory database sync and returns territory changes.

The sync endpoints require `ETKWYNN_SYNC_API_SECRET` on the API and the same value from the bot via
`X-ETKWynn-Sync-Secret` or `Authorization: Bearer <secret>`.

## Deploying to Vercel

1. Import this directory as the Vercel project root.
2. Add environment variables from `.env.example` as needed.
3. Deploy. Vercel will compile the TypeScript files under `api/` as serverless functions.
