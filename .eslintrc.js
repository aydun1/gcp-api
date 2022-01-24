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
    extends: [
      'eslint:recommended',
      'plugin:@typescript-eslint/recommended',
      'plugin:@typescript-eslint/recommended-requiring-type-checking'
  ]
};
