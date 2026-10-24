import { syntaxTree } from '@codemirror/language';
import { RangeSetBuilder, type Extension } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { editorInfoField, editorLivePreviewField, type MarkdownView } from 'obsidian';
import { findLinks, type LinkToken } from './links';
import type HoveredTocPlugin from './main';
import { popoverPlacement, stickyNumberFormat, type ButtonPosition } from './settings';
import { createTocButton, placeAfterTitle, setButtonPosition } from './ui/button';
import type { Placement } from './ui/position';
import { StickyHeadings } from './ui/sticky';

/** From the T after the title, the table of contents opens below it, over the note text. */
const TITLE_PLACEMENT: Placement = { side: 'below', align: 'start' };

/** The T button and the sticky headings of one note view. */
export class ViewDecoration {
	path: string | null = null;
	private readonly button: HTMLElement;
	private detachButton: (() => void) | null = null;
	/** Where the table of contents of the button opens from: after the title or a corner; null when not attached. */
	private buttonAt: 'title' | ButtonPosition | null = null;
	/** The inline title the button follows, and the scroller of the note they both sit in. */
	private title: HTMLElement | null = null;
	private titleHost: HTMLElement | null = null;
	private readonly titleResize: ResizeObserver;
	private readonly titleText = new MutationObserver(() => this.placeButton());
	private sticky: StickyHeadings | null = null;
	private frame: number | null = null;
	private linkObserver: MutationObserver | null = null;
	private linkFrame: number | null = null;

	constructor(
		private readonly plugin: HoveredTocPlugin,
		private readonly view: MarkdownView,
	) {
		const container = view.contentEl;
		container.classList.add('htoc-host');
		this.button = createTocButton(container.ownerDocument, plugin.settings.buttonPosition);
		container.append(this.button);
		// Observed from the window of the note, which can be a popout window.
		this.titleResize = new (container.ownerDocument.win as typeof window).ResizeObserver(() => this.placeButton());
		// A web font that loads late changes where the title text ends.
		container.ownerDocument.fonts.addEventListener('loadingdone', this.placeButton);
		// Scroll events do not bubble; capturing catches the reading view and the editor scrollers alike.
		container.addEventListener('scroll', this.onScroll, { capture: true, passive: true });
		this.apply();
	}

	/** Syncs with the current file and settings. */
	apply(): void {
		const { settings } = this.plugin;
		const toc = this.plugin.tocFor(this.view.contentEl.ownerDocument);
		this.path = this.view.file?.path ?? null;
		// Attach the table of contents again for the new file and settings.
		this.buttonAt = null;
		this.placeButton();
		this.button.toggleAttribute('hidden', !this.path || !settings.noteIcon);
		this.applyLinkIcons();

		if (settings.stickyHeadings && !this.sticky) {
			this.sticky = new StickyHeadings({
				container: this.view.contentEl,
				toc,
				path: () => this.path,
				headings: () => this.plugin.getHeadings(this.path),
				mode: () => this.plugin.settings.stickyMode,
				icons: () => this.plugin.settings.stickyIcons,
				numbers: () => stickyNumberFormat(this.plugin.settings),
				onSelect: (heading) => this.view.currentMode.applyScroll(heading.line),
			});
		} else if (!settings.stickyHeadings && this.sticky) {
			this.sticky.destroy();
			this.sticky = null;
		}
		this.refresh();
	}

	/**
	 * Puts the T button right after the inline title, or at its corner when it does not follow the title
	 * or Obsidian hides the title. Reading view and the editor share one title element and move it between them.
	 */
	readonly placeButton = (): void => {
		const { settings } = this.plugin;
		const container = this.view.contentEl;
		// The undocumented `inlineTitleEl` is the title even while it is out of the page.
		const title = settings.titleIcon
			? (this.view as MarkdownView & { inlineTitleEl?: HTMLElement }).inlineTitleEl ?? container.querySelector<HTMLElement>('.inline-title')
			: null;
		// Reading view takes the title out of the page while the note is scrolled far from it:
		// the button stays out of sight with it until the title is back.
		const away = title !== null && !title.isConnected;
		// A title hidden in the Obsidian settings has no offset parent; a shown one sits in the scroller of the note.
		const host = away ? this.titleHost : ((title?.offsetParent ?? null) as HTMLElement | null);
		this.watchTitle(title, host);
		if (title && host) {
			if (!away) {
				if (this.button.parentElement !== host) host.append(this.button);
				placeAfterTitle(this.button, title, host);
			}
			this.attachButton('title');
		} else {
			if (this.button.parentElement !== container) container.append(this.button);
			setButtonPosition(this.button, settings.buttonPosition);
			this.attachButton(settings.buttonPosition);
		}
	};

	/** Places the button again when the title is shown, hidden, resized or renamed, or the note around it resizes. */
	private watchTitle(title: HTMLElement | null, host: HTMLElement | null): void {
		if (title === this.title && host === this.titleHost) return;
		this.titleResize.disconnect();
		this.titleText.disconnect();
		this.title = title;
		this.titleHost = host;
		if (title) {
			this.titleResize.observe(title);
			this.titleText.observe(title, { characterData: true, childList: true, subtree: true });
		}
		if (host) this.titleResize.observe(host);
	}

