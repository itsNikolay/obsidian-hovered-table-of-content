import { describe, expect, test } from 'vitest';
import { createTocButton, setButtonPosition } from '../../src/ui/button';

describe('TOC button', () => {
	test('is a T icon with an accessible label at the chosen position', () => {
		const button = createTocButton(document, 'bottom-left');
		expect(button.textContent).toBe('T');
		expect(button.classList.contains('htoc-icon')).toBe(true);
		expect(button.classList.contains('htoc-button')).toBe(true);
		expect(button.classList.contains('htoc-pos-bottom-left')).toBe(true);
		expect(button.getAttribute('aria-label')).toBe('Table of contents');
	});

	test('moving it replaces the previous position class', () => {
		const button = createTocButton(document, 'top-right');
		setButtonPosition(button, 'bottom-center');
		expect([...button.classList].filter((c) => c.startsWith('htoc-pos-'))).toEqual(['htoc-pos-bottom-center']);
	});
});
