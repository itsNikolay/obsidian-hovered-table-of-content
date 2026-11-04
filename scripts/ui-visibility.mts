import type { Locator } from 'playwright';

/** A rendered element can still be clipped by its scroll viewport. */
export async function isFullyInViewport(marker: Locator, scroller: Locator): Promise<boolean> {
	if (!(await marker.isVisible())) return false;
	const box = await marker.boundingBox();
	if (!box) return false;
	const viewport = await scroller.evaluate((el) => {
		const rect = el.getBoundingClientRect();
		return { x: rect.left + el.clientLeft, y: rect.top + el.clientTop, width: el.clientWidth, height: el.clientHeight };
	});
	return box.width > 0 && box.height > 0 && box.x >= viewport.x && box.y >= viewport.y
		&& box.x + box.width <= viewport.x + viewport.width && box.y + box.height <= viewport.y + viewport.height;
}
