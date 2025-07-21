import globals from "globals";
import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";
import pluginVue from "eslint-plugin-vue";


export default [
  {
    // Глобальные исключения для ESLint
    ignores: ["dist", "node_modules", ".tmp"],
  },
  {
    // Настройка глобальных переменных (для браузера и Node.js)
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      }
    }
  },
  // Базовые правила ESLint
  pluginJs.configs.recommended,
  // Правила для TypeScript
  ...tseslint.configs.recommended,
  // Правила для Vue 3
  ...pluginVue.configs["flat/vue3-recommended"], // Используйте "flat/..." для ESLint v9
  {
    files: ["**/*.vue"],
    languageOptions: {
      parserOptions: {
        // Указываем, что <script> внутри .vue нужно парсить как TypeScript
        parser: tseslint.parser,
      },
    },
    rules: {
      // Правило, которое вы просили: сначала <script>, потом <template>
      'vue/component-tags-order': ['error', {
        'order': [ 'script', 'template', 'style' ]
      }],
    }
  },

  // Отключает правила ESLint, которые могут конфликтовать с Prettier.
  eslintConfigPrettier,
];
