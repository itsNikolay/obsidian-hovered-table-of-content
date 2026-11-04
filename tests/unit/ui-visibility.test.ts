import type { Locator } from 'playwright';
import { expect, test } from 'vitest';
import { isFullyInViewport } from '../../scripts/ui-visibility.mts';

test.each([
	{ name: 'fully on screen', box: { x: 30, y: 40, width: 40, height: 20 }, shown: true, expected: true },
	{ name: 'rendered below the scroll viewport', box: { x: 30, y: 200, width: 40, height: 20 }, shown: true, expected: false },
	{ name: 'partially clipped at the bottom', box: { x: 30, y: 105, width: 40, height: 20 }, shown: true, expected: false },
	{ name: 'clipped on the left', box: { x: 5, y: 40, width: 40, height: 20 }, shown: true, expected: false },
	{ name: 'hidden despite having bounds', box: { x: 30, y: 40, width: 40, height: 20 }, shown: false, expected: false },
])('$name', async ({ box, shown, expected }) => {
	const marker = { isVisible: async () => shown, boundingBox: async () => box } as unknown as Locator;
	const scroller = { evaluate: async () => ({ x: 20, y: 20, width: 100, height: 100 }) } as unknown as Locator;
	expect(await isFullyInViewport(marker, scroller)).toBe(expected);
});
