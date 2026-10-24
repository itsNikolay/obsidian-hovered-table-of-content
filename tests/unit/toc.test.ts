import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { Heading } from '../../src/headings';
import type { NumberFormat } from '../../src/settings';
import { CLOSE_DELAY, OPEN_DELAY, PopupManager, type Popup } from '../../src/ui/popup';
import { TocController, type TocHost } from '../../src/ui/toc';

const enter = (el: Element) => el.dispatchEvent(new MouseEvent('mouseenter'));
const leave = (el: Element) => el.dispatchEvent(new MouseEvent('mouseleave'));
const q = <T extends Element = HTMLElement>(sel: string) => [...document.body.querySelectorAll<T & HTMLElement>(sel)];

const files: Record<string, string> = {
	'Main.md': ['# Main', 'intro', '## Setup', 'Read [[Other]] first.', '### Install', 'npm i', '## Usage', 'use it'].join('\n'),
	'Other.md': ['# Other', 'other intro', '## Other part', 'details'].join('\n'),
	'Empty.md': 'no headings here',
};

function headingsOf(content: string): Heading[] {
	return content.split('\n').flatMap((text, line) => {
		const m = /^(#{1,6}) (.*)$/.exec(text);
		return m ? [{ level: m[1]!.length, heading: m[2]!, line }] : [];
	});
}

interface PagePreview {
	link: HTMLElement;
	linktext: string;
	sourcePath: string;
	hide: ReturnType<typeof vi.fn>;
	keepOpen: ReturnType<typeof vi.fn>;
	release: ReturnType<typeof vi.fn>;
}

function makeHost(): TocHost & { opened: unknown[]; links: unknown[]; pagePreviews: PagePreview[] } {
	const opened: unknown[] = [];
	const links: unknown[] = [];
	const pagePreviews: PagePreview[] = [];
	return {
		opened,
		links,
		pagePreviews,
		getHeadings: (path) => (files[path] ? headingsOf(files[path]) : []),
		getTitle: (path) => path.replace(/\.md$/, ''),
		readFile: (path) => Promise.resolve(files[path] ?? ''),
		renderMarkdown: (markdown, el) => {
			// Minimal renderer: paragraphs + [[wikilinks]] the way Obsidian renders them.
			for (const line of markdown.split('\n')) {
				const p = document.createElement('p');
				const parts = line.split(/(\[\[[^\]]+\]\])/);
				for (const part of parts) {
					const link = /^\[\[([^\]]+)\]\]$/.exec(part);
					if (link) {
						const a = document.createElement('a');
						a.className = 'internal-link';
						a.dataset.href = link[1]!;
						a.textContent = link[1]!;
						p.append(a);
					} else p.append(part);
				}
				el.append(p);
			}
			return Promise.resolve(() => {});
		},
		resolveLink: (linktext) => (files[`${linktext}.md`] !== undefined ? `${linktext}.md` : null),
		openHeading: (path, heading, newTab) => opened.push({ path, line: heading.line, newTab }),
		openLink: (linktext, sourcePath, newTab) => links.push({ linktext, sourcePath, newTab }),
		bindPagePreview: (link, linktext, sourcePath) => {
			const release = vi.fn();
			const binding = { link, linktext, sourcePath, hide: vi.fn(), keepOpen: vi.fn(() => release), release };
			pagePreviews.push(binding);
			return binding;
		},
	};
}

async function hover(el: Element) {
	enter(el);
	await vi.advanceTimersByTimeAsync(OPEN_DELAY);
}

