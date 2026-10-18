// The rules Obsidian's community directory reviews releases with, run over the plugin in the folder above.
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'eslint/config';
import obsidianmd from 'eslint-plugin-obsidianmd';

const root = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig([
	{ basePath: root, ignores: ['lint/**', 'main.js', 'esbuild.config.mjs'] },
	{ basePath: root, extends: [obsidianmd.configs.recommended], languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: root } } },
]);
