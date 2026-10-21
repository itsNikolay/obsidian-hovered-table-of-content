import { positionClass, type ButtonPosition } from '../settings';
import { createIcon } from './toc';

export function createTocButton(doc: Document, position: ButtonPosition): HTMLElement {
	const button = createIcon(doc, 'htoc-button', 'Table of contents');
	setButtonPosition(button, position);
	return button;
}

export function setButtonPosition(el: HTMLElement, position: ButtonPosition): void {
	for (const name of Array.from(el.classList)) if (name.startsWith('htoc-pos-')) el.classList.remove(name);
	el.classList.add(positionClass(position));
}
