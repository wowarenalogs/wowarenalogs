# WoW Arena Logs

## Architecture Overview

- Main components
  - An electron-based desktop client application.
  - A React frontend UI that provides functionality in the desktop application, but is hosted on Google Cloud at https://desktop-client.wowarenalogs.com/. When the desktop client application starts, it basically loads this react frontend and runs it inside a webview.
  - A React frontend website hosted on Google Cloud at https://www.wowarenalogs.com/.

## Main Directories

- /packages/desktop-client
  - This directory contains code for both the desktop application shell, and the React frontend.
- /packages/web
  - This directory contains code for the website hosted at https://www.wowarenalogs.com/.
- /packages/shared-ui
  - This directory contains common React components used across web and desktop-client.
- /packages/cloud-functions
  - This directory contains code for match ingress, storage, and service via Google Cloud functions
- /assets
  - This directory contains the source art files for various image assets we use on the website and application.

## Development Process

Our repository contains several npm modules that depend on each other. This is called a "monorepo". We use lerna and yarn workspaces to manage the monorepo, which has lots of benefits and a few implications to how we use the repository:

- Installing dependencies or devDependencies for any child package should always be handled at the root level. Simply run "yarn add _dependency-package-name_ -W [-D]" at the project root directory. Never run "yarn add" in a child package directory. This ensures all child packages share a single source of truth for dependencies and helps avoid multiple copies of the same dependency running in parallel.
- All scripts should be run at the root level as well. Checkout package.json at the project root directory for what scripts are supported.

## Local vars

To run this project locally you must provide credentials to access the Blizzard api

These must be provided in .env.local -- see packages/web/.env.example for the format and required fields

There is a copy of this file in both /packages/web and /packages/desktop

See https://develop.battle.net/access/clients for more information on getting these variables for your own local testing.