	private attachButton(at: 'title' | ButtonPosition): void {
		if (at === this.buttonAt) return;
		this.buttonAt = at;
		this.detachButton?.();
		const path = this.path;
		this.detachButton = path && this.plugin.settings.noteIcon
			? this.plugin.tocFor(this.view.contentEl.ownerDocument)
				.attachToc(this.button, { path, headings: () => this.plugin.getHeadings(path) }, at === 'title' ? TITLE_PLACEMENT : popoverPlacement(at))
			: null;
	}

	/** T icons next to links in Reading view; sections render lazily, so new ones are watched for. */
	private applyLinkIcons(): void {
		const reading = this.view.previewMode.containerEl;
		const toc = this.plugin.tocFor(reading.ownerDocument);
		toc.removeNoteLinkIcons(reading);
		if (!this.plugin.settings.noteLinkIcons) {
			this.linkObserver?.disconnect();
			this.linkObserver = null;
			return;
		}
		const decorate = () => {
			this.linkFrame = null;
			if (this.path) toc.decorateNoteLinks(reading, this.path);
		};
		decorate();
		this.linkObserver ??= new MutationObserver(() => {
			this.linkFrame ??= window.requestAnimationFrame(decorate);
		});
		this.linkObserver.observe(reading, { childList: true, subtree: true });
	}

	refresh(): void {
		this.sticky?.refresh();
		this.updateSticky();
	}

	private readonly onScroll = () => {
		if (this.frame !== null || !this.sticky) return;
		this.frame = window.requestAnimationFrame(() => {
			this.frame = null;
			this.updateSticky();
		});
	};

	private updateSticky(): void {
		if (!this.sticky) return;
		const top = this.view.currentMode.getScroll();
		this.sticky.update(Number.isFinite(top) ? top : 0);
	}

	destroy(): void {
		if (this.frame !== null) window.cancelAnimationFrame(this.frame);
		if (this.linkFrame !== null) window.cancelAnimationFrame(this.linkFrame);
		this.linkObserver?.disconnect();
		this.titleResize.disconnect();
		this.titleText.disconnect();
		this.view.contentEl.ownerDocument.fonts.removeEventListener('loadingdone', this.placeButton);
		this.plugin.tocFor(this.view.contentEl.ownerDocument).removeNoteLinkIcons(this.view.previewMode.containerEl);
		this.view.contentEl.removeEventListener('scroll', this.onScroll, { capture: true });
		this.detachButton?.();
		this.sticky?.destroy();
		this.button.remove();
		this.view.contentEl.classList.remove('htoc-host');
	}
}

class LinkIconWidget extends WidgetType {
	constructor(
		private readonly plugin: HoveredTocPlugin,
		readonly target: string,
	) {
		super();
	}

	eq(other: LinkIconWidget): boolean {
		return other.target === this.target;
	}

	toDOM(view: EditorView): HTMLElement {
		const doc = view.dom.ownerDocument;
		return this.plugin.tocFor(doc).createLinkIcon(doc, 'htoc-note-link-toc', this.target);
	}

	ignoreEvent(): boolean {
		return true;
	}
}

/** T icons next to links to other notes in Live Preview. */
export function noteLinkIcons(plugin: HoveredTocPlugin): Extension {
	const build = (view: EditorView): DecorationSet => {
		const { state } = view;
		const path = state.field(editorInfoField, false)?.file?.path;
		if (!plugin.settings.noteLinkIcons || !state.field(editorLivePreviewField, false) || !path) return Decoration.none;
		const tokens: LinkToken[] = [];
		syntaxTree(state).iterate({
			from: view.viewport.from,
			to: view.viewport.to,
			enter: (node) => {
				tokens.push({ name: node.name, from: node.from, to: node.to, text: state.sliceDoc(node.from, node.to) });
			},
		});
		const builder = new RangeSetBuilder<Decoration>();
		for (const link of findLinks(tokens)) {
			const target = plugin.resolveLink(link.linktext, path);
			if (target) builder.add(link.end, link.end, Decoration.widget({ widget: new LinkIconWidget(plugin, target), side: 1 }));
		}
		return builder.finish();
	};
	return ViewPlugin.fromClass(
		class {
			decorations: DecorationSet;
			constructor(view: EditorView) {
				this.decorations = build(view);
			}
			update(update: ViewUpdate) {
				const { startState, state } = update;
				if (
					update.docChanged ||
					update.viewportChanged ||
					update.transactions.some((tr) => tr.reconfigured) ||
					syntaxTree(startState) !== syntaxTree(state) ||
					startState.field(editorLivePreviewField, false) !== state.field(editorLivePreviewField, false)
				)
					this.decorations = build(update.view);
			}
		},
		{ decorations: (plugin) => plugin.decorations },
	);
}
