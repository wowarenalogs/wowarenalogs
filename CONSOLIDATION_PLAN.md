# Single Server Consolidation Plan
## Eliminate the Desktop Server — Run One Next.js Server for Both Web and Desktop

**Date**: February 16, 2026
**Status**: Proposal v2

---

## Key Discovery

The Electron app does **NOT** run a local Next.js server. It loads a **remote** URL:

```typescript
// packages/app/src/constants.ts
export const BASE_REMOTE_URL = !app || app.isPackaged
  ? 'https://desktop.wowarenalogs.com'   // production
  : 'http://localhost:3000';              // development
```

So today there are **two remote Next.js servers** running in production:
- `wowarenalogs.com` — serves the public website (packages/web)
- `desktop.wowarenalogs.com` — serves the Electron app's UI (packages/desktop)

**Goal: Run one server that handles both.**

---

## Architecture Comparison

### Current (Two Servers)

```
Browser → wowarenalogs.com → [web Next.js server]
Electron → desktop.wowarenalogs.com → [desktop Next.js server]
```

### Target (One Server)

```
Browser → wowarenalogs.com → [unified Next.js server]
Electron → wowarenalogs.com/desktop → [same server]
```

---

## Difference Analysis

### Pages

| Page | Web | Desktop | Notes |
|------|-----|---------|-------|
| `index.tsx` | ✅ Landing/download page | ✅ Router → latest/setup/upgrade | Completely different |
| `history.tsx` | ✅ Remote matches | ✅ Local + remote matches | Desktop merges local combats |
| `match.tsx` | ✅ | ✅ | Similar |
| `profile.tsx` | ✅ | ✅ | Desktop uses `window.wowarenalogs` |
| `search.tsx` | ✅ | ✅ | Similar |
| `stats.tsx` | ✅ | ✅ | Similar |
| `awc.tsx` | ✅ | ✅ | Similar |
| `debug.tsx` | ❌ | ✅ | Desktop-only |
| `first_time_setup.tsx` | ❌ | ✅ | Desktop-only |
| `latest.tsx` | ❌ | ✅ | Desktop-only (live match monitor) |
| `login.tsx` | ❌ | ✅ | Desktop-only |
| `settings.tsx` | ❌ | ✅ | Desktop-only |
| `upgrade.tsx` | ❌ | ✅ | Desktop-only |
| `matches/character` | ✅ | ❌ | Web-only |
| `matches/user` | ✅ | ❌ | Web-only |

### API Routes

| Route | Web | Desktop | Notes |
|-------|-----|---------|-------|
| `/api/graphql` | ✅ | ✅ | Minor CORS diff (web allows Apollo Studio) |
| `/api/auth/[...nextauth]` | ✅ | ✅ | Same (different NEXTAUTH_URL) |
| `/api/blizzard/[...route]` | ✅ | ✅ | Same |
| `/api/getCombatUploadSignature/[id]` | ❌ | ✅ | Desktop-only |

### Layouts

- **Web**: `WebLayout` — standard website nav
- **Desktop**: `DesktopLayout` (ssr: false) — custom title bar, wrapped in `AppConfigContext`

### Desktop-Specific Dependencies

- `AppConfigContext` — reads config from localStorage + Electron IPC (`window.wowarenalogs`)
- `LocalCombatsContext` — local combat logs via Electron bridge
- `VideoRecordingContext` — OBS integration via Electron bridge
- `window.wowarenalogs.*` — Electron preload API (app, files, logs, obs, links, mainWindow, bnet)

---

## Strategy: Merge Desktop Into Web Under `/desktop` Prefix

The simplest approach: **add desktop pages/routes to the web app** under a `/desktop` prefix, then point the Electron app at the web server.

### Why This Works

1. The Electron app already loads a remote URL — changing the URL is trivial
2. Desktop pages are self-contained (they just need their components and hooks)
3. Both apps already share the same auth system (NextAuth) and GraphQL schema
4. Desktop-specific behavior is gated on `window.wowarenalogs` (the Electron bridge), which only exists inside Electron — no server-side distinction needed
5. The `NEXTAUTH_URL` difference is the only real server config difference

### Why Not Environment-Based Mode Switching

The old plan proposed `NEXT_PUBLIC_APP_MODE=web|desktop` to conditionally render. This is worse because:
- Requires building twice or runtime branching
- Still needs two deployments with different env vars
- The pages are different enough that conditionals would be messy
- Next.js already supports having both sets of pages in one app

---

## Implementation Plan

### Phase 1: Add Desktop Pages to Web (2-3 days)

1. **Copy desktop-only pages** into web under `pages/desktop/`:
   ```
   packages/web/pages/desktop/
   ├── index.tsx          (was desktop's index.tsx)
   ├── debug.tsx
   ├── first_time_setup.tsx
   ├── latest.tsx
   ├── login.tsx
   ├── settings.tsx
   └── upgrade.tsx
   ```

2. **Copy desktop-only components** into web:
   ```
   packages/web/components/
   ├── DesktopLayout/
   ├── TitleBar/
   ├── FirstTimeSetup/
   ├── LatestMatchMonitor/
   └── Settings/RecordingSettings
   ```

