import { computePosition, type Placement } from './position';

export const OPEN_DELAY = 150;
export const CLOSE_DELAY = 300;

export interface PopupOptions {
	className: string;
	placement: Placement;
	/** Fills `popup.contentEl`; may be async (the popup is repositioned once it resolves). */
	render: (popup: Popup) => void | Promise<void>;
}

/**
 * A hover popup. It stays open while the pointer is over its trigger, over the popup itself,
 * over an element it holds, or while one of its child popups (opened from a trigger inside it) is open.
 */
export class Popup {
	readonly el: HTMLElement;
	readonly contentEl: HTMLElement;
	child: Popup | null = null;
	triggerHovered = true;
	private selfHovered = false;
	/** Held elements the pointer is over. */
	private heldHovered = new Set<HTMLElement>();
	private closed = false;
	private closeTimer: number | undefined;
	private cleanups: (() => void)[] = [];

	constructor(
		readonly manager: PopupManager,
		readonly trigger: HTMLElement,
		readonly parent: Popup | null,
		private readonly options: PopupOptions,
	) {
		const doc = trigger.ownerDocument;
		this.el = doc.createElement('div');
		this.el.className = `htoc-popup ${options.className}`;
		this.contentEl = doc.createElement('div');
		this.contentEl.className = 'htoc-popup-content';
		this.el.append(this.contentEl);
		this.el.addEventListener('mouseenter', () => {
			this.selfHovered = true;
			this.cancelClose();
		});
		this.el.addEventListener('mouseleave', () => {
			this.selfHovered = false;
			this.scheduleClose();
		});
	}

	get isOpen(): boolean {
		return !this.closed;
	}

	/** Registers cleanup to run when the popup closes (e.g. unloading rendered markdown). */
	onClose(cleanup: () => void): void {
		if (this.closed) cleanup();
		else this.cleanups.push(cleanup);
	}

	/**
	 * Treats `el` (e.g. an Obsidian page preview opened from this popup) as part of the popup:
	 * hovering it keeps the popup open, and triggers inside it open child popups.
	 */
	hold(el: HTMLElement): void {
		if (this.closed) return;
		const onEnter = () => {
			this.heldHovered.add(el);
			this.cancelClose();
		};
		const onLeave = () => {
			this.heldHovered.delete(el);
			this.scheduleClose();
		};
		el.addEventListener('mouseenter', onEnter);
		el.addEventListener('mouseleave', onLeave);
		this.manager.registerHeld(el, this);
		this.onClose(() => {
			el.removeEventListener('mouseenter', onEnter);
			el.removeEventListener('mouseleave', onLeave);
			this.manager.forgetHeld(el);
		});
	}

	private get holdHovered(): boolean {
		// A held element can disappear under the pointer without a mouseleave.
		for (const el of this.heldHovered) if (!el.isConnected) this.heldHovered.delete(el);
		return this.heldHovered.size > 0;
	}

	position(): void {
		if (this.closed) return;
		const doc = this.el.ownerDocument;
		const win = doc.defaultView;
		const box = this.el.getBoundingClientRect();
		const { left, top } = computePosition(
			this.trigger.getBoundingClientRect(),
			{ width: box.width, height: box.height },
			{ width: win?.innerWidth ?? 0, height: win?.innerHeight ?? 0 },
			this.options.placement,
		);
		this.el.style.left = `${left}px`;
		this.el.style.top = `${top}px`;
	}

	async render(): Promise<void> {
		try {
			await this.options.render(this);
		} catch (error) {
			this.contentEl.textContent = `Could not render: ${error instanceof Error ? error.message : String(error)}`;
		}
		this.position();
	}

	cancelClose(): void {
		if (this.closeTimer !== undefined) window.clearTimeout(this.closeTimer);
		this.closeTimer = undefined;
	}

	scheduleClose(): void {
		this.cancelClose();
		if (this.closed) return;
		this.closeTimer = window.setTimeout(() => {
			this.closeTimer = undefined;
			this.closeIfIdle();
		}, CLOSE_DELAY);
	}

