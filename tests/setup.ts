// Obsidian installs these DOM extensions at runtime; jsdom needs small stand-ins.
if (typeof document !== 'undefined') {
	Object.defineProperty(Document.prototype, 'win', { configurable: true, get(this: Document) { return this.defaultView ?? window; } });
	window.createDiv = () => document.createElement('div');
	window.createSpan = () => document.createElement('span');
	Node.prototype.createDiv = function () {
		const el = (this.ownerDocument ?? document).createElement('div');
		this.appendChild(el);
		return el;
	};
	// jsdom has no layout, so nothing ever resizes.
	window.ResizeObserver ??= class {
		observe() {}
		unobserve() {}
		disconnect() {}
	};
}
