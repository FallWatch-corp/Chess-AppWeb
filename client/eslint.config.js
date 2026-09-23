import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { rules: { 'no-empty-pattern': 'off' } },
  { ignores: ['build/', '.react-router/'] },
);
