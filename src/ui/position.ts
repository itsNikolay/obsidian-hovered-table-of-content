export interface Placement {
	side: 'below' | 'above' | 'right' | 'left';
	align: 'start' | 'center' | 'end';
}

export interface Rect {
	left: number;
	top: number;
	right: number;
	bottom: number;
	width: number;
	height: number;
}

interface Size {
	width: number;
	height: number;
}

const GAP = 6;
const MARGIN = 4;

const OPPOSITE = { below: 'above', above: 'below', right: 'left', left: 'right' } as const;

function place(anchor: Rect, size: Size, side: Placement['side'], align: Placement['align']): { left: number; top: number } {
	if (side === 'below' || side === 'above') {
		const top = side === 'below' ? anchor.bottom + GAP : anchor.top - GAP - size.height;
		const left =
			align === 'start' ? anchor.left : align === 'end' ? anchor.right - size.width : anchor.left + anchor.width / 2 - size.width / 2;
		return { left, top };
	}
	const left = side === 'right' ? anchor.right + GAP : anchor.left - GAP - size.width;
	const top =
		align === 'start' ? anchor.top : align === 'end' ? anchor.bottom - size.height : anchor.top + anchor.height / 2 - size.height / 2;
	return { left, top };
}

function fits(pos: { left: number; top: number }, size: Size, viewport: Size, side: Placement['side']): boolean {
	if (side === 'below') return pos.top + size.height <= viewport.height - MARGIN;
	if (side === 'above') return pos.top >= MARGIN;
	if (side === 'right') return pos.left + size.width <= viewport.width - MARGIN;
	return pos.left >= MARGIN;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

/** Viewport coordinates for a popup of `size` next to `anchor`; flips sides when there is no room, then clamps. */
export function computePosition(anchor: Rect, size: Size, viewport: Size, placement: Placement): { left: number; top: number } {
	let pos = place(anchor, size, placement.side, placement.align);
	if (!fits(pos, size, viewport, placement.side)) {
		const flipped = place(anchor, size, OPPOSITE[placement.side], placement.align);
		if (fits(flipped, size, viewport, OPPOSITE[placement.side])) pos = flipped;
	}
	return {
		left: Math.round(clamp(pos.left, MARGIN, Math.max(MARGIN, viewport.width - MARGIN - size.width))),
		top: Math.round(clamp(pos.top, MARGIN, Math.max(MARGIN, viewport.height - MARGIN - size.height))),
	};
}
