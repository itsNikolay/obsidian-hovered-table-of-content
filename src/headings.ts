import type { StickyMode } from './settings';

/** A heading of a note; `line` is the zero-based line of the heading in the file. */
export interface Heading {
	heading: string;
	level: number;
	line: number;
}

/**
 * Nesting depth of every heading, as a nested list would show it.
 * Skipped levels do not add depth: `## a` followed by `#### b` puts `b` one level deeper.
 */
export function withDepth(headings: Heading[]): { heading: Heading; depth: number }[] {
	const stack: number[] = [];
	return headings.map((heading) => {
		while (stack.length > 0 && stack[stack.length - 1]! >= heading.level) stack.pop();
		const depth = stack.length;
		stack.push(heading.level);
		return { heading, depth };
	});
}

/** Index of the first heading after `index` that closes its section (same or higher level). */
function sectionEndIndex(headings: Heading[], index: number): number {
	const level = headings[index]!.level;
	let end = index + 1;
	while (end < headings.length && headings[end]!.level > level) end++;
	return end;
}

/** Headings nested under the heading at `index`. */
export function getSubHeadings(headings: Heading[], index: number): Heading[] {
	if (!headings[index]) return [];
	return headings.slice(index + 1, sectionEndIndex(headings, index));
}

/** Lines `[start, end)` of the section that starts at the heading at `index`. */
export function getSectionRange(headings: Heading[], index: number, lineCount: number): { start: number; end: number } {
	const heading = headings[index];
	if (!heading) return { start: 0, end: 0 };
	const next = headings[sectionEndIndex(headings, index)];
	return { start: heading.line, end: next ? next.line : lineCount };
}

/** Markdown of a section: its heading, body and subsections. */
export function extractSection(content: string, headings: Heading[], index: number): string {
	if (!headings[index]) return '';
	const lines = content.split('\n');
	const { start, end } = getSectionRange(headings, index, lines.length);
	return lines.slice(start, end).join('\n').trimEnd();
}

/**
 * Headings that scrolled above the top visible line.
 * `prev` keeps only the closest one, `path` keeps it with all its parents (outermost first).
 */
export function findStickyHeadings(headings: Heading[], topLine: number, mode: StickyMode): Heading[] {
	const above = headings.filter((heading) => heading.line < topLine);
	const last = above[above.length - 1];
	if (!last) return [];
	if (mode === 'prev') return [last];
	const chain: Heading[] = [];
	let level = Number.MAX_SAFE_INTEGER;
	for (let i = above.length - 1; i >= 0 && level > 1; i--) {
		const heading = above[i]!;
		if (heading.level < level) {
			chain.unshift(heading);
			level = heading.level;
		}
	}
	return chain;
}

/** Heading text without markdown decoration, links shown by their visible text. */
export function getDisplayText(raw: string): string {
	return raw
		.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
		.replace(/\[\[([^\]]+)\]\]/g, '$1')
		.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
		.replace(/(\*\*|__|==|~~|`)/g, '')
		.replace(/(^|\W)[*_](\S(?:.*?\S)?)[*_](?=\W|$)/g, '$1$2')
		.trim();
}
