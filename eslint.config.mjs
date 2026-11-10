import js from '@eslint/js'
import pluginVue from 'eslint-plugin-vue'
import globals from 'globals'
import prettier from 'eslint-config-prettier'

export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'data/**', 'media/**', 'music/**', '.trae/**'],
  },
  js.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  {
    files: ['src/**/*.{js,vue}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        defineProps: 'readonly',
        defineEmits: 'readonly',
        defineExpose: 'readonly',
        defineOptions: 'readonly',
        withDefaults: 'readonly',
      },
    },
    rules: {
      'vue/multi-word-component-names': 'off',
      'vue/no-v-html': 'off',
      'vue/require-default-prop': 'off',
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/html-self-closing': 'off',
      'vue/html-indent': 'off',
      'vue/html-closing-bracket-newline': 'off',
      'vue/attributes-order': 'off',
      'vue/first-attribute-linebreak': 'off',
    },
  },
  {
    files: ['server/**/*.js', 'test/**/*.js', 'vite.config.js', 'vitest.config.js', 'eslint.config.mjs'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    rules: {
      'no-unused-vars': ['error', { args: 'none', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-control-regex': 'off',
      // Vue Flow 的事件名就是 camelCase（nodesChange / edgesChange），不能强制连字符
      'vue/v-on-event-hyphenation': 'off',
    },
  },
  {
    // Vue Flow 的节点 data 是父级传入的可变引用，卡片内直接编辑是官方用法
    files: ['src/components/canvas/SceneItemNode.vue'],
    rules: { 'vue/no-mutating-props': 'off' },
  },
  prettier,
]
