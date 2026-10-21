import { describe, expect, test } from 'vitest';
import {
	extractSection,
	findStickyHeadings,
	getDisplayText,
	getSectionRange,
	getSubHeadings,
	withDepth,
	type Heading,
} from '../../src/headings';

const h = (level: number, heading: string, line: number): Heading => ({ level, heading, line });

const doc = [
	'# Title', // 0
	'intro', // 1
	'## Alpha', // 2
	'alpha text', // 3
	'### Alpha one', // 4
	'alpha one text', // 5
	'## Beta', // 6
	'beta text', // 7
	'#### Deep', // 8
	'deep text', // 9
	'# Second', // 10
	'second text', // 11
].join('\n');

const headings = [
	h(1, 'Title', 0),
	h(2, 'Alpha', 2),
	h(3, 'Alpha one', 4),
	h(2, 'Beta', 6),
	h(4, 'Deep', 8),
	h(1, 'Second', 10),
];

describe('withDepth', () => {
	test('nests by level and closes skipped levels', () => {
		expect(withDepth(headings).map((x) => [x.heading.heading, x.depth])).toEqual([
			['Title', 0],
			['Alpha', 1],
			['Alpha one', 2],
			['Beta', 1],
			['Deep', 2],
			['Second', 0],
		]);
	});

	test('starts from zero when the first heading is not h1', () => {
		expect(withDepth([h(3, 'a', 0), h(4, 'b', 1), h(2, 'c', 2)]).map((x) => x.depth)).toEqual([0, 1, 0]);
	});

	test('returns an empty list for no headings', () => {
		expect(withDepth([])).toEqual([]);
	});
});

describe('getSubHeadings', () => {
	test('returns only descendants of the heading', () => {
		expect(getSubHeadings(headings, 1).map((x) => x.heading)).toEqual(['Alpha one']);
		expect(getSubHeadings(headings, 0).map((x) => x.heading)).toEqual(['Alpha', 'Alpha one', 'Beta', 'Deep']);
	});

	test('returns nothing for a leaf or an unknown index', () => {
		expect(getSubHeadings(headings, 2)).toEqual([]);
		expect(getSubHeadings(headings, 5)).toEqual([]);
		expect(getSubHeadings(headings, 99)).toEqual([]);
	});
});

describe('getSectionRange / extractSection', () => {
	test('a section ends before the next heading of the same or higher level', () => {
		expect(getSectionRange(headings, 1, 12)).toEqual({ start: 2, end: 6 });
		expect(getSectionRange(headings, 0, 12)).toEqual({ start: 0, end: 10 });
		expect(getSectionRange(headings, 5, 12)).toEqual({ start: 10, end: 12 });
	});

	test('extracts the markdown of a section including its heading and subsections', () => {
		expect(extractSection(doc, headings, 1)).toBe('## Alpha\nalpha text\n### Alpha one\nalpha one text');
		expect(extractSection(doc, headings, 4)).toBe('#### Deep\ndeep text');
	});

	test('returns an empty string for an unknown heading', () => {
		expect(extractSection(doc, headings, 42)).toBe('');
	});
});

describe('findStickyHeadings', () => {
	test('nothing is sticky at the top of the note', () => {
		expect(findStickyHeadings(headings, 0, 'prev')).toEqual([]);
		expect(findStickyHeadings(headings, 0, 'path')).toEqual([]);
	});

	test('prev mode keeps the closest heading above the viewport', () => {
		expect(findStickyHeadings(headings, 5, 'prev').map((x) => x.heading)).toEqual(['Alpha one']);
		expect(findStickyHeadings(headings, 9.5, 'prev').map((x) => x.heading)).toEqual(['Deep']);
	});

	test('path mode keeps the chain of parent headings, outermost first', () => {
		expect(findStickyHeadings(headings, 5, 'path').map((x) => x.heading)).toEqual(['Title', 'Alpha', 'Alpha one']);
		expect(findStickyHeadings(headings, 9, 'path').map((x) => x.heading)).toEqual(['Title', 'Beta', 'Deep']);
		expect(findStickyHeadings(headings, 11, 'path').map((x) => x.heading)).toEqual(['Second']);
	});

	test('a heading exactly at the top line is visible, so it is not sticky', () => {
		expect(findStickyHeadings(headings, 2, 'prev').map((x) => x.heading)).toEqual(['Title']);
	});
});

describe('getDisplayText', () => {
	test('strips markdown decoration from heading text', () => {
		expect(getDisplayText('A **bold** _it_ `code` ==hl== ~~s~~')).toBe('A bold it code hl s');
		expect(getDisplayText('See [[Note|alias]] and [[Other]] and [md](https://x.y)')).toBe('See alias and Other and md');
	});
});
