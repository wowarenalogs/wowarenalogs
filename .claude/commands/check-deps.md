Validate cross-package dependency rules to prevent accidental coupling.

## Rules to enforce

1. **`packages/web` and `packages/shared` must never import from `@wowarenalogs/app`**

   ```
   grep -r "@wowarenalogs/app" packages/web/src packages/shared/src --include="*.ts" --include="*.tsx" -l
   ```

   Expected: no matches. Any matches are violations.

2. **Desktop-only code must be gated**  
   Any direct use of `window.wowarenalogs` without a guard is a bug. Check for ungated usage:

   ```
   grep -rn "window\.wowarenalogs\." packages/web packages/shared --include="*.ts" --include="*.tsx" | grep -v "typeof window\.wowarenalogs"
   ```

   Expected: no matches. All usage should be inside `if (typeof window.wowarenalogs !== 'undefined')` blocks.

3. **`packages/app` may import from `web`, `shared`, `parser` — not the reverse**
   Confirm no circular imports from shared/web back into app:
   ```
   grep -r "from.*packages/app" packages/web packages/shared --include="*.ts" --include="*.tsx" -l
   ```

## Fix

If violations are found, move desktop-specific logic into `packages/app` or gate it properly with the `typeof window.wowarenalogs` check.
