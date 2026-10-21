import { describe, expect, test } from 'vitest';
import {
	BUTTON_POSITIONS,
	DEFAULT_SETTINGS,
	normalizeSettings,
	popoverPlacement,
	positionClass,
} from '../../src/settings';

describe('settings', () => {
	test('sticky headings are on by default and the icon sits top right', () => {
		expect(DEFAULT_SETTINGS.stickyHeadings).toBe(true);
		expect(DEFAULT_SETTINGS.buttonPosition).toBe('top-right');
		expect(DEFAULT_SETTINGS.stickyMode).toBe('path');
	});

	test('every T icon is shown by default', () => {
		expect(DEFAULT_SETTINGS.noteIcon).toBe(true);
		expect(DEFAULT_SETTINGS.linkIcons).toBe(true);
		expect(DEFAULT_SETTINGS.noteLinkIcons).toBe(true);
		expect(DEFAULT_SETTINGS.stickyIcons).toBe(true);
	});

	test('offers the six screen positions', () => {
		expect([...BUTTON_POSITIONS]).toEqual([
			'top-left',
			'top-center',
			'top-right',
			'bottom-left',
			'bottom-center',
			'bottom-right',
		]);
	});

	test('keeps valid saved values and repairs invalid ones', () => {
		const saved = { buttonPosition: 'bottom-center', stickyHeadings: false, stickyMode: 'prev', noteIcon: false, linkIcons: false, noteLinkIcons: false, stickyIcons: false };
		expect(normalizeSettings(saved)).toEqual(saved);
		expect(normalizeSettings({ buttonPosition: 'middle', stickyHeadings: 'yes', stickyMode: 1, noteIcon: 0, linkIcons: 'no', noteLinkIcons: 1, stickyIcons: null })).toEqual(DEFAULT_SETTINGS);
		expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
		expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
	});

	test('returns a fresh object each time', () => {
		expect(normalizeSettings(null)).not.toBe(DEFAULT_SETTINGS);
	});

	test('maps every position to a css class', () => {
		expect(BUTTON_POSITIONS.map(positionClass)).toEqual([
			'htoc-pos-top-left',
			'htoc-pos-top-center',
			'htoc-pos-top-right',
			'htoc-pos-bottom-left',
			'htoc-pos-bottom-center',
			'htoc-pos-bottom-right',
		]);
	});

	test('the popover opens towards the middle of the note', () => {
		expect(popoverPlacement('top-left')).toEqual({ side: 'below', align: 'start' });
		expect(popoverPlacement('top-center')).toEqual({ side: 'below', align: 'center' });
		expect(popoverPlacement('top-right')).toEqual({ side: 'below', align: 'end' });
		expect(popoverPlacement('bottom-left')).toEqual({ side: 'above', align: 'start' });
		expect(popoverPlacement('bottom-center')).toEqual({ side: 'above', align: 'center' });
		expect(popoverPlacement('bottom-right')).toEqual({ side: 'above', align: 'end' });
	});
});
