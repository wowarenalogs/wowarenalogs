# Container for the spell-icon refresh, run as a Cloud Run **Job** (batch,
# run-to-completion) on a weekly Cloud Scheduler trigger. A Job — unlike the
# old request-driven Pub/Sub function — simply runs and exits, so it cannot
# retry-storm. See packages/tools/deploy/deploy_icon_job.sh.
#
# Build context is packages/tools/ (so --source packages/tools picks up this
# Dockerfile). Only the three files the icon script needs are compiled; the
# rest of the tools package (which pulls in the shared workspace and other
# deps) is intentionally left out to keep the image small and self-contained.

FROM node:22-slim AS build
WORKDIR /app
# Install just the icon script's deps directly (not from the workspace
# package.json, which references the workspace-only eslint config).
RUN npm install --no-save --no-package-lock \
    typescript@^4.9 @types/node@^22 @types/lodash@^4 @types/node-fetch@^2.6 \
    @google-cloud/storage@^7.17 node-fetch@^2.6.7 lodash@^4.17.21
COPY tsconfig.json ./
COPY src/refreshSpellIcons.ts src/csv.ts src/wagoConfig.ts ./src/
RUN npx tsc src/refreshSpellIcons.ts \
    --outDir dist --module commonjs --target es2019 --moduleResolution node \
    --esModuleInterop --resolveJsonModule --skipLibCheck

FROM node:22-slim
WORKDIR /app
RUN npm install --no-save --no-package-lock --omit=dev \
    @google-cloud/storage@^7.17 node-fetch@^2.6.7 lodash@^4.17.21
COPY --from=build /app/dist ./dist
# --all: resolve every SpellMisc spell from live wago.tools data at runtime, so
# the image never goes stale as WAGO patches ship. Existence checks make every
# run after the first a cheap no-op except for genuinely new icons.
ENTRYPOINT ["node", "dist/refreshSpellIcons.js"]
CMD ["--all"]
