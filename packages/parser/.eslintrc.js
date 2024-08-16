module.exports = {
  rules: {
    'no-console': 'error',
  },
  extends: ['wowarenalogs'],
  parserOptions: {
    project: './tsconfig.json',
    tsconfigRootDir: __dirname,
  },
};
