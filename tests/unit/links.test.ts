import { describe, expect, test } from 'vitest';
import { findLinks, type LinkToken } from '../../src/links';

/** Tokens the way Obsidian's markdown mode names them in the editor syntax tree. */
function tokens(parts: [string, string][]): LinkToken[] {
	let from = 0;
	return parts.map(([name, text]) => {
		const token = { name, text, from, to: from + text.length };
		from = token.to;
		return token;
	});
}

describe('findLinks', () => {
	test('finds a wikilink and where it ends', () => {
		const list = tokens([
			['', 'Read '],
			['formatting-link_formatting-link-start', '[['],
			['hmd-internal-link', 'Other'],
			['formatting-link_formatting-link-end', ']]'],
			['', ' now'],
		]);
		expect(findLinks(list)).toEqual([{ linktext: 'Other', end: 14 }]);
	});

	test('ignores the alias of a wikilink and keeps the heading', () => {
		const list = tokens([
			['formatting-link_formatting-link-start', '[['],
			['hmd-internal-link_link-has-alias', 'Other#Part'],
			['hmd-internal-link_link-alias-pipe', '|'],
			['hmd-internal-link_link-alias', 'the other note'],
			['formatting-link_formatting-link-end', ']]'],
		]);
		expect(findLinks(list)).toEqual([{ linktext: 'Other#Part', end: 29 }]);
	});

	test('finds a markdown link and decodes its target', () => {
		const list = tokens([
			['formatting_formatting-link_link', '['],
			['link', 'text'],
			['formatting_formatting-link_link', ']'],
			['formatting_formatting-link-string_string_url', '('],
			['string_url', 'Other%20note.md'],
			['formatting_formatting-link-string_string_url', ')'],
		]);
		expect(findLinks(list)).toEqual([{ linktext: 'Other note.md', end: 23 }]);
	});

	test('skips embeds and empty links', () => {
		const list = tokens([
			['formatting-link_formatting-link-start_formatting-embed', '![['],
			['hmd-internal-link_hmd-embed', 'Picture.png'],
			['formatting-link_formatting-link-end', ']]'],
			['formatting-link_formatting-link-start', '[['],
			['formatting-link_formatting-link-end', ']]'],
		]);
		expect(findLinks(list)).toEqual([]);
	});

	test('finds several links in order', () => {
		const list = tokens([
			['formatting-link_formatting-link-start', '[['],
			['hmd-internal-link', 'A'],
			['formatting-link_formatting-link-end', ']]'],
			['', ' and '],
			['formatting-link_formatting-link-start', '[['],
			['hmd-internal-link', 'B'],
			['formatting-link_formatting-link-end', ']]'],
		]);
		expect(findLinks(list).map((link) => link.linktext)).toEqual(['A', 'B']);
	});
});
