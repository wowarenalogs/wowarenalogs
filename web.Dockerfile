FROM node:14

# Prepare working directory
WORKDIR /usr/src/app
RUN mkdir packages
RUN mkdir packages/shared
RUN mkdir packages/web
RUN mkdir packages/wow-combat-log-parser

ENV NODE_OPTIONS="--max-old-space-size=8192"
ENV NEXTAUTH_URL="https://wowarenalogs.com"

# Inject build args into env
# --build-arg bliz_secret=zxcexamplev23
ARG bliz_cid
ENV BLIZZARD_CLIENT_ID=$bliz_cid
ARG bliz_csecret
ENV BLIZZARD_CLIENT_SECRET=$bliz_csecret
ARG jwt_secret
ENV JWT_SECRET=$jwt_secret

# Install dependencies
COPY package.json ./
COPY lerna.json ./
COPY yarn.lock ./
COPY tsconfig.json ./
COPY packages/shared/package.json ./packages/shared
COPY packages/web/package.json ./packages/web
COPY packages/wow-combat-log-parser/package.json ./packages/wow-combat-log-parser
RUN yarn install --frozeon-lockfile
COPY ./packages/shared ./packages/shared
COPY ./packages/web ./packages/web
COPY ./packages/wow-combat-log-parser ./packages/wow-combat-log-parser

# Build web
RUN yarn build:parser
RUN yarn build:web

CMD yarn start:web