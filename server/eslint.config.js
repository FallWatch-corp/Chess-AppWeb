const js = require('@eslint/js');

module.exports = [
  js.configs.recommended,
  {
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        require: 'readonly',
        module: 'writable',
        exports: 'writable',
        process: 'readonly',
        __dirname: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        Buffer: 'readonly',
        URLSearchParams: 'readonly',
        URL: 'readonly',
        Response: 'readonly',
      },
    },
  },
  { ignores: ['node_modules/', 'data/'] },
];
