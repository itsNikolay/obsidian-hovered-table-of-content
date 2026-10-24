import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createTocButton, placeAfterTitle, setButtonPosition } from '../../src/ui/button';

describe('TOC button', () => {
	test('is a T icon with an accessible label at the chosen position', () => {
		const button = createTocButton(document, 'bottom-left');
		expect(button.textContent).toBe('T');
		expect(button.classList.contains('htoc-icon')).toBe(true);
		expect(button.classList.contains('htoc-button')).toBe(true);
		expect(button.classList.contains('htoc-pos-bottom-left')).toBe(true);
		expect(button.getAttribute('aria-label')).toBe('Table of contents');
	});

	test('moving it replaces the previous position class', () => {
		const button = createTocButton(document, 'top-right');
		setButtonPosition(button, 'bottom-center');
		expect([...button.classList].filter((c) => c.startsWith('htoc-pos-'))).toEqual(['htoc-pos-bottom-center']);
	});
});

describe('TOC button after the note title', () => {
	const rect = (left: number, top: number, width: number, height: number) =>
		({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;
	// jsdom has no layout: the lines of the title text are stubbed.
	let lines: DOMRect[];
	const getClientRects = Object.getOwnPropertyDescriptor(Range.prototype, 'getClientRects');
	let host: HTMLElement;
	let title: HTMLElement;

	beforeEach(() => {
		lines = [];
		Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value: () => lines });
		document.body.replaceChildren();
		host = document.createElement('div');
		title = document.createElement('div');
		title.textContent = 'A long note title';
		host.append(title);
		document.body.append(host);
		// The host scrolls the note: its content starts above and left of its box.
		vi.spyOn(host, 'getBoundingClientRect').mockReturnValue(rect(100, 50, 800, 600));
		Object.defineProperties(host, { scrollTop: { value: 40 }, scrollLeft: { value: 0 }, clientTop: { value: 1 }, clientLeft: { value: 2 } });
		vi.spyOn(title, 'getBoundingClientRect').mockReturnValue(rect(300, 120, 700, 60));
	});

	afterEach(() => {
		if (getClientRects) Object.defineProperty(Range.prototype, 'getClientRects', getClientRects);
		else delete (Range.prototype as { getClientRects?: unknown }).getClientRects;
		vi.restoreAllMocks();
	});

	test('sits right after the end of the title text, in the middle of its last line', () => {
		lines = [rect(300, 120, 600, 30), rect(300, 150, 180, 30)];
		const button = createTocButton(document, 'top-right');
		placeAfterTitle(button, title, host);
		expect(button.classList.contains('htoc-after-title')).toBe(true);
		expect([...button.classList].filter((c) => c.startsWith('htoc-pos-'))).toEqual([]);
		expect(button.style.getPropertyValue('--htoc-title-left')).toBe(`${300 + 180 - 100 - 2}px`);
		expect(button.style.getPropertyValue('--htoc-title-top')).toBe(`${150 + 15 - 50 - 1 + 40}px`);
	});

	test('an empty title puts it at the start of the title', () => {
		title.textContent = '';
		const button = createTocButton(document, 'top-right');
		placeAfterTitle(button, title, host);
		expect(button.style.getPropertyValue('--htoc-title-left')).toBe(`${300 - 100 - 2}px`);
		expect(button.style.getPropertyValue('--htoc-title-top')).toBe(`${120 + 30 - 50 - 1 + 40}px`);
	});

	test('moving it back to a corner drops the place after the title', () => {
		lines = [rect(300, 120, 180, 30)];
		const button = createTocButton(document, 'top-right');
		placeAfterTitle(button, title, host);
		setButtonPosition(button, 'bottom-left');
		expect(button.classList.contains('htoc-after-title')).toBe(false);
		expect(button.classList.contains('htoc-pos-bottom-left')).toBe(true);
		expect(button.style.getPropertyValue('--htoc-title-left')).toBe('');
		expect(button.style.getPropertyValue('--htoc-title-top')).toBe('');
	});
});
