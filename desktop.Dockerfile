FROM node:16

# Prepare working directory
WORKDIR /usr/src/app
RUN mkdir packages
RUN mkdir packages/shared
RUN mkdir packages/desktop
RUN mkdir packages/parser

ENV NODE_OPTIONS="--max-old-space-size=8192"
ENV NEXTAUTH_URL="https://desktop.wowarenalogs.com"

# Install dependencies
COPY package.json ./
COPY package-lock.json ./
COPY tsconfig.json ./
COPY packages/shared/package.json ./packages/shared
COPY packages/desktop/package.json ./packages/desktop
COPY packages/parser/package.json ./packages/parser
RUN npm ci
COPY ./packages/shared ./packages/shared
COPY ./packages/desktop ./packages/desktop
COPY ./packages/parser ./packages/parser

# Build 
RUN npm run build:parser
RUN npm run build:desktop

CMD npm run start:desktop
