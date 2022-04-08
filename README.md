# Development Process

## NPM workspaces

We use [NPM workspaces](https://docs.npmjs.com/cli/v8/using-npm/workspaces) to manage the monorepo. There are a few key characteristics that are unique when compared to other monorepo frameworks such as lerna or yarn workspaces:

- Each sub package maintains its own list of dependencies and devDependencies in its package.json.
- `npm install` at the root directory will trigger npm workspaces to "rebuild" (bootstrap) the dependency graph
- There are a few convenient npm scripts defined in the root package.json to help make it easier to add dependencies to a sub package. For example, `npm run add:web external-package` will install the external dependency to the web package. It can be further augmented to install devDependencies: `npm run add:web external-package -- --save-dev`.
