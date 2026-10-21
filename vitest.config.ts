import { defineConfig } from 'vitest/config';

export default defineConfig({
	resolve: { alias: { obsidian: new URL('./tests/mocks/obsidian.ts', import.meta.url).pathname } },
	test: {
		environment: 'jsdom',
		setupFiles: ['tests/setup.ts'],
		include: ['tests/unit/**/*.test.ts'],
	},
});