	private closeIfIdle(): void {
		if (!this.triggerHovered && !this.selfHovered && !this.holdHovered && !this.child) this.close();
	}

	close(): void {
		if (this.closed) return;
		this.closed = true;
		this.cancelClose();
		this.child?.close();
		for (const cleanup of this.cleanups.splice(0)) cleanup();
		this.el.remove();
		this.manager.forget(this);
		if (this.parent) {
			if (this.parent.child === this) this.parent.child = null;
			// The child already waited out the delay; an idle chain closes at once instead of level by level.
			this.parent.closeIfIdle();
		}
	}
}

/** Opens popups on hover of registered triggers; nested triggers produce a chain of popups. */
export class PopupManager {
	private roots = new Set<Popup>();
	private byElement = new WeakMap<HTMLElement, Popup>();
	private byTrigger = new Map<HTMLElement, Popup>();
	private held = new Map<HTMLElement, Popup>();
	private readonly onKeydown = (event: KeyboardEvent) => {
		if (event.key === 'Escape') this.closeAll();
	};

	constructor(private readonly doc: Document) {
		doc.addEventListener('keydown', this.onKeydown);
	}

	/** Shows a popup while `trigger` is hovered. Returns a function that detaches it. */
	attach(trigger: HTMLElement, options: PopupOptions): () => void {
		let openTimer: number | undefined;
		const onEnter = () => {
			const open = this.byTrigger.get(trigger);
			if (open) {
				open.triggerHovered = true;
				open.cancelClose();
				return;
			}
			if (openTimer !== undefined) window.clearTimeout(openTimer);
			openTimer = window.setTimeout(() => {
				openTimer = undefined;
				if (trigger.isConnected) void this.open(trigger, options);
			}, OPEN_DELAY);
		};
		const onLeave = () => {
			if (openTimer !== undefined) window.clearTimeout(openTimer);
			openTimer = undefined;
			const open = this.byTrigger.get(trigger);
			if (open) {
				open.triggerHovered = false;
				open.scheduleClose();
			}
		};
		trigger.addEventListener('mouseenter', onEnter);
		trigger.addEventListener('mouseleave', onLeave);
		return () => {
			if (openTimer !== undefined) window.clearTimeout(openTimer);
			trigger.removeEventListener('mouseenter', onEnter);
			trigger.removeEventListener('mouseleave', onLeave);
			this.byTrigger.get(trigger)?.close();
		};
	}

	/** The popup that contains `el`, directly or through an element it holds, if any. */
	popupOf(el: Element): Popup | null {
		const host = el.closest<HTMLElement>('.htoc-popup');
		if (host) return this.byElement.get(host) ?? null;
		for (const [heldEl, popup] of this.held) if (heldEl.contains(el)) return popup;
		return null;
	}

	registerHeld(el: HTMLElement, popup: Popup): void {
		this.held.set(el, popup);
	}

	forgetHeld(el: HTMLElement): void {
		this.held.delete(el);
	}

	private async open(trigger: HTMLElement, options: PopupOptions): Promise<void> {
		const parent = this.popupOf(trigger);
		if (parent) {
			parent.child?.close();
		} else {
			for (const root of [...this.roots]) root.close();
		}
		const popup = new Popup(this, trigger, parent, options);
		if (parent) parent.child = popup;
		else this.roots.add(popup);
		this.byElement.set(popup.el, popup);
		this.byTrigger.set(trigger, popup);
		this.doc.body.append(popup.el);
		popup.position();
		await popup.render();
	}

	forget(popup: Popup): void {
		this.roots.delete(popup);
		if (this.byTrigger.get(popup.trigger) === popup) this.byTrigger.delete(popup.trigger);
	}

	closeAll(): void {
		for (const root of [...this.roots]) root.close();
	}

	destroy(): void {
		this.closeAll();
		this.doc.removeEventListener('keydown', this.onKeydown);
	}
}
