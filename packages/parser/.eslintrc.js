module.exports = {
  rules: {
    eqeqeq: 'off',
    'no-console': 'off',
    'no-unused-vars': 'error',
    'prefer-const': ['error', { ignoreReadBeforeAssign: true }],
  },
  extends: ['wowarenalogs'],
  parserOptions: {
    project: './tsconfig.json',
    tsconfigRootDir: __dirname,
  },
};
