FROM node:16

# Prepare working directory
WORKDIR /usr/src/app
RUN mkdir packages
RUN mkdir packages/shared
RUN mkdir packages/desktop
RUN mkdir packages/wow-combat-log-parser

ENV NODE_OPTIONS="--max-old-space-size=8192"
ENV NEXTAUTH_URL="https://desktop.wowarenalogs.com"

# Install dependencies
COPY package.json ./
COPY package-lock.json ./
COPY tsconfig.json ./
COPY packages/shared/package.json ./packages/shared
COPY packages/desktop/package.json ./packages/desktop
COPY packages/wow-combat-log-parser/package.json ./packages/wow-combat-log-parser
RUN npm ci
COPY ./packages/shared ./packages/shared
COPY ./packages/desktop ./packages/desktop
COPY ./packages/wow-combat-log-parser ./packages/wow-combat-log-parser

# Build 
RUN npm run build:parser
RUN npm run build:desktop

CMD npm run start:desktop
