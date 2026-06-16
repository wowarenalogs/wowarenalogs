Run GraphQL codegen to regenerate TypeScript types in `packages/shared/src/graphql/__generated__/`.

## Steps

1. Run the codegen command:

   ```
   npm run -w @wowarenalogs/shared codegen
   ```

2. Check the output for errors. If there are schema errors, read the relevant `.graphql` files and fix them before re-running.

3. Verify the generated file `packages/shared/src/graphql/__generated__/graphql.ts` was updated (check the timestamp or diff).

4. Run a quick type-check to catch any downstream breakage:
   ```
   npm run -w @wowarenalogs/shared build 2>&1 | head -30
   ```

## Notes

- Run this any time `packages/shared/src/graphql/queries.graphql` is edited
- The generated types are checked in — commit them alongside the query changes
- If the GraphQL server schema changed, update `packages/shared/src/graphql-server/` first
