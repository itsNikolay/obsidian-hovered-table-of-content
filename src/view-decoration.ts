import { syntaxTree } from '@codemirror/language';
import { RangeSetBuilder, type Extension } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { editorInfoField, editorLivePreviewField, type MarkdownView } from 'obsidian';
import { findLinks, type LinkToken } from './links';
import type HoveredTocPlugin from './main';
import { popoverPlacement } from './settings';
import { createTocButton, setButtonPosition } from './ui/button';
import { StickyHeadings } from './ui/sticky';

/** The T button and the sticky headings of one note view. */
export class ViewDecoration {
	path: string | null = null;
	private readonly button: HTMLElement;
	private detachButton: (() => void) | null = null;
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
		// Scroll events do not bubble; capturing catches the reading view and the editor scrollers alike.
		container.addEventListener('scroll', this.onScroll, { capture: true, passive: true });
		this.apply();
	}

	/** Syncs with the current file and settings. */
	apply(): void {
		const { settings } = this.plugin;
		const toc = this.plugin.tocFor(this.view.contentEl.ownerDocument);
		this.path = this.view.file?.path ?? null;
		setButtonPosition(this.button, settings.buttonPosition);
		this.detachButton?.();
		const path = this.path;
		this.detachButton = path && settings.noteIcon
			? toc.attachToc(this.button, { path, headings: () => this.plugin.getHeadings(path) }, popoverPlacement(settings.buttonPosition))
			: null;
		this.button.toggleAttribute('hidden', !path || !settings.noteIcon);
		this.applyLinkIcons();

		if (settings.stickyHeadings && !this.sticky) {
			this.sticky = new StickyHeadings({
				container: this.view.contentEl,
				toc,
				path: () => this.path,
				headings: () => this.plugin.getHeadings(this.path),
				mode: () => this.plugin.settings.stickyMode,
				icons: () => this.plugin.settings.stickyIcons,
				onSelect: (heading) => this.view.currentMode.applyScroll(heading.line),
			});
		} else if (!settings.stickyHeadings && this.sticky) {
			this.sticky.destroy();
			this.sticky = null;
		}
		this.refresh();
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
