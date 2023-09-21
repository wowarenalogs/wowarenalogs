module.exports = {
  "extends": ["wowarenalogs"],
  "parserOptions": {
    "project": "./tsconfig.json",
    "tsconfigRootDir": __dirname
  },
  "rules": {
    "@next/next/no-assign-module-variable": "off",
  }
}
