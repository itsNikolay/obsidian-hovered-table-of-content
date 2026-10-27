import {
	Component,
	Events,
	MarkdownRenderer,
	MarkdownView,
	Plugin,
	TFile,
	getLinkpath,
	type HeadingCache,
	type HoverParent,
	type HoverPopover,
} from 'obsidian';
import type { Heading } from './headings';
import { normalizeSettings, popoverPlacement, tocNumberFormat, type HoveredTocSettings } from './settings';
import { HoveredTocSettingTab } from './settings-tab';
import { PopupManager, type Popup } from './ui/popup';
import { TocController, createIcon, type TocHost } from './ui/toc';
import { ViewDecoration, noteLinkIcons } from './view-decoration';

const toHeading = (cache: HeadingCache): Heading => ({
	heading: cache.heading,
	level: cache.level,
	line: cache.position.start.line,
});

/** Undocumented HoverPopover members, used only when present. */
interface PopoverInternals {
	targetEl?: HTMLElement | null;
	setIsFocused?: (focused: boolean) => void;
	transition?: () => void;
	hide?: () => void;
}
type Popover = HoverPopover & PopoverInternals;

interface HoverLinkEvent {
	hoverParent: HoverParent;
	targetEl?: HTMLElement | null;
	linktext: string;
	sourcePath: string;
}

const PREVIEW_WAIT = 3000;

/** Keeps a page preview open until the returned function is called. */
function keepOpen(popover: Popover): () => void {
	popover.setIsFocused?.(true);
	return () => {
		popover.setIsFocused?.(false);
		popover.transition?.();
	};
}

export default class HoveredTocPlugin extends Plugin {
	settings!: HoveredTocSettings;
	private host!: TocHost;
	/** One popup layer per window, so popups open in the window of their trigger. */
	private layers = new Map<Document, { popups: PopupManager; toc: TocController }>();
	private decorations = new Map<MarkdownView, ViewDecoration>();
	/** Each removes the T icons added to an open Obsidian page preview. */
	private undecoratePreviews = new Set<() => void>();
	private watchedLinks = new WeakSet<HTMLElement>();
	private handledPreviews = new WeakSet<HTMLElement>();

	async onload() {
		this.settings = normalizeSettings(await this.loadData());
		this.host = this.createHost();
		this.addSettingTab(new HoveredTocSettingTab(this.app, this));
		this.registerHoverLinkSource(this.manifest.id, { display: this.manifest.name, defaultMod: false });
		// hover-link is missing from the typed Workspace events.
		this.registerEvent((this.app.workspace as Events).on('hover-link', (data) => this.onHoverLink(data as HoverLinkEvent)));
		this.registerEditorExtension(noteLinkIcons(this));

		this.app.workspace.onLayoutReady(() => this.decorateViews());
		this.registerEvent(this.app.workspace.on('layout-change', () => this.decorateViews()));
		this.registerEvent(this.app.workspace.on('active-leaf-change', () => this.decorateViews()));
		this.registerEvent(this.app.workspace.on('file-open', () => this.decorateViews()));
		this.registerEvent(
			this.app.metadataCache.on('changed', (file) => {
				for (const decoration of this.decorations.values()) if (decoration.path === file.path) decoration.refresh();
			}),
		);
	}

	onunload() {
		for (const decoration of this.decorations.values()) decoration.destroy();
		this.decorations.clear();
		for (const layer of this.layers.values()) layer.popups.destroy();
		this.layers.clear();
		this.undecorateAllPreviews();
	}

	async saveSettings() {
		await this.saveData(this.settings);
		for (const decoration of this.decorations.values()) decoration.apply();
		this.app.workspace.updateOptions();
		if (!this.settings.linkIcons) this.undecorateAllPreviews();
	}

	getHeadings(path: string | null | undefined): Heading[] {
		const file = path ? this.app.vault.getFileByPath(path) : null;
		return file ? (this.app.metadataCache.getFileCache(file)?.headings ?? []).map(toHeading) : [];
	}

	/** Path of the note a link points to, or null when it does not resolve to a markdown note. */
	resolveLink(linktext: string, sourcePath: string): string | null {
		const target = this.app.metadataCache.getFirstLinkpathDest(getLinkpath(linktext), sourcePath);
		return target instanceof TFile && target.extension === 'md' ? target.path : null;
	}

	tocFor(doc: Document): TocController {
		return this.layerFor(doc).toc;
	}

	private layerFor(doc: Document) {
		let layer = this.layers.get(doc);
		if (!layer) {
			const popups = new PopupManager(doc);
			const options = { linkIcons: () => this.settings.linkIcons, numbers: () => tocNumberFormat(this.settings) };
			layer = { popups, toc: new TocController(this.host, popups, options) };
			this.layers.set(doc, layer);
		}
		return layer;
	}

	/**
	 * A page preview opened from inside our popups (or from a page preview they hold) becomes part of that popup,
	 * so hovering it keeps every open card. Previews of notes get a T button with the note's table of contents.
	 */
	private onHoverLink({ hoverParent, targetEl, linktext, sourcePath }: HoverLinkEvent) {
		if (!targetEl || this.watchedLinks.has(targetEl)) return;
		this.watchedLinks.add(targetEl);
		this.whenPreviewShown(hoverParent, targetEl, (popover) => {
			this.watchedLinks.delete(targetEl);
			if (!popover || this.handledPreviews.has(popover.hoverEl)) return;
			this.handledPreviews.add(popover.hoverEl);
			this.layerFor(targetEl.doc).popups.popupOf(targetEl)?.hold(popover.hoverEl);
			const target = this.app.metadataCache.getFirstLinkpathDest(getLinkpath(linktext), sourcePath);
			if (this.settings.linkIcons && target instanceof TFile && target.extension === 'md') this.decoratePreview(popover, target.path);
		});
	}

