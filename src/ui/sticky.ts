import { findStickyHeadings, getDisplayText, getSubHeadings, headingNumbers, type Heading } from '../headings';
import type { NumberFormat, StickyMode } from '../settings';
import { createIcon, type TocController } from './toc';

export interface StickyOptions {
	/** The note's view content element; the overlay is pinned to its top. */
	container: HTMLElement;
	toc: TocController;
	path: () => string | null;
	headings: () => Heading[];
	mode: () => StickyMode;
	/** Whether each sticky heading gets a T icon with its subheadings; on when omitted. */
	icons?: () => boolean;
	/** The format sticky headings are numbered in, or null for none; none when omitted. */
	numbers?: () => NumberFormat | null;
	onSelect: (heading: Heading) => void;
}

/**
 * Headings of the section scrolled past, pinned at the top of the note
 * (the approach of obsidian-sticky-heading, driven by the view's top line so it works in every mode).
 */
export class StickyHeadings {
	readonly el: HTMLElement;
	private topLine = 0;
	private shownKey = '';
	private detachers: (() => void)[] = [];

	constructor(private readonly options: StickyOptions) {
		this.el = options.container.createDiv();
		this.el.className = 'htoc-sticky is-empty';
	}

	update(topLine: number): void {
		this.topLine = topLine;
		const all = this.options.headings();
		const sticky = findStickyHeadings(all, topLine, this.options.mode());
		const format = this.options.numbers?.();
		const numbers = format ? headingNumbers(all, format) : null;
		const rows = sticky.map((heading) => ({ heading, number: numbers?.get(heading.line) }));
		const key = JSON.stringify([this.options.path(), rows]);
		if (key === this.shownKey) return;
		this.shownKey = key;
		this.render(rows);
	}

	/** Re-renders after the note's headings or the settings changed. */
	refresh(): void {
		this.shownKey = '';
		this.update(this.topLine);
	}

	private render(sticky: { heading: Heading; number?: string }[]): void {
		for (const detach of this.detachers.splice(0)) detach();
		const doc = this.el.ownerDocument;
		const win = doc.win as typeof window;
		const inner = win.createDiv();
		inner.className = 'htoc-sticky-inner';
		const path = this.options.path();
		for (const { heading, number } of sticky) {
			const row = win.createDiv();
			row.className = 'htoc-sticky-row';
			row.dataset.level = String(heading.level);

			const level = win.createSpan();
			level.className = 'htoc-sticky-level';
			level.textContent = `H${heading.level}`;
			const text = win.createSpan();
			text.className = 'htoc-sticky-text';
			text.textContent = getDisplayText(heading.heading);
			if (number) text.dataset.number = number;
			text.addEventListener('click', () => this.options.onSelect(heading));
			row.append(level, text);

			if (path && (this.options.icons?.() ?? true)) {
				const icon = createIcon(doc, 'htoc-sticky-toc', 'Subheadings');
				this.detachers.push(
					this.options.toc.attachToc(
						icon,
						{ path, headings: () => this.subHeadingsOf(heading), noteHeadings: this.options.headings, title: text.textContent },
						{ side: 'below', align: 'start' },
					),
				);
				row.append(icon);
			}
			inner.append(row);
		}
		this.el.replaceChildren(inner);
		this.el.classList.toggle('is-empty', sticky.length === 0);
	}

	private subHeadingsOf(heading: Heading): Heading[] {
		const all = this.options.headings();
		return getSubHeadings(all, all.findIndex((h) => h.line === heading.line));
	}

	destroy(): void {
		for (const detach of this.detachers.splice(0)) detach();
		this.el.remove();
	}
}
