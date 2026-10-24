import { describe, expect, test } from 'vitest';
import {
	BUTTON_POSITIONS,
	DEFAULT_SETTINGS,
	NUMBER_FORMATS,
	normalizeSettings,
	popoverPlacement,
	positionClass,
	stickyNumberFormat,
	tocNumberFormat,
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

	test('the T in a note follows the note title by default', () => {
		expect(DEFAULT_SETTINGS.titleIcon).toBe(true);
	});

	test('tables of contents are numbered within the section by default, sticky headings are not', () => {
		expect(DEFAULT_SETTINGS.headingNumbers).toBe(true);
		expect(DEFAULT_SETTINGS.stickyNumbers).toBe(false);
		expect(DEFAULT_SETTINGS.numberFormat).toBe('level');
		expect([...NUMBER_FORMATS]).toEqual(['level', 'full']);
	});

	test('numbering that is turned off has no format', () => {
		expect(tocNumberFormat(DEFAULT_SETTINGS)).toBe('level');
		expect(tocNumberFormat({ ...DEFAULT_SETTINGS, numberFormat: 'full' })).toBe('full');
		expect(tocNumberFormat({ ...DEFAULT_SETTINGS, headingNumbers: false, numberFormat: 'full' })).toBeNull();
		expect(stickyNumberFormat(DEFAULT_SETTINGS)).toBeNull();
		expect(stickyNumberFormat({ ...DEFAULT_SETTINGS, stickyNumbers: true, numberFormat: 'full' })).toBe('full');
		expect(stickyNumberFormat({ ...DEFAULT_SETTINGS, headingNumbers: false, stickyNumbers: true })).toBe('level');
	});

	test('settings saved by 1.1.0 keep numbers in tables of contents only', () => {
		const settings = normalizeSettings({ headingNumbers: true, numberFormat: 'full' });
		expect(settings.headingNumbers).toBe(true);
		expect(settings.stickyNumbers).toBe(false);
		expect(settings.numberFormat).toBe('full');
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
		const saved = { buttonPosition: 'bottom-center', titleIcon: false, stickyHeadings: false, stickyMode: 'prev', noteIcon: false, linkIcons: false, noteLinkIcons: false, stickyIcons: false, headingNumbers: false, stickyNumbers: true, numberFormat: 'full' };
		expect(normalizeSettings(saved)).toEqual(saved);
		expect(normalizeSettings({ buttonPosition: 'middle', titleIcon: 'yes', stickyHeadings: 'yes', stickyMode: 1, noteIcon: 0, linkIcons: 'no', noteLinkIcons: 1, stickyIcons: null, headingNumbers: 'on', stickyNumbers: 1, numberFormat: 'roman' })).toEqual(DEFAULT_SETTINGS);
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
