# Development Process

## NPM workspaces

We use [NPM workspaces](https://docs.npmjs.com/cli/v8/using-npm/workspaces) to manage the monorepo. There are a few key characteristics that are unique when compared to other monorepo frameworks such as lerna or yarn workspaces:

- Each sub package maintains its own list of dependencies and devDependencies in its package.json.
- `npm ci` at the root directory will trigger npm workspaces to "rebuild" (bootstrap) the dependency graph
- There are a few convenient npm scripts defined in the root package.json to help make it easier to add dependencies to a sub package. For example, `npm run add:web external-package` will install the external dependency to the web package. It can be further augmented to install devDependencies: `npm run add:web external-package -- --save-dev`.

## Setting up your local dev environment

### Clean install

Once you've cloned the repo, cd into the root directory and run the following command to do a clean install of all dependencies.

```bash
npm ci
```

### Credentials to access backend

We use Google Cloud Platform as our backend. In order to test most of the core functionality locally, you will need to obtain credentials to access our development project in Google Cloud.

Join our [discord server](https://discord.gg/NFTPK9tmJK) and talk to us to proceed. We will share a development credentials with you and you will need to place it at /packages/cloud/wowarenalogs-public-dev.json. This will provide your local setup with necessary access to a development environment of our Google Cloud backend.

### Environment variables

Our frontend, both /packages/desktop and /packages/web, use Next.js as the framework. In order for the frontend to work correctly, you need to set a few environment variables locally.

The easiest way to do this is by creating a `.env.local` file under both /packages/desktop and /packages/web, and put in the following content:

```
NEXTAUTH_SECRET=wowarenalogs_not_really_a_secret
BLIZZARD_CLIENT_ID=dummy_client_id
BLIZZARD_CLIENT_SECRET=dummy_client_secret
```

Note that this currently will not allow you to test Battle.net authentication. We're still figuring out what's the best way to allow contributors to gain access.

## Running the app

Use the following command to run the app locally with hot reload:

```
npm run dev:app
```

Check out the other npm scripts listed under the root package.json to see what else you can do.

## Submitting pull requests

We welcome pull requests. When you create one that you would like to merge into our main branch, please make sure of the followings:

- Provide sufficient context in the PR description to describe what you are intended to do.
- Attach screenshots if applicable to demonstrate how the change was/can be tested.
