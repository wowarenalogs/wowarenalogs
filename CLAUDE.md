# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

WoW Arena Logs is a World of Warcraft arena combat analysis tool built as a monorepo with multiple packages for desktop app, web app, parser, and cloud functions. It uses Electron for the desktop app, Next.js for web interfaces, and Google Cloud Platform for backend services.

## Architecture

### Monorepo Structure
- **NPM Workspaces**: The project uses NPM workspaces to manage dependencies across packages
- **Packages**:
  - `app`: Electron main process with native bridge modules
  - `desktop`: Next.js frontend for desktop application  
  - `web`: Next.js frontend for web application
  - `parser`: Combat log parser library (published to npm)
  - `shared`: Shared components, GraphQL, utilities across frontends
  - `recorder`: Video recording functionality using OBS Studio Node
  - `cloud`: Google Cloud Functions for backend operations
  - `sql`: Prisma database schema
  - `tools`: Build tools and spell metadata generation
  - `linter`: Custom ESLint configuration

### Key Technologies
- **Frontend**: React 17, Next.js 12, TypeScript, Tailwind CSS, DaisyUI
- **Desktop**: Electron 27, OBS Studio Node for recording
- **Backend**: Google Cloud Platform (Firestore, Cloud Functions)
- **GraphQL**: Apollo Client/Server for API
- **Database**: Prisma ORM with PostgreSQL
- **Authentication**: NextAuth with Battle.net OAuth

## Development Commands

### Initial Setup
```bash
npm ci  # Clean install all dependencies
```

### Running Applications
```bash
npm run dev:app      # Run Electron app with hot reload
npm run dev:desktop  # Run desktop Next.js frontend only
npm run dev:web      # Run web frontend only
```

### Building
```bash
npm run build              # Build all packages
npm run build:app          # Build Electron app
npm run build:desktop      # Build desktop frontend
npm run build:web          # Build web frontend  
npm run build:parser       # Build parser library
npm run build:sql          # Generate Prisma client
```

### Platform-specific Builds
```bash
npm run build:app:windows  # Build for Windows
npm run build:app:mac      # Build for macOS
npm run build:app:linux    # Build for Linux
```

### Testing & Linting
```bash
npm run test       # Run all tests
npm run lint       # Run ESLint on all packages
npm run lint:fix   # Auto-fix ESLint issues
```

### Adding Dependencies
```bash
npm run add:app <package>      # Add to app package
npm run add:desktop <package>  # Add to desktop package
npm run add:web <package>      # Add to web package
npm run add:shared <package>   # Add to shared package
npm run add:parser <package>   # Add to parser package
```

Add `-- --save-dev` for dev dependencies.

## Environment Setup

### Backend Credentials
Place Google Cloud credentials at `/packages/cloud/wowarenalogs-public-dev.json` for local development.

### Environment Variables
Create `.env.local` in both `/packages/desktop` and `/packages/web`:
```
NEXTAUTH_SECRET=wowarenalogs_not_really_a_secret
BLIZZARD_CLIENT_ID=dummy_client_id
BLIZZARD_CLIENT_SECRET=dummy_client_secret
```

## Key Patterns

### Native Bridge (Electron)
The Electron app uses a module-based native bridge pattern in `/packages/app/src/nativeBridge/` for IPC communication between main and renderer processes.

### Combat Log Parsing
The parser (`/packages/parser`) processes WoW combat logs using a pipeline approach with separate handling for retail and classic versions.

### GraphQL Schema
GraphQL types and queries are defined in `/packages/shared/graphql/` with code generation for type safety.

### Component Sharing
Shared React components are in `/packages/shared/src/components/` and imported by both desktop and web frontends.

## Important Notes

- TypeScript strict mode is enabled globally
- Prettier configuration: 120 char width, single quotes, trailing commas
- The project uses patches for some dependencies (see `/patches/`)
- Video recording uses OBS Studio Node and requires special handling during build
- Authentication requires Battle.net OAuth configuration for full functionality