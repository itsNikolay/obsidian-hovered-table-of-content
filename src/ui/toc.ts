import { extractSection, getDisplayText, withDepth, type Heading } from '../headings';
import type { Popup, PopupManager } from './popup';
import type { Placement } from './position';

/** What the UI needs from Obsidian; implemented in main.ts, faked in tests. */
export interface TocHost {
	getHeadings(path: string): Heading[];
	getTitle(path: string): string;
	readFile(path: string): Promise<string>;
	/** Renders markdown into `el`; resolves to a function that releases the rendered content. */
	renderMarkdown(markdown: string, el: HTMLElement, sourcePath: string): Promise<() => void>;
	/** Path of the note a link points to, or null when it does not resolve to a markdown note. */
	resolveLink(linktext: string, sourcePath: string): string | null;
	openHeading(path: string, heading: Heading, newTab: boolean): void;
	openLink(linktext: string, sourcePath: string, newTab: boolean): void;
	/** Lets hovering `link` show Obsidian's page preview of the linked note. */
	bindPagePreview(link: HTMLElement, linktext: string, sourcePath: string): PagePreview;
}

export interface PagePreview {
	hide(): void;
	/** Keeps the page preview open, if it is showing, until the returned function is called. */
	keepOpen(): () => void;
}

export interface TocOptions {
	/** Whether links in previews get a T icon. */
	linkIcons: () => boolean;
}

export interface TocSource {
	path: string;
	/** Read when the popup opens, so it always reflects the current note. */
	headings: () => Heading[];
	/** Popup title; defaults to the note name. */
	title?: string;
}

const PREVIEW_PLACEMENT: Placement = { side: 'right', align: 'start' };
const isModEvent = (event: MouseEvent) => event.ctrlKey || event.metaKey;

export function createIcon(doc: Document, className: string, label: string): HTMLElement {
	const icon = doc.createElement('div');
	icon.className = `htoc-icon ${className}`;
	icon.textContent = 'T';
	icon.setAttribute('aria-label', label);
	return icon;
}

/** Table of contents popups: a list of headings, each previewing its section on hover. */
export class TocController {
	constructor(
		private readonly host: TocHost,
		private readonly popups: PopupManager,
		private readonly options: TocOptions = { linkIcons: () => true },
	) {}

	/** `onOpen` is called with each table of contents popup that opens from `trigger`. */
	attachToc(trigger: HTMLElement, source: TocSource, placement: Placement, onOpen?: (popup: Popup) => void): () => void {
		return this.popups.attach(trigger, {
			className: 'htoc-toc',
			placement,
			render: (popup) => {
				onOpen?.(popup);
				this.renderToc(popup, source);
			},
		});
	}

	private renderToc(popup: Popup, source: TocSource): void {
		const doc = popup.contentEl.ownerDocument;
		const title = doc.createElement('div');
		title.className = 'htoc-toc-title';
		title.textContent = source.title ?? this.host.getTitle(source.path);
		popup.contentEl.append(title);

		const headings = source.headings();
		if (headings.length === 0) {
			const empty = doc.createElement('div');
			empty.className = 'htoc-toc-empty';
			empty.textContent = 'No headings';
			popup.contentEl.append(empty);
			return;
		}
		const list = doc.createElement('div');
		list.className = 'htoc-toc-list';
		for (const { heading, depth } of withDepth(headings)) {
			const item = doc.createElement('div');
			item.className = 'htoc-toc-item';
			item.dataset.depth = String(depth);
			item.dataset.line = String(heading.line);
			item.style.setProperty('--htoc-depth', String(depth));
			item.textContent = getDisplayText(heading.heading);
			item.addEventListener('click', (event) => {
				this.popups.closeAll();
				this.host.openHeading(source.path, heading, isModEvent(event));
			});
			this.popups.attach(item, {
				className: 'htoc-preview',
				placement: PREVIEW_PLACEMENT,
				render: (preview) => this.renderPreview(preview, source.path, heading),
			});
			list.append(item);
		}
		popup.contentEl.append(list);
	}

	private async renderPreview(popup: Popup, path: string, heading: Heading): Promise<void> {
		const all = this.host.getHeadings(path);
		const found = all.findIndex((h) => h.line === heading.line);
		const headings = found >= 0 ? all : [heading];
		const content = await this.host.readFile(path);
		const markdown = extractSection(content, headings, Math.max(found, 0));

		const container = popup.contentEl.ownerDocument.createElement('div');
		container.className = 'htoc-preview-content markdown-rendered';
		popup.contentEl.append(container);
		const release = await this.host.renderMarkdown(markdown, container, path);
		popup.onClose(release);
		this.decorateLinks(popup, container, path);
	}

	/**
	 * Links show Obsidian's page preview on hover, and every link to another note
	 * gets a T icon that opens that note's table of contents.
	 */
	private decorateLinks(popup: Popup, container: HTMLElement, sourcePath: string): void {
		for (const link of Array.from(container.querySelectorAll<HTMLAnchorElement>('a.internal-link'))) {
			const linktext = link.dataset.href ?? link.getAttribute('href') ?? '';
			link.addEventListener('click', (event) => {
				event.preventDefault();
				this.popups.closeAll();
				this.host.openLink(linktext, sourcePath, isModEvent(event));
			});
			const pagePreview = this.host.bindPagePreview(link, linktext, sourcePath);
			popup.onClose(() => pagePreview.hide());
			const target = this.host.resolveLink(linktext, sourcePath);
			if (!target || !this.options.linkIcons()) continue;
			// Keep the page preview of the link (if open) next to its table of contents.
			link.after(this.createLinkIcon(container.ownerDocument, 'htoc-link-toc', target, (toc) => toc.onClose(pagePreview.keepOpen())));
		}
	}

	/** A T icon that opens the table of contents of the note at `target`. */
	createLinkIcon(doc: Document, className: string, target: string, onOpen?: (popup: Popup) => void): HTMLElement {
		const icon = createIcon(doc, className, 'Table of contents of the linked note');
		this.attachToc(icon, { path: target, headings: () => this.host.getHeadings(target) }, PREVIEW_PLACEMENT, onOpen);
		return icon;
	}

	/** Adds a T icon after each link to another note in a rendered note; links that already have one are skipped. */
	decorateNoteLinks(container: HTMLElement, sourcePath: string): void {
		for (const link of Array.from(container.querySelectorAll<HTMLAnchorElement>('a.internal-link'))) {
			if (link.nextElementSibling?.classList.contains('htoc-icon') || link.closest('.htoc-popup')) continue;
			const target = this.host.resolveLink(link.dataset.href ?? link.getAttribute('href') ?? '', sourcePath);
			if (target) link.after(this.createLinkIcon(container.ownerDocument, 'htoc-note-link-toc', target));
		}
	}

	removeNoteLinkIcons(container: HTMLElement): void {
		for (const icon of Array.from(container.querySelectorAll('.htoc-note-link-toc'))) icon.remove();
	}
}
