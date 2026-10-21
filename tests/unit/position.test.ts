import { describe, expect, test } from 'vitest';
import { computePosition } from '../../src/ui/position';

const viewport = { width: 1000, height: 800 };
const size = { width: 200, height: 100 };
const anchor = { left: 400, top: 300, right: 420, bottom: 320, width: 20, height: 20 };

describe('computePosition', () => {
	test('below / above with start, center and end alignment', () => {
		expect(computePosition(anchor, size, viewport, { side: 'below', align: 'start' })).toEqual({ left: 400, top: 326 });
		expect(computePosition(anchor, size, viewport, { side: 'below', align: 'end' })).toEqual({ left: 220, top: 326 });
		expect(computePosition(anchor, size, viewport, { side: 'above', align: 'center' })).toEqual({ left: 310, top: 194 });
	});

	test('right / left of the anchor, aligned to its top', () => {
		expect(computePosition(anchor, size, viewport, { side: 'right', align: 'start' })).toEqual({ left: 426, top: 300 });
		expect(computePosition(anchor, size, viewport, { side: 'left', align: 'start' })).toEqual({ left: 194, top: 300 });
	});

	test('flips to the other side when there is no room', () => {
		const nearRight = { left: 900, top: 300, right: 920, bottom: 320, width: 20, height: 20 };
		expect(computePosition(nearRight, size, viewport, { side: 'right', align: 'start' })).toEqual({ left: 694, top: 300 });
		const nearBottom = { left: 400, top: 760, right: 420, bottom: 780, width: 20, height: 20 };
		expect(computePosition(nearBottom, size, viewport, { side: 'below', align: 'start' }).top).toBe(654);
	});

	test('stays inside the viewport', () => {
		const corner = { left: 0, top: 0, right: 10, bottom: 10, width: 10, height: 10 };
		expect(computePosition(corner, size, viewport, { side: 'below', align: 'end' })).toEqual({ left: 4, top: 16 });
		const tall = { width: 200, height: 2000 };
		expect(computePosition(anchor, tall, viewport, { side: 'below', align: 'start' }).top).toBe(4);
	});
});