3. **Copy desktop-only hooks** into web:
   ```
   packages/web/hooks/
   ├── AppConfigContext/
   ├── LocalCombatsContext/
   └── VideoRecordingContext/
   ```

4. **Add desktop API route**:
   - Copy `api/getCombatUploadSignature/[id].ts` to web

5. **Update `_app.tsx`** to conditionally use DesktopLayout for `/desktop/*` routes:
   ```typescript
   function App(props: AppProps<SessionProviderProps>) {
     const router = useRouter();
     const isDesktopRoute = router.pathname.startsWith('/desktop');

     if (isDesktopRoute) {
       // Desktop login bypass
       if (router.pathname.indexOf('/login') > -1) {
         return <props.Component {...props.pageProps} />;
       }
       return (
         <SessionProvider session={props.pageProps.session}>
           <QueryClientProvider client={queryClient}>
             <ApolloProvider client={client}>
               <AppConfigContextProvider>
                 <DesktopLayout {...props} />
               </AppConfigContextProvider>
             </ApolloProvider>
           </QueryClientProvider>
         </SessionProvider>
       );
     }

     // Normal web layout
     return (
       <SessionProvider session={props.pageProps.session}>
         <QueryClientProvider client={queryClient}>
           <ApolloProvider client={client}>
             <AuthProvider>
               <WebLayout>
                 <props.Component {...props.pageProps} />
               </WebLayout>
             </AuthProvider>
           </ApolloProvider>
         </QueryClientProvider>
       </SessionProvider>
     );
   }
   ```

6. **Handle shared pages accessed from desktop** (history, match, profile, etc.):
   - Option A: Duplicate them under `/desktop/` with desktop layout
   - Option B: Detect Electron via `window.wowarenalogs` client-side and swap layout
   - **Recommended: Option B** — shared pages already work in both contexts; the layout switch can happen client-side based on whether the Electron bridge exists

7. **Merge GraphQL CORS**: Add the Apollo Studio CORS headers (already only in web's next.config.js — just keep them)

### Phase 2: Update Electron App (30 minutes)

Update `packages/app/src/constants.ts`:

```typescript
export const BASE_REMOTE_URL = !app || app.isPackaged
  ? 'https://wowarenalogs.com/desktop'
  : 'http://localhost:3000/desktop';
```

### Phase 3: Handle NEXTAUTH_URL (1 hour)

The main server-side concern. Options:
- **Option A**: Set `NEXTAUTH_URL=https://wowarenalogs.com` — desktop users authenticate against the same domain. **This is the cleanest approach** since the Electron app will now load from `wowarenalogs.com` anyway.
- **Option B**: Keep `desktop.wowarenalogs.com` as a reverse proxy/redirect to `wowarenalogs.com/desktop`. Only needed if existing desktop users have cookies tied to the old domain.

**Recommended: Option A.** Since the Electron app will point to `wowarenalogs.com`, auth cookies will be on that domain naturally.

### Phase 4: DNS & Deprecation (1 day)

1. **Keep `desktop.wowarenalogs.com` alive temporarily** with a redirect to `wowarenalogs.com/desktop` (for older Electron versions still pointing there)
2. After sufficient adoption of the new Electron version, remove the old desktop server
3. Eventually remove the DNS entry

### Phase 5: Cleanup (1 day)

1. Delete `packages/desktop/` 
2. Remove desktop Dockerfile / deployment config
3. Update CI/CD to build only the web package
4. Update README

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Auth cookies break for desktop users | Low | High | Redirect old domain; new Electron release points to new URL |
| Desktop-specific pages accidentally exposed to web crawlers | Low | Low | `noindex` meta tag on `/desktop/*` pages; they require Electron bridge anyway |
| Shared pages look wrong in desktop context | Medium | Medium | Client-side layout detection via `window.wowarenalogs` |
| Bundle size increase | Low | Low | Desktop pages are small; dynamic imports keep them out of web bundles |
| Old Electron versions break | Medium | Medium | Keep redirect on old domain for 6+ months |

---

## Timeline

| Phase | Duration |
|-------|----------|
| Phase 1: Add desktop pages to web | 2-3 days |
| Phase 2: Update Electron constants | 30 min |
| Phase 3: Auth configuration | 1 hour |
| Phase 4: DNS/redirect setup | 1 day |
| Phase 5: Cleanup | 1 day |
| **Total** | **~5 days** |

---

## What This Achieves

- **One server** instead of two
- **One Docker image** instead of two
- **One deployment** instead of two
- **Half the hosting cost** for the server tier
- **Simpler CI/CD** — one build, one deploy
- **No code duplication** — shared pages exist once

---

## Open Questions

1. **How are desktop sessions currently deployed?** (Cloud Run? K8s? Verify deployment config exists.)
2. **Are there any server-side checks for desktop vs web?** (Search for hostname checks in API routes.)
3. **Do desktop pages that also exist in web (history, match, etc.) need the desktop layout?** If so, a layout-switching mechanism is needed for those routes.
4. **Is there a desktop-specific GraphQL schema or resolvers?** (The graphql endpoints differ slightly — need to verify the schema is identical.)
