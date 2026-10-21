import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { CLOSE_DELAY, OPEN_DELAY, PopupManager } from '../../src/ui/popup';

const enter = (el: Element) => el.dispatchEvent(new MouseEvent('mouseenter'));
const leave = (el: Element) => el.dispatchEvent(new MouseEvent('mouseleave'));
const popups = () => [...document.body.querySelectorAll('.htoc-popup')];

describe('PopupManager', () => {
	let manager: PopupManager;
	let trigger: HTMLElement;

	beforeEach(() => {
		vi.useFakeTimers();
		document.body.replaceChildren();
		manager = new PopupManager(document);
		trigger = document.createElement('button');
		document.body.append(trigger);
	});

	afterEach(() => {
		manager.closeAll();
		vi.useRealTimers();
	});

	const attachText = (target: HTMLElement, text: string) =>
		manager.attach(target, {
			className: 'test-popup',
			placement: { side: 'below', align: 'start' },
			render: (popup) => {
				popup.contentEl.textContent = text;
			},
		});

	test('opens after the hover delay and closes after leaving', () => {
		attachText(trigger, 'hello');
		enter(trigger);
		expect(popups()).toHaveLength(0);
		vi.advanceTimersByTime(OPEN_DELAY);
		expect(popups()).toHaveLength(1);
		expect(popups()[0]!.classList.contains('test-popup')).toBe(true);
		expect(popups()[0]!.textContent).toBe('hello');
		leave(trigger);
		vi.advanceTimersByTime(CLOSE_DELAY);
		expect(popups()).toHaveLength(0);
	});

	test('a quick pass over the trigger does not open anything', () => {
		attachText(trigger, 'hello');
		enter(trigger);
		leave(trigger);
		vi.advanceTimersByTime(OPEN_DELAY * 2);
		expect(popups()).toHaveLength(0);
	});

	test('moving from the trigger into the popup keeps it open', () => {
		attachText(trigger, 'hello');
		enter(trigger);
		vi.advanceTimersByTime(OPEN_DELAY);
		leave(trigger);
		enter(popups()[0]!);
		vi.advanceTimersByTime(CLOSE_DELAY * 3);
		expect(popups()).toHaveLength(1);
		leave(popups()[0]!);
		vi.advanceTimersByTime(CLOSE_DELAY);
		expect(popups()).toHaveLength(0);
	});

	test('a trigger inside a popup opens a child that keeps the whole chain open', () => {
		manager.attach(trigger, {
			className: 'parent',
			placement: { side: 'below', align: 'start' },
			render: (popup) => {
				const inner = document.createElement('span');
				inner.className = 'inner-trigger';
				popup.contentEl.append(inner);
				attachText(inner, 'child');
			},
		});
		enter(trigger);
		vi.advanceTimersByTime(OPEN_DELAY);
		const parent = popups()[0]!;
		leave(trigger);
		enter(parent);
		const inner = parent.querySelector('.inner-trigger')!;
		enter(inner);
		vi.advanceTimersByTime(OPEN_DELAY);
		expect(popups()).toHaveLength(2);
		const child = popups()[1]!;
		leave(inner);
		leave(parent);
		enter(child);
		vi.advanceTimersByTime(CLOSE_DELAY * 3);
		expect(popups()).toHaveLength(2);
		leave(child);
		vi.advanceTimersByTime(CLOSE_DELAY * 3);
		expect(popups()).toHaveLength(0);
	});

	test('an element held by a popup keeps it open and nests the popups opened from it', () => {
		const outside = document.createElement('div'); // e.g. an Obsidian page preview opened from the popup
		const outsideTrigger = document.createElement('span');
		outside.append(outsideTrigger);
		document.body.append(outside);
		manager.attach(trigger, {
			className: 'parent',
			placement: { side: 'below', align: 'start' },
			render: (popup) => popup.hold(outside),
		});
		attachText(outsideTrigger, 'child');
		enter(trigger);
		vi.advanceTimersByTime(OPEN_DELAY);
		leave(trigger);
		enter(outside);
		vi.advanceTimersByTime(CLOSE_DELAY * 3);
		expect(popups()).toHaveLength(1);
		enter(outsideTrigger);
		vi.advanceTimersByTime(OPEN_DELAY);
		expect(popups()).toHaveLength(2); // a child, so the parent stays
		const child = popups()[1]!;
		leave(outsideTrigger);
		leave(outside);
		enter(child);
		vi.advanceTimersByTime(CLOSE_DELAY * 3);
		expect(popups()).toHaveLength(2);
		leave(child);
		vi.advanceTimersByTime(CLOSE_DELAY * 3);
		expect(popups()).toHaveLength(0);
	});

	test('a held element that is removed while hovered no longer keeps the popup open', () => {
		const outside = document.createElement('div');
		document.body.append(outside);
		manager.attach(trigger, {
			className: 'parent',
			placement: { side: 'below', align: 'start' },
			render: (popup) => popup.hold(outside),
		});
		enter(trigger);
		vi.advanceTimersByTime(OPEN_DELAY);
		enter(outside);
		leave(trigger);
		outside.remove();
		vi.advanceTimersByTime(CLOSE_DELAY);
		expect(popups()).toHaveLength(0);
	});

	test('leaving a deep chain closes all of it after a single delay', () => {
		let depth = 0;
		const nest = (target: HTMLElement) =>
			manager.attach(target, {
				className: `level-${depth++}`,
				placement: { side: 'below', align: 'start' },
				render: (popup) => {
					const inner = document.createElement('span');
					inner.className = 'inner-trigger';
					popup.contentEl.append(inner);
					nest(inner);
				},
			});
		nest(trigger);
		let target: Element = trigger;
		for (let level = 0; level < 4; level++) {
			enter(target);
			vi.advanceTimersByTime(OPEN_DELAY);
			leave(target);
			const popup = popups()[level]!;
			enter(popup);
			target = popup.querySelector('.inner-trigger')!;
		}
		expect(popups()).toHaveLength(4);
		for (const popup of popups()) leave(popup);
		vi.advanceTimersByTime(CLOSE_DELAY);
		expect(popups()).toHaveLength(0);
	});

	test('opening another root closes the previous one', () => {
		const second = document.createElement('button');
		document.body.append(second);
		attachText(trigger, 'one');
		attachText(second, 'two');
		enter(trigger);
		vi.advanceTimersByTime(OPEN_DELAY);
		enter(second);
		vi.advanceTimersByTime(OPEN_DELAY);
		expect(popups().map((p) => p.textContent)).toEqual(['two']);
	});

	test('a sibling trigger in the same popup replaces the open child', () => {
		manager.attach(trigger, {
			className: 'parent',
			placement: { side: 'below', align: 'start' },
			render: (popup) => {
				for (const name of ['a', 'b']) {
					const item = document.createElement('span');
					item.className = `item-${name}`;
					popup.contentEl.append(item);
					attachText(item, name);
				}
			},
		});
		enter(trigger);
		vi.advanceTimersByTime(OPEN_DELAY);
		const parent = popups()[0]!;
		enter(parent.querySelector('.item-a')!);
		vi.advanceTimersByTime(OPEN_DELAY);
		leave(parent.querySelector('.item-a')!);
		enter(parent.querySelector('.item-b')!);
		vi.advanceTimersByTime(OPEN_DELAY);
		expect(popups().slice(1).map((p) => p.textContent)).toEqual(['b']);
	});

	test('escape closes everything, detach stops listening', () => {
		const detach = attachText(trigger, 'hello');
		enter(trigger);
		vi.advanceTimersByTime(OPEN_DELAY);
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
		expect(popups()).toHaveLength(0);
		detach();
		enter(trigger);
		vi.advanceTimersByTime(OPEN_DELAY);
		expect(popups()).toHaveLength(0);
	});

	test('closing calls cleanup registered by render', () => {
		const cleanup = vi.fn();
		manager.attach(trigger, {
			className: 'x',
			placement: { side: 'below', align: 'start' },
			render: (popup) => popup.onClose(cleanup),
		});
		enter(trigger);
		vi.advanceTimersByTime(OPEN_DELAY);
		manager.closeAll();
		expect(cleanup).toHaveBeenCalledOnce();
	});
});
