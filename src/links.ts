/** A token of the editor syntax tree: its node name, position and text. */
export interface LinkToken {
	name: string;
	from: number;
	to: number;
	text: string;
}

export interface DocLink {
	linktext: string;
	/** Position right after the link. */
	end: number;
}

const has = (token: LinkToken, part: string) => token.name.split('_').includes(part);

/**
 * Links in the editor, read from the tokens of Obsidian's markdown mode:
 * `[[target|alias]]` wikilinks and `[text](target)` markdown links. Embeds are skipped.
 */
export function findLinks(tokens: Iterable<LinkToken>): DocLink[] {
	const links: DocLink[] = [];
	let wiki: string | null = null;
	let url: string | null = null;
	for (const token of tokens) {
		if (has(token, 'formatting-link-start')) wiki = has(token, 'formatting-embed') ? null : '';
		else if (has(token, 'formatting-link-end')) {
			if (wiki) links.push({ linktext: wiki, end: token.to });
			wiki = null;
		} else if (wiki !== null && has(token, 'hmd-internal-link') && !has(token, 'link-alias') && !has(token, 'link-alias-pipe'))
			wiki += token.text;
		else if (has(token, 'formatting-link-string')) {
			if (token.text === ')' && url) links.push({ linktext: decode(url), end: token.to });
			url = token.text === '(' ? '' : null;
		} else if (url !== null && has(token, 'url')) url += token.text;
	}
	return links;
}

function decode(url: string): string {
	try {
		return decodeURI(url);
	} catch {
		return url;
	}
}