	/** A T button with the table of contents of the previewed note, and a T after each link to another note in the preview. */
	private decoratePreview(popover: Popover, path: string) {
		const { hoverEl } = popover;
		const doc = hoverEl.ownerDocument;
		const toc = this.tocFor(doc);
		// The page preview would close once the pointer moves to the table of contents.
		const keepPreview = (popup: Popup) => popup.onClose(keepOpen(popover));
		const button = createIcon(doc, 'htoc-button htoc-preview-button', 'Table of contents');
		hoverEl.append(button);
		toc.attachToc(button, { path, headings: () => this.getHeadings(path) }, popoverPlacement('top-right'), keepPreview);

		// The preview renders the note after it is shown, and again when the note changes.
		let frame: number | null = null;
		const decorateLinks = () => {
			frame = null;
			toc.decorateNoteLinks(hoverEl, path, 'htoc-link-toc', keepPreview);
		};
		decorateLinks();
		const observer = new MutationObserver(() => {
			frame ??= doc.win.requestAnimationFrame(decorateLinks);
		});
		observer.observe(hoverEl, { childList: true, subtree: true });
		const undecorate = () => {
			this.undecoratePreviews.delete(undecorate);
			observer.disconnect();
			if (frame !== null) doc.win.cancelAnimationFrame(frame);
			for (const icon of Array.from(hoverEl.querySelectorAll('.htoc-preview-button, .htoc-link-toc'))) icon.remove();
		};
		this.undecoratePreviews.add(undecorate);
		popover.register(undecorate);
	}

	private undecorateAllPreviews() {
		for (const undecorate of [...this.undecoratePreviews]) undecorate();
	}

	/** Calls back with the page preview that `parent` shows for `targetEl` once it is on screen, or null if it never shows. */
	private whenPreviewShown(parent: HoverParent, targetEl: HTMLElement, callback: (popover: Popover | null) => void) {
		const started = Date.now();
		const check = () => {
			const popover: Popover | null = parent.hoverPopover;
			const forTarget = popover && (popover.targetEl === undefined || popover.targetEl === targetEl);
			if (forTarget && popover.hoverEl.isConnected) callback(popover);
			else if (Date.now() - started < PREVIEW_WAIT) targetEl.win.setTimeout(check, 100);
			else callback(null);
		};
		check();
	}

	/** Adds the T button and sticky headings to every open note, drops them from closed ones. */
	private decorateViews() {
		const views = new Set<MarkdownView>();
		this.app.workspace.iterateAllLeaves((leaf) => {
			if (leaf.view instanceof MarkdownView) views.add(leaf.view);
		});
		for (const [view, decoration] of this.decorations) {
			if (!views.has(view)) {
				decoration.destroy();
				this.decorations.delete(view);
			}
		}
		for (const view of views) {
			const decoration = this.decorations.get(view);
			if (!decoration) this.decorations.set(view, new ViewDecoration(this, view));
			else if (decoration.path !== view.file?.path) decoration.apply();
			// Switching between reading view and the editor moves the inline title.
			else decoration.placeButton();
		}
	}

	private createHost(): TocHost {
		const { app } = this;
		const fileOf = (path: string) => app.vault.getFileByPath(path);
		return {
			getHeadings: (path) => this.getHeadings(path),
			getTitle: (path) => fileOf(path)?.basename ?? path,
			readFile: async (path) => {
				const file = fileOf(path);
				return file ? app.vault.cachedRead(file) : '';
			},
			renderMarkdown: async (markdown, el, sourcePath) => {
				const component = new Component();
				component.load();
				await MarkdownRenderer.render(app, markdown, el, sourcePath, component);
				return () => component.unload();
			},
			resolveLink: (linktext, sourcePath) => this.resolveLink(linktext, sourcePath),
			openHeading: (path, heading, newTab) => {
				const file = fileOf(path);
				if (!file) return;
				const showing = app.workspace
					.getLeavesOfType('markdown')
					.filter((leaf) => leaf.view instanceof MarkdownView && leaf.view.file?.path === path);
				const active = app.workspace.getActiveViewOfType(MarkdownView)?.leaf;
				const leaf = newTab
					? app.workspace.getLeaf('tab')
					: showing.find((l) => l === active) ?? showing[0] ?? app.workspace.getLeaf(false);
				void leaf.openFile(file, { active: true, eState: { line: heading.line } });
			},
			openLink: (linktext, sourcePath, newTab) => {
				void app.workspace.openLinkText(linktext, sourcePath, newTab);
			},
			bindPagePreview: (link, linktext, sourcePath) => {
				const hoverParent: HoverParent = { hoverPopover: null };
				const current = (): Popover | null => hoverParent.hoverPopover;
				link.addEventListener('mouseover', (event) => {
					app.workspace.trigger('hover-link', { event, source: this.manifest.id, hoverParent, targetEl: link, linktext, sourcePath });
				});
				return {
					hide: () => current()?.hide?.(),
					keepOpen: () => {
						const popover = current();
						return popover ? keepOpen(popover) : () => {};
					},
				};
			},
		};
	}
}
