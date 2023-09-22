module.exports = {
  "extends": ["next", "next/core-web-vitals", "eslint:recommended", "plugin:@typescript-eslint/recommended", "plugin:prettier/recommended"],
  "plugins": [
    "simple-import-sort"
  ],
  "parser": "@typescript-eslint/parser",
  "rules": {
    "no-console": [
      "error",
      {
        "allow": [
          "warn",
          "error"
        ]
      }
    ],
    "react/react-in-jsx-scope": "off",
    "simple-import-sort/imports": "warn",
    "@next/next/no-html-link-for-pages": "off",
    "@typescript-eslint/no-unused-vars": [
      "error",
      {
        "argsIgnorePattern": "^_",
        "varsIgnorePattern": "^_",
        "caughtErrorsIgnorePattern": "^_"
      }
    ]
  },
  ignorePatterns: [
    "node_modules",
    ".next",
    ".turbo",
    "dist",
    "public",
    "coverage",
  ]
}
