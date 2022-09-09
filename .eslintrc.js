module.exports = {
    root: true,
    env: {
        'browser': false,
        'es6': true,
        'node': true
    },
    parser: '@typescript-eslint/parser',
    parserOptions: {
      project: 'tsconfig.json',
      sourceType: 'module'
    },
    plugins: [
        'eslint-plugin-prefer-arrow',
        '@typescript-eslint'
    ],
    rules: {
      "@typescript-eslint/no-unsafe-argument": "warn",
    },
    extends: [
      'eslint:recommended',
      'plugin:@typescript-eslint/recommended',
      'plugin:@typescript-eslint/recommended-requiring-type-checking'
  ]
};
