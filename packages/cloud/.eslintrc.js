module.exports = {
  extends: ["wowarenalogs"],
  parserOptions: {
    project: './tsconfig.json',
    tsconfigRootDir: __dirname,
  },
  rules: {
    "no-console": "off",
  }
};
