import { positionClass, type ButtonPosition } from '../settings';
import { createIcon } from './toc';

export function createTocButton(doc: Document, position: ButtonPosition): HTMLElement {
	const button = createIcon(doc, 'htoc-button', 'Table of contents');
	setButtonPosition(button, position);
	return button;
}

export function setButtonPosition(el: HTMLElement, position: ButtonPosition): void {
	clearPlacement(el);
	el.classList.add(positionClass(position));
}

/**
 * Puts the button right after the end of the title text, in the middle of its last line.
 * `host` is the containing block of the button: the scroller of the note, so the button scrolls with the title.
 */
export function placeAfterTitle(el: HTMLElement, title: HTMLElement, host: HTMLElement): void {
	clearPlacement(el);
	el.classList.add('htoc-after-title');
	const range = title.ownerDocument.createRange();
	range.selectNodeContents(title);
	const lines = range.getClientRects();
	const last = lines.length > 0 ? lines[lines.length - 1] : null;
	const line = last ?? title.getBoundingClientRect();
	const box = host.getBoundingClientRect();
	// Coordinates in the scrolled content of the host, inside its border.
	el.style.setProperty('--htoc-title-left', `${Math.round((last ? line.right : line.left) - box.left - host.clientLeft + host.scrollLeft)}px`);
	el.style.setProperty('--htoc-title-top', `${Math.round(line.top + line.height / 2 - box.top - host.clientTop + host.scrollTop)}px`);
}

function clearPlacement(el: HTMLElement): void {
	for (const name of Array.from(el.classList)) if (name.startsWith('htoc-pos-')) el.classList.remove(name);
	el.classList.remove('htoc-after-title');
	el.style.removeProperty('--htoc-title-left');
	el.style.removeProperty('--htoc-title-top');
}
