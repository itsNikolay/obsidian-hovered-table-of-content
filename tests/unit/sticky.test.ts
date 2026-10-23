import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { Heading } from '../../src/headings';
import { OPEN_DELAY, PopupManager } from '../../src/ui/popup';
import { StickyHeadings } from '../../src/ui/sticky';
import { TocController, type TocHost } from '../../src/ui/toc';
import type { NumberFormat, StickyMode } from '../../src/settings';

const headings: Heading[] = [
	{ level: 1, heading: 'Title', line: 0 },
	{ level: 2, heading: 'Alpha **bold**', line: 2 },
	{ level: 3, heading: 'Alpha one', line: 4 },
	{ level: 3, heading: 'Alpha two', line: 6 },
	{ level: 2, heading: 'Beta', line: 8 },
];

const host: TocHost = {
	getHeadings: () => headings,
	getTitle: () => 'Note',
	readFile: () => Promise.resolve(''),
	renderMarkdown: () => Promise.resolve(() => {}),
	resolveLink: () => null,
	openHeading: () => {},
	openLink: () => {},
	bindPagePreview: () => ({ hide: () => {}, keepOpen: () => () => {} }),
};

describe('StickyHeadings', () => {
	let container: HTMLElement;
	let manager: PopupManager;
	let mode: StickyMode;
	let icons: boolean;
	let numbers: NumberFormat | null;
	let selected: Heading[];
	let sticky: StickyHeadings;

	beforeEach(() => {
		vi.useFakeTimers();
		document.body.replaceChildren();
		container = document.createElement('div');
		document.body.append(container);
		manager = new PopupManager(document);
		mode = 'prev';
		icons = true;
		numbers = null;
		selected = [];
		sticky = new StickyHeadings({
			container,
			toc: new TocController(host, manager, { linkIcons: () => true, numbers: () => numbers }),
			path: () => 'Note.md',
			headings: () => headings,
			mode: () => mode,
			icons: () => icons,
			numbers: () => numbers,
			onSelect: (h) => selected.push(h),
		});
	});

	afterEach(() => {
		sticky.destroy();
		manager.closeAll();
		vi.useRealTimers();
	});

	const rows = () => [...container.querySelectorAll<HTMLElement>('.htoc-sticky-row')];

	test('is mounted in the view and empty at the top', () => {
		sticky.update(0);
		expect(container.querySelector('.htoc-sticky')).not.toBeNull();
		expect(rows()).toHaveLength(0);
		expect(container.querySelector('.htoc-sticky')!.classList.contains('is-empty')).toBe(true);
	});

	test('shows the previous heading with its level and plain text', () => {
		sticky.update(3);
		expect(rows().map((r) => r.querySelector('.htoc-sticky-text')!.textContent)).toEqual(['Alpha bold']);
		expect(rows()[0]!.querySelector('.htoc-sticky-level')!.textContent).toBe('H2');
		expect(rows()[0]!.dataset.level).toBe('2');
		expect(container.querySelector('.htoc-sticky')!.classList.contains('is-empty')).toBe(false);
	});

	test('the T icons on sticky headings can be turned off', () => {
		sticky.update(5);
		expect(container.querySelectorAll('.htoc-sticky-toc')).toHaveLength(1);
		icons = false;
		sticky.refresh();
		expect(rows()).toHaveLength(1);
		expect(container.querySelectorAll('.htoc-sticky-toc')).toHaveLength(0);
	});

	test('path mode shows the parent chain', () => {
		mode = 'path';
		sticky.update(5);
		expect(rows().map((r) => r.querySelector('.htoc-sticky-text')!.textContent)).toEqual(['Title', 'Alpha bold', 'Alpha one']);
	});

	test('sticky headings show their numbers in the note', () => {
		mode = 'path';
		const shown = () => rows().map((r) => {
			const text = r.querySelector<HTMLElement>('.htoc-sticky-text')!;
			return [r.querySelector('.htoc-sticky-level')!.textContent, text.dataset.number, text.textContent];
		});
		sticky.update(7);
		expect(shown()).toEqual([['H1', undefined, 'Title'], ['H2', undefined, 'Alpha bold'], ['H3', undefined, 'Alpha two']]);
		numbers = 'level';
		sticky.refresh();
		expect(shown()).toEqual([['H1', '1.', 'Title'], ['H2', '1.', 'Alpha bold'], ['H3', '2.', 'Alpha two']]);
		numbers = 'full';
		sticky.refresh();
		expect(shown()).toEqual([['H1', '1.', 'Title'], ['H2', '1.1.', 'Alpha bold'], ['H3', '1.1.2.', 'Alpha two']]);
	});

	test('the subheadings of a sticky heading keep their numbers in the note', async () => {
		numbers = 'full';
		sticky.update(3);
		rows()[0]!.querySelector('.htoc-sticky-toc')!.dispatchEvent(new MouseEvent('mouseenter'));
		await vi.advanceTimersByTimeAsync(OPEN_DELAY);
		const items = [...document.body.querySelectorAll<HTMLElement>('.htoc-toc .htoc-toc-item')];
		expect(items.map((i) => [i.dataset.number, i.textContent])).toEqual([['1.1.1.', 'Alpha one'], ['1.1.2.', 'Alpha two']]);
		expect(document.body.querySelector('.htoc-toc .htoc-toc-title')!.textContent).toBe('Alpha bold');
	});

	test('does not rebuild rows when the headings did not change', () => {
		sticky.update(3);
		const first = rows()[0];
		sticky.update(3.5);
		expect(rows()[0]).toBe(first);
		sticky.update(9);
		expect(rows()[0]).not.toBe(first);
	});

	test('clicking a row jumps to that heading', () => {
		sticky.update(3);
		rows()[0]!.querySelector<HTMLElement>('.htoc-sticky-text')!.click();
		expect(selected.map((h) => h.line)).toEqual([2]);
	});

	test('each row has a T icon that shows only the subheadings of that heading', async () => {
		sticky.update(3);
		const icon = rows()[0]!.querySelector<HTMLElement>('.htoc-icon.htoc-sticky-toc')!;
		expect(icon.textContent).toBe('T');
		icon.dispatchEvent(new MouseEvent('mouseenter'));
		await vi.advanceTimersByTimeAsync(OPEN_DELAY);
		const items = [...document.body.querySelectorAll('.htoc-toc .htoc-toc-item')].map((i) => i.textContent);
		expect(items).toEqual(['Alpha one', 'Alpha two']);
		expect(document.body.querySelector('.htoc-toc .htoc-toc-title')!.textContent).toBe('Alpha bold');
	});

	test('destroy removes the overlay', () => {
		sticky.update(3);
		sticky.destroy();
		expect(container.querySelector('.htoc-sticky')).toBeNull();
	});
});
