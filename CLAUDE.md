# WoW Arena Logs — CLAUDE.md

WoW arena combat logging and analysis platform. Desktop Electron app records local logs; web platform hosts match browsing, analytics, and AI-powered cooldown analysis.

## Monorepo Structure

NPM workspaces with 9 packages under `packages/`:

| Package | Type | Purpose |
|---------|------|---------|
| `parser` | Library | Parses WoW combat log text into structured data. Published to npm as `@wowarenalogs/parser`. |
| `shared` | Library | Shared React UI components, GraphQL client, utilities, and static data. |
| `web` | Next.js 15 app | Public website: match browser, user profiles, combat reports, API routes. |
| `app` | Electron 38 app | Desktop app. Loads `web` in a BrowserWindow; adds `window.wowarenalogs` IPC bridge. |
| `cloud` | Cloud Functions | GCP serverless functions: log ingestion, parsing, Firestore writes, stat aggregation. |
| `recorder` | Library | Video recording via OBS bindings + FFmpeg transcoding. |
| `sql` | ORM config | Prisma schema + migrations for CockroachDB. |
| `tools` | Scripts | Data generation: spell metadata from Wago.tools, talent ID maps, spell ID lists. |
| `linter` | Config | Shared ESLint config (`eslint-config-wowarenalogs`). |

## Key Commands

```bash
# Development
npm run dev:web           # Next.js dev server (Turbopack, port 3000)
npm run dev:app           # Next.js + Electron together

# Building (order matters: SQL → parser → recorder → web → app)
npm run build             # Full build all packages
npm run build:web         # Next.js production build
npm run build:parser      # TSDX build (200KB size limit enforced)
npm run build:app         # Electron + preload bundles

# Linting & tests
npm run lint              # ESLint all packages (0 warnings allowed)
npm run lint:fix          # Auto-fix
npm run test              # Run tests across workspaces

# Add deps to a specific package
npm run add:web <pkg>     # shorthand for npm install -w @wowarenalogs/web <pkg>
npm run add:app <pkg>

# GraphQL codegen (run after editing queries.graphql)
npm run -w @wowarenalogs/shared codegen

# Generate Electron preload API (run after editing nativeBridge modules)
npm run gen:app:preload

# Cloud deploy
npm run deploy:dev        # Deploy cloud functions to GCP dev
npm run deploy:prod       # Deploy to production
```

## Architecture Highlights

### Desktop ↔ Web separation
- Desktop behavior is gated on `typeof window.wowarenalogs !== 'undefined'`
- The `app` package's preload script injects `window.wowarenalogs` via Electron IPC
- Web package has zero knowledge of Electron; never import from `app` in `web` or `shared`
- Preload API is auto-generated from `packages/app/src/nativeBridge/modules/`

### Parser
- `WoWCombatLogParser` extends `EventEmitter3` (not Node.js EventEmitter)
- Emits: `arena_match_ended`, `solo_shuffle_ended`, `malformed_arena_match_detected`, `parser_error`
- Lazy pipeline init (WoW version detected from first log line)
- Performance-critical: handles thousands of lines/second; keep it lean

### Data flow
1. Desktop watches `WoWCombatLog.txt` → parser emits match → recorder clips video
2. Client requests signed GCS URL → uploads log buffer with headers `x-wlogs-locale`, `x-wlogs-year`
3. Cloud function fires on GCS trigger → parses → writes Firestore stub
4. Web fetches via GraphQL (Apollo Client + Apollo Server Micro at `pages/api/graphql`)

### State management (React)
- `ClientContext` — GraphQL client, auth user, match cache
- `AppConfigContext` — Desktop app configuration (localStorage + Electron IPC)
- `LocalCombatsContext` — In-memory local combat logs (desktop only)
- `VideoRecordingContext` — Recording session state (desktop only)

### Key source locations
- Combat report UI: `packages/shared/src/components/CombatReport/`
- AI cooldown analysis: `packages/shared/src/components/CombatReport/CombatAIAnalysis/`
- Cooldown utilities: `packages/shared/src/utils/cooldowns.ts`
- Enemy CD data: `packages/shared/src/utils/enemyCDs.ts`
- GraphQL queries: `packages/shared/src/graphql/queries.graphql`
- GraphQL server resolvers: `packages/shared/src/graphql-server/`
- Electron IPC handlers: `packages/app/src/nativeBridge/modules/`
- Cloud functions entry: `packages/cloud/src/index.ts`
- Prisma schema: `packages/sql/prisma/schema.prisma`
- Static spell data: `packages/shared/src/data/` (spellEffects.json, spellIdLists.json, talentIdMap.json)
- AI analysis API: `packages/web/pages/api/analyze.ts`

## Tech Stack

- **Frontend**: React 19, Next.js 15 (Turbopack), TailwindCSS 3 + DaisyUI 2, Apollo Client 3.7, Pixi.js 8 (WebGL combat visualization), Recharts 3
- **Auth**: NextAuth 4 with Battle.net OAuth
- **Backend**: Apollo Server Micro (serverless GraphQL), Google Cloud Functions, Firestore, GCS
- **DB**: CockroachDB via Prisma 4.9
- **Desktop**: Electron 38, Webpack 5
- **Language**: TypeScript 4.6 (strict mode, `noUnusedLocals: true`)
- **Node**: 22+, npm 8.6.0+

## Code Conventions

- **Prettier**: 120 char line width, 2-space indent, trailing commas. Config in root `package.json`.
- **ESLint**: `max-warnings: 0` — all warnings are errors. Pre-commit hook via Husky.
- **TypeScript**: `strict: true` everywhere. No `any` unless absolutely unavoidable.
- **Build order**: SQL → Parser → Recorder → Web/Desktop → App. Enforced in root scripts.
- **Parser size limit**: 200KB combined ESM + CJS (TSDX enforces this at build time).
- Never import `@wowarenalogs/app` from `shared` or `web`.

## Active Work

- AI-powered cooldown analysis (`CombatAIAnalysis` component + `/api/analyze` endpoint)
- Enemy offensive CD timeline display
- Consolidation plan: merge `desktop.wowarenalogs.com` server into `wowarenalogs.com` under `/desktop` prefix (see `CONSOLIDATION_PLAN.md`)
