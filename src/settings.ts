import type { Placement } from './ui/position';

export const BUTTON_POSITIONS = ['top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-center', 'bottom-right'] as const;
export type ButtonPosition = (typeof BUTTON_POSITIONS)[number];

export const STICKY_MODES = ['prev', 'path'] as const;
export type StickyMode = (typeof STICKY_MODES)[number];

export const NUMBER_FORMATS = ['level', 'full'] as const;
export type NumberFormat = (typeof NUMBER_FORMATS)[number];

export interface HoveredTocSettings {
	/** Where the T icon sits inside each note. */
	buttonPosition: ButtonPosition;
	/** Keep the headings of the current section pinned at the top of the note. */
	stickyHeadings: boolean;
	/** `prev`: only the closest heading; `path`: the heading with its parents. */
	stickyMode: StickyMode;
	/** The T button in each note. */
	noteIcon: boolean;
	/** T icons next to links in previews, and the T button in Obsidian page previews. */
	linkIcons: boolean;
	/** T icons next to links to other notes in the note itself (Reading view and Live Preview). */
	noteLinkIcons: boolean;
	/** T icons on sticky headings. */
	stickyIcons: boolean;
	/** Numbers before the headings in tables of contents and sticky headings. */
	headingNumbers: boolean;
	/** `level`: the number within its section (`2.`); `full`: with the numbers of its parents (`1.2.`). */
	numberFormat: NumberFormat;
}

export const DEFAULT_SETTINGS: Readonly<HoveredTocSettings> = Object.freeze({
	buttonPosition: 'top-right',
	stickyHeadings: true,
	stickyMode: 'path',
	noteIcon: true,
	linkIcons: true,
	noteLinkIcons: true,
	stickyIcons: true,
	headingNumbers: true,
	numberFormat: 'level',
});

function isOneOf<T extends string>(values: readonly T[], value: unknown): value is T {
	return typeof value === 'string' && (values as readonly string[]).includes(value);
}

/** Saved data merged over the defaults; unknown or malformed values fall back to the default. */
export function normalizeSettings(raw: unknown): HoveredTocSettings {
	const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
	const flag = (key: 'stickyHeadings' | 'noteIcon' | 'linkIcons' | 'noteLinkIcons' | 'stickyIcons' | 'headingNumbers') =>
		typeof data[key] === 'boolean' ? data[key] : DEFAULT_SETTINGS[key];
	return {
		buttonPosition: isOneOf(BUTTON_POSITIONS, data.buttonPosition) ? data.buttonPosition : DEFAULT_SETTINGS.buttonPosition,
		stickyHeadings: flag('stickyHeadings'),
		stickyMode: isOneOf(STICKY_MODES, data.stickyMode) ? data.stickyMode : DEFAULT_SETTINGS.stickyMode,
		noteIcon: flag('noteIcon'),
		linkIcons: flag('linkIcons'),
		noteLinkIcons: flag('noteLinkIcons'),
		stickyIcons: flag('stickyIcons'),
		headingNumbers: flag('headingNumbers'),
		numberFormat: isOneOf(NUMBER_FORMATS, data.numberFormat) ? data.numberFormat : DEFAULT_SETTINGS.numberFormat,
	};
}

/** The format headings are numbered in, or null when numbering is off. */
export function headingNumberFormat(settings: HoveredTocSettings): NumberFormat | null {
	return settings.headingNumbers ? settings.numberFormat : null;
}

export function positionClass(position: ButtonPosition): string {
	return `htoc-pos-${position}`;
}

/** The table of contents opens from the icon towards the middle of the note. */
export function popoverPlacement(position: ButtonPosition): Placement {
	const [vertical, horizontal] = position.split('-') as ['top' | 'bottom', 'left' | 'center' | 'right'];
	const align = horizontal === 'left' ? 'start' : horizontal === 'right' ? 'end' : 'center';
	return { side: vertical === 'top' ? 'below' : 'above', align };
}
