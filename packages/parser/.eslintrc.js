module.exports = {
  rules: {
    'no-console': 'error',
    'no-unused-vars': 'error',
  },
  extends: ['wowarenalogs'],
  parserOptions: {
    project: './tsconfig.json',
    tsconfigRootDir: __dirname,
  },
};
