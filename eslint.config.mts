import obsidianmd from 'eslint-plugin-obsidianmd';
import globals from 'globals';
import { globalIgnores, defineConfig } from 'eslint/config';

export default defineConfig(
	globalIgnores([
		'node_modules',
		'dist',
		'artifacts',
		'scripts',
		'docker',
		'esbuild.config.mjs',
		'version-bump.mjs',
		'versions.json',
		'vitest.config.ts',
		'main.js',
		'package.json',
		'package-lock.json',
		'tsconfig.json',
	]),
	{
		languageOptions: {
			globals: {
				...globals.browser,
			},
			parserOptions: {
				projectService: {
					allowDefaultProject: ['eslint.config.mts', 'manifest.json'],
				},
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: ['.json'],
			},
		},
	},
	...obsidianmd.configs.recommended,
	{
		// Test fixtures and DOM helper stand-ins use native jsdom methods.
		files: ['tests/**/*.ts'],
		rules: { 'obsidianmd/prefer-create-el': 'off' },
	},
	{
		// The release scan test runs in Node, not in Obsidian.
		files: ['tests/unit/virustotal.test.ts'],
		languageOptions: { globals: { ...globals.node } },
		rules: { 'obsidianmd/no-nodejs-modules': 'off' },
	},
);