describe('TocController', () => {
	let host: ReturnType<typeof makeHost>;
	let toc: TocController;
	let button: HTMLElement;
	let manager: PopupManager;

	beforeEach(() => {
		vi.useFakeTimers();
		document.body.replaceChildren();
		host = makeHost();
		manager = new PopupManager(document);
		toc = new TocController(host, manager);
		button = document.createElement('div');
		document.body.append(button);
	});

	afterEach(() => {
		manager.closeAll();
		vi.useRealTimers();
	});

	const attachMain = () => toc.attachToc(button, { path: 'Main.md', headings: () => host.getHeadings('Main.md') }, { side: 'below', align: 'end' });

	test('hovering the icon shows the table of contents with nesting', async () => {
		attachMain();
		await hover(button);
		const items = q('.htoc-toc .htoc-toc-item');
		expect(items.map((i) => i.textContent)).toEqual(['Main', 'Setup', 'Install', 'Usage']);
		expect(items.map((i) => i.dataset.depth)).toEqual(['0', '1', '2', '1']);
		expect(q('.htoc-toc .htoc-toc-title')[0]!.textContent).toBe('Main');
	});

	test('headings are numbered within their section, or with the numbers of their parents', async () => {
		let numbers: NumberFormat | null = 'level';
		toc = new TocController(host, manager, { linkIcons: () => true, numbers: () => numbers });
		attachMain();
		const shown = async () => {
			manager.closeAll();
			await hover(button);
			return q('.htoc-toc-item').map((i) => [i.dataset.number, i.textContent]);
		};
		expect(await shown()).toEqual([['1.', 'Main'], ['1.', 'Setup'], ['1.', 'Install'], ['2.', 'Usage']]);
		numbers = 'full';
		expect(await shown()).toEqual([['1.', 'Main'], ['1.1.', 'Setup'], ['1.1.1.', 'Install'], ['1.2.', 'Usage']]);
		numbers = null;
		expect(await shown()).toEqual([[undefined, 'Main'], [undefined, 'Setup'], [undefined, 'Install'], [undefined, 'Usage']]);
	});

	test('headings are not numbered by default', async () => {
		attachMain();
		await hover(button);
		expect(q('.htoc-toc-item[data-number]')).toHaveLength(0);
	});

	test('a table of contents of some headings keeps their numbers in the whole note', async () => {
		toc = new TocController(host, manager, { linkIcons: () => true, numbers: () => 'full' });
		const all = host.getHeadings('Main.md');
		toc.attachToc(button, { path: 'Main.md', headings: () => all.slice(1, 3), noteHeadings: () => all }, { side: 'below', align: 'end' });
		await hover(button);
		expect(q('.htoc-toc-item').map((i) => [i.dataset.number, i.textContent])).toEqual([['1.1.', 'Setup'], ['1.1.1.', 'Install']]);
		expect(q('.htoc-toc-item').map((i) => i.dataset.depth)).toEqual(['0', '1']);
	});

	test('headings are read when the popup opens, not when it is attached', async () => {
		let headings: Heading[] = [];
		toc.attachToc(button, { path: 'Main.md', headings: () => headings }, { side: 'below', align: 'end' });
		headings = [{ level: 1, heading: 'Late', line: 0 }];
		await hover(button);
		expect(q('.htoc-toc-item').map((i) => i.textContent)).toEqual(['Late']);
	});

	test('a note without headings shows a message', async () => {
		toc.attachToc(button, { path: 'Empty.md', headings: () => [] }, { side: 'below', align: 'end' });
		await hover(button);
		expect(q('.htoc-toc .htoc-toc-empty')).toHaveLength(1);
		expect(q('.htoc-toc-item')).toHaveLength(0);
	});

	test('clicking an item opens that heading; with a modifier in a new tab', async () => {
		attachMain();
		await hover(button);
		const items = q('.htoc-toc-item');
		items[2]!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		await hover(button);
		q('.htoc-toc-item')[1]!.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));
		expect(host.opened).toEqual([
			{ path: 'Main.md', line: 4, newTab: false },
			{ path: 'Main.md', line: 2, newTab: true },
		]);
	});

	test('clicking an item closes the popups', async () => {
		attachMain();
		await hover(button);
		q('.htoc-toc-item')[0]!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(q('.htoc-popup')).toHaveLength(0);
	});

	test('hovering an item shows a preview of its section', async () => {
		attachMain();
		await hover(button);
		await hover(q('.htoc-toc-item')[1]!);
		const preview = q('.htoc-preview .htoc-preview-content');
		expect(preview).toHaveLength(1);
		expect(preview[0]!.textContent).toContain('Setup');
		expect(preview[0]!.textContent).toContain('npm i');
		expect(preview[0]!.textContent).not.toContain('use it');
	});

	test('the item of the open preview stays marked while the pointer is in the preview and deeper', async () => {
		attachMain();
		await hover(button);
		const active = () => q('.htoc-toc-item.is-active').map((i) => i.textContent);
		const [, setup, , usage] = q('.htoc-toc-item');
		await hover(setup!);
		leave(setup!);
		enter(q('.htoc-preview')[0]!);
		await hover(q('.htoc-preview .htoc-link-toc')[0]!);
		await vi.advanceTimersByTimeAsync(CLOSE_DELAY * 3);
		expect(active()).toEqual(['Setup']);
		await hover(usage!);
		expect(active()).toEqual(['Usage']);
		manager.closeAll();
		expect(usage!.classList.contains('is-active')).toBe(false);
	});

	test('links inside the preview get a T icon with the linked note headings', async () => {
		attachMain();
		await hover(button);
		await hover(q('.htoc-toc-item')[1]!);
		const icons = q('.htoc-preview .htoc-link-toc');
		expect(icons).toHaveLength(1);
		expect(icons[0]!.textContent).toBe('T');
		await hover(icons[0]!);
		const tocs = q('.htoc-toc');
		expect(tocs).toHaveLength(2);
		expect([...tocs[1]!.querySelectorAll('.htoc-toc-item')].map((i) => i.textContent)).toEqual(['Other', 'Other part']);
		// And that nested table of contents previews its own sections too.
		await hover(tocs[1]!.querySelectorAll('.htoc-toc-item')[1]!);
		const previews = q('.htoc-preview-content');
		expect(previews).toHaveLength(2);
		expect(previews[1]!.textContent).toContain('details');
	});

	test('unresolved links get no icon', async () => {
		files['Broken.md'] = '# Broken\nsee [[Nowhere]]';
		toc.attachToc(button, { path: 'Broken.md', headings: () => host.getHeadings('Broken.md') }, { side: 'below', align: 'end' });
		await hover(button);
		await hover(q('.htoc-toc-item')[0]!);
		expect(q('.htoc-preview-content')[0]!.textContent).toContain('Nowhere');
		expect(q('.htoc-link-toc')).toHaveLength(0);
	});

	test('clicking a link inside the preview follows it', async () => {
		attachMain();
		await hover(button);
		await hover(q('.htoc-toc-item')[1]!);
		q('.htoc-preview a.internal-link')[0]!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
		expect(host.links).toEqual([{ linktext: 'Other', sourcePath: 'Main.md', newTab: false }]);
	});

	test('links inside the preview show the Obsidian page preview, hidden when the preview closes', async () => {
		attachMain();
		await hover(button);
		await hover(q('.htoc-toc-item')[1]!);
		expect(host.pagePreviews).toHaveLength(1);
		const [bound] = host.pagePreviews;
		expect(bound!.link).toBe(q('.htoc-preview a.internal-link')[0]);
		expect([bound!.linktext, bound!.sourcePath]).toEqual(['Other', 'Main.md']);
		expect(bound!.hide).not.toHaveBeenCalled();
		manager.closeAll();
		expect(bound!.hide).toHaveBeenCalledOnce();
	});

	test("the T next to a link keeps that link's page preview open while its table of contents is open", async () => {
		attachMain();
		await hover(button);
		await hover(q('.htoc-toc-item')[1]!);
		const [bound] = host.pagePreviews;
		const icon = q('.htoc-preview .htoc-link-toc')[0]!;
		await hover(icon);
		expect(bound!.keepOpen).toHaveBeenCalledOnce();
		expect(bound!.release).not.toHaveBeenCalled();
		leave(icon);
		await vi.advanceTimersByTimeAsync(CLOSE_DELAY);
		expect(q('.htoc-toc')).toHaveLength(1);
		expect(bound!.release).toHaveBeenCalledOnce();
	});

	test('link icons can be turned off; the page preview still works', async () => {
		let linkIcons = false;
		toc = new TocController(host, manager, { linkIcons: () => linkIcons });
		attachMain();
		await hover(button);
		await hover(q('.htoc-toc-item')[1]!);
		expect(q('.htoc-preview a.internal-link')).toHaveLength(1);
		expect(q('.htoc-link-toc')).toHaveLength(0);
		expect(host.pagePreviews).toHaveLength(1);
		linkIcons = true;
		manager.closeAll();
		await hover(button);
		await hover(q('.htoc-toc-item')[1]!);
		expect(q('.htoc-link-toc')).toHaveLength(1);
	});

	describe('links in a note', () => {
		const note = () => {
			const el = document.createElement('div');
			const link = (href: string, internal: boolean) => {
				const a = document.createElement('a');
				if (internal) {
					a.className = 'internal-link';
					a.dataset.href = href;
				} else a.href = href;
				a.textContent = href;
				return a;
			};
			const p = document.createElement('p');
			p.append('Read ', link('Other', true), ', ', link('Nowhere', true), ' and ', link('https://example.com', false), '.');
			el.append(p);
			document.body.append(el);
			return el;
		};

		test('links to notes get a T icon with the linked note headings', async () => {
			const el = note();
			toc.decorateNoteLinks(el, 'Main.md');
			const icons = q('.htoc-note-link-toc');
			expect(icons).toHaveLength(1);
			expect(icons[0]!.previousElementSibling).toBe(el.querySelector('a[data-href="Other"]'));
			await hover(icons[0]!);
			expect(q('.htoc-toc .htoc-toc-item').map((i) => i.textContent)).toEqual(['Other', 'Other part']);
		});

		test('decorating again adds no second icon', () => {
			const el = note();
			toc.decorateNoteLinks(el, 'Main.md');
			toc.decorateNoteLinks(el, 'Main.md');
			expect(q('.htoc-note-link-toc')).toHaveLength(1);
		});

		test('the icons can be removed again', () => {
			const el = note();
			toc.decorateNoteLinks(el, 'Main.md');
			toc.removeNoteLinkIcons(el);
			expect(q('.htoc-note-link-toc')).toHaveLength(0);
			toc.decorateNoteLinks(el, 'Main.md');
			expect(q('.htoc-note-link-toc')).toHaveLength(1);
		});

		test('links inside our own previews are left to the preview', () => {
			const el = note();
			el.classList.add('htoc-popup');
			toc.decorateNoteLinks(el, 'Main.md');
			expect(q('.htoc-note-link-toc')).toHaveLength(0);
		});
	});

	test('attachToc reports the opened table of contents', async () => {
		const opened = vi.fn<(popup: Popup) => void>();
		toc.attachToc(button, { path: 'Main.md', headings: () => host.getHeadings('Main.md') }, { side: 'below', align: 'end' }, opened);
		await hover(button);
		expect(opened).toHaveBeenCalledOnce();
		expect(opened.mock.calls[0]![0].el).toBe(q('.htoc-toc')[0]);
	});

	test('everything closes once the pointer leaves the chain', async () => {
		attachMain();
		await hover(button);
		const item = q('.htoc-toc-item')[1]!;
		await hover(item);
		leave(button);
		leave(item);
		await vi.advanceTimersByTimeAsync(CLOSE_DELAY * 3);
		expect(q('.htoc-popup')).toHaveLength(0);
	});
});
