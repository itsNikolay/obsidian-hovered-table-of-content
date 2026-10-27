// End-to-end checks against the real Linux Obsidian app inside Docker (see docker/entrypoint.sh).
// Uses a synthetic, disposable vault; never touches the host Obsidian or a personal vault.
import { chromium, type Browser, type Locator, type Page } from 'playwright';
import type { ChildProcessByStdio } from 'node:child_process';
import type { Readable } from 'node:stream';
import { mkdir, writeFile, copyFile, readFile } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { homedir } from 'node:os';
import { join } from 'node:path';

if (process.env.HTOC_DOCKER !== '1') throw new Error('Run this through npm run docker:check. Host Obsidian is never launched.');

const PLUGIN_ID = 'hovered-table-of-content';
const vault = '/tmp/htoc-vault', profile = join(homedir(), '.config', 'obsidian'), out = '/artifacts';
const pluginDir = `${vault}/.obsidian/plugins/${PLUGIN_ID}`;
await mkdir(pluginDir, { recursive: true });
await mkdir(profile, { recursive: true });
await mkdir(out, { recursive: true });
for (const file of ['main.js', 'manifest.json', 'styles.css']) await copyFile(file, `${pluginDir}/${file}`);
await writeFile(`${vault}/.obsidian/community-plugins.json`, JSON.stringify([PLUGIN_ID]));
await writeFile(`${vault}/.obsidian/app.json`, JSON.stringify({ safeMode: false, livePreview: true, showInlineTitle: false }));
await writeFile(`${profile}/obsidian.json`, JSON.stringify({ vaults: { demo: { path: vault, ts: Date.now(), open: true } } }));

const filler = (topic: string) => Array.from({ length: 14 }, (_, i) => `${topic} paragraph ${i + 1}. Synthetic text for scrolling.`).join('\n\n');
const main = [
	'# Guide',
	filler('Guide'),
	'## Setup',
	'Read [[Other]] before you start.',
	'',
	filler('Setup'),
	'### Install',
	filler('Install'),
	'### Configure',
	filler('Configure'),
	'## Usage',
	filler('Usage'),
	'## FAQ',
	filler('FAQ'),
].join('\n\n');
await writeFile(`${vault}/Main.md`, main + '\n');
await writeFile(`${vault}/Other.md`, '# Other note\n\nOther intro.\n\n## Other part\n\nOther details live here. See [[Third]].\n');
await writeFile(`${vault}/Third.md`, '# Third note\n\nThird intro.\n\n## Third part\n\nThird details.\n');
await writeFile(`${vault}/Long.md`, Array.from({ length: 50 }, (_, i) => `## Part ${i + 1}\n\nPart ${i + 1} text.`).join('\n\n') + '\n');
const lineOf = (heading: string) => main.split('\n').findIndex((l) => l.replace(/^#+ /, '') === heading && l.startsWith('#'));

const errors: string[] = [];
let app: ChildProcessByStdio<null, null, Readable> | undefined;
let browser: Browser | undefined, page: Page | undefined;
let failure: unknown;
const step = (name: string) => console.log(`• ${name}`);

async function setMode(mode: 'preview' | 'live' | 'source') {
	await page!.evaluate(async (mode) => {
		const g = globalThis as any;
		const leaf = g.app.workspace.getMostRecentLeaf();
		await leaf.setViewState({ type: 'markdown', state: { file: 'Main.md', mode: mode === 'preview' ? 'preview' : 'source', source: mode === 'source' } });
	}, mode);
	await page!.waitForTimeout(600);
}

async function scrollToLine(line: number) {
	await page!.evaluate((line) => {
		const g = globalThis as any;
		g.app.workspace.getMostRecentLeaf().view.currentMode.applyScroll(line);
	}, line);
	await page!.waitForTimeout(500);
}

const stickyTexts = () => page!.locator('.workspace-leaf.mod-active .htoc-sticky-row .htoc-sticky-text').allTextContents();
const numbersOf = (items: Locator) => items.evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.number ?? null));
const stickyNumbers = () => numbersOf(page!.locator('.workspace-leaf.mod-active .htoc-sticky-row .htoc-sticky-text'));


/** The bottom of a popup that does not fit fades out until it is scrolled to the end, and fades out again when scrolled back up. */
async function checkBottomFade(popup: Locator, what: string) {
	const fadeAfterScroll = async (to: 'top' | 'end' | 'up') => {
		await popup.evaluate((el, to) => el.scrollTo(0, to === 'top' ? 0 : to === 'end' ? el.scrollHeight : el.scrollTop - 100), to);
		await page!.waitForTimeout(300);
		return popup.evaluate((el) => getComputedStyle(el, '::after').opacity);
	};
	assert.equal(await fadeAfterScroll('top'), '0.7', `${what} fades out at the bottom`);
	assert.equal(await fadeAfterScroll('end'), '0', `the fade disappears at the end of ${what}`);
	assert.equal(await fadeAfterScroll('up'), '0.7', `the fade comes back when ${what} is scrolled up`);
	await fadeAfterScroll('top');
}

async function moveAway() {
	await page!.mouse.move(700, 990);
	await page!.waitForTimeout(800);
	assert.equal(await page!.locator('.htoc-popup').count(), 0, 'popups close when the pointer leaves');
}

try {
	app = spawn(process.env.OBSIDIAN_EXECUTABLE || '/opt/squashfs-root/obsidian', ['--no-sandbox', '--disable-gpu',
		'--remote-debugging-port=9222', `--user-data-dir=${profile}`], { stdio: ['ignore', 'ignore', 'pipe'] });
	let appLog = '';
	app.stderr.on('data', (chunk) => { appLog = (appLog + chunk).slice(-8000); });
	for (let attempt = 0; attempt < 120; attempt++) {
		if (app.exitCode !== null) throw new Error(`Obsidian exited ${app.exitCode}: ${appLog}`);
		try { browser = await chromium.connectOverCDP('http://127.0.0.1:9222', { timeout: 1000 }); break; }
		catch { await new Promise((resolve) => setTimeout(resolve, 250)); }
	}
	if (!browser) throw new Error(`Cannot connect to Obsidian: ${appLog}`);
	const context = browser.contexts()[0]!;
	page = context.pages()[0] || await context.waitForEvent('page');
	const trust = page.getByRole('button', { name: 'Trust author and enable plugins', exact: true });
	await trust.waitFor({ timeout: 15000 });
	let windowId = '';
	for (let attempt = 0; attempt < 30 && !windowId; attempt++) {
		windowId = spawnSync('xdotool', ['search', '--onlyvisible', '--class', 'obsidian'], { encoding: 'utf8' }).stdout.trim().split('\n')[0] ?? '';
		if (!windowId) await new Promise((resolve) => setTimeout(resolve, 100));
	}
	assert.ok(windowId, 'Cannot find Obsidian X11 window');
	for (const args of [['windowsize', windowId, '1440', '1000'], ['windowmove', windowId, '0', '0']])
		assert.equal(spawnSync('xdotool', args).status, 0, 'Cannot size Obsidian window');
	await trust.click();
	page.on('pageerror', (error) => errors.push(error.message));
	await page.waitForFunction(() => (globalThis as any).app?.vault?.getName() === 'htoc-vault', null, { timeout: 60000 });
	await page.evaluate(async (id) => {
		const g = globalThis as any;
		await g.app.plugins.enablePluginAndSave(id);
		const leaf = g.app.workspace.getLeaf(false);
		await leaf.openFile(g.app.vault.getAbstractFileByPath('Main.md'));
		g.app.workspace.leftSplit.collapse();
		g.app.workspace.rightSplit.collapse();
	}, PLUGIN_ID);
	await page.getByRole('button', { name: 'Allow', exact: true }).first().click({ timeout: 5000 }).catch(() => {});
	await page.bringToFront();
	await page.waitForFunction(() => (globalThis as any).app.metadataCache.getCache('Main.md')?.headings?.length === 6, null, { timeout: 15000 });
	await setMode('preview');

	step('T button is shown at the default position (top right)');
	const button = page.locator('.workspace-leaf.mod-active .htoc-button');
	await button.waitFor({ timeout: 10000 });
	assert.equal(await button.textContent(), 'T');
	assert.match((await button.getAttribute('class')) ?? '', /htoc-pos-top-right/);
	const leafBox = (await page.locator('.workspace-leaf.mod-active .view-content').boundingBox())!;
	const buttonBox = (await button.boundingBox())!;
	assert.ok(buttonBox.x > leafBox.x + leafBox.width / 2 && buttonBox.y < leafBox.y + leafBox.height / 2, 'button is in the top right of the note');
	const radius = parseFloat(await button.evaluate((el) => getComputedStyle(el).borderTopLeftRadius));
	assert.ok(radius < buttonBox.width / 4, `the T button is square, got a ${radius}px corner radius`);
	assert.equal(await button.evaluate((el) => getComputedStyle(el).cursor), 'pointer', 'the T button shows a pointer cursor');

	step('hovering the T button shows the table of contents');
	await button.hover();
	const toc = page.locator('.htoc-toc').first();
	await toc.waitFor({ timeout: 3000 });
	assert.deepEqual(await toc.locator('.htoc-toc-item').allTextContents(), ['Guide', 'Setup', 'Install', 'Configure', 'Usage', 'FAQ']);
	assert.deepEqual(await numbersOf(toc.locator('.htoc-toc-item')), ['1.', '1.', '1.', '2.', '2.', '3.'], 'headings are numbered within their section by default');
	assert.equal(await toc.locator('.htoc-toc-item').nth(3).evaluate((el) => getComputedStyle(el, '::before').content), '"2."', 'the number is shown before the heading');
	await page.screenshot({ path: `${out}/toc-popover.png` });

	step('hovering an item previews its section, links inside get their own T icon');
	await toc.locator('.htoc-toc-item', { hasText: 'Setup' }).hover();
	const preview = page.locator('.htoc-preview').first();
	await preview.waitFor({ timeout: 3000 });
	await page.waitForTimeout(300);
	assert.match((await preview.textContent()) ?? '', /Read OtherT? before you start/);
	assert.match((await preview.textContent()) ?? '', /Install paragraph 1\./);
	assert.doesNotMatch((await preview.textContent()) ?? '', /Usage paragraph/);
	const linkIcon = preview.locator('.htoc-link-toc').first();
	await linkIcon.waitFor({ timeout: 3000 });
	assert.equal(await linkIcon.evaluate((el) => getComputedStyle(el).cursor), 'pointer', 'the T next to a link shows a pointer cursor');
	await page.screenshot({ path: `${out}/section-preview.png` });
	await checkBottomFade(preview, 'a long section preview');
	assert.equal(await toc.evaluate((el) => getComputedStyle(el, '::after').opacity), '0', 'a table of contents that fits does not fade out');

	step('the link icon shows the linked note table of contents, which previews too');
	await linkIcon.hover();
	const nestedToc = page.locator('.htoc-toc').nth(1);
	await nestedToc.waitFor({ timeout: 3000 });
	assert.deepEqual(await nestedToc.locator('.htoc-toc-item').allTextContents(), ['Other note', 'Other part']);
	const background = (text: string) => toc.locator('.htoc-toc-item', { hasText: text }).evaluate((el) => getComputedStyle(el).backgroundColor);
	assert.notEqual(await background('Setup'), await background('Install'), 'the heading of the open preview stays highlighted');
	await nestedToc.locator('.htoc-toc-item', { hasText: 'Other part' }).hover();
	const nestedPreview = page.locator('.htoc-preview').nth(1);
	await nestedPreview.waitFor({ timeout: 3000 });
	await page.waitForTimeout(300);
	assert.match((await nestedPreview.textContent()) ?? '', /Other details live here/);
	await page.screenshot({ path: `${out}/nested-preview.png` });
	await moveAway();

	step('moving to another heading highlights only that heading, also before its preview opens');
	await button.hover();
	await toc.waitFor({ timeout: 3000 });
	await toc.locator('.htoc-toc-item', { hasText: 'Setup' }).hover();
	await preview.waitFor({ timeout: 3000 });
	const highlight = () => toc.locator('.htoc-toc-item').evaluateAll((items) => {
		const plain = getComputedStyle(items.find((item) => item.textContent === 'FAQ')!).backgroundColor;
		return {
			active: items.filter((item) => item.classList.contains('is-active')).map((item) => item.textContent),
			highlighted: items.filter((item) => getComputedStyle(item).backgroundColor !== plain).map((item) => item.textContent),
		};
	});
	await toc.locator('.htoc-toc-item', { hasText: 'Usage' }).hover();
	const moved = await highlight();
	assert.deepEqual(moved.active, ['Setup'], 'checked while the preview of the previous heading is still open');
	assert.deepEqual(moved.highlighted, ['Usage'], 'only the hovered heading is highlighted');
	await page.waitForTimeout(400);
	assert.deepEqual(await highlight(), { active: ['Usage'], highlighted: ['Usage'] }, 'the hovered heading stays highlighted once its preview opens');
	await moveAway();

	step('links in a section preview show the page preview of the linked note, which has its own T');
	await button.hover();
	await toc.waitFor({ timeout: 3000 });
	await toc.locator('.htoc-toc-item', { hasText: 'Setup' }).hover();
	await preview.waitFor({ timeout: 3000 });
	await preview.locator('a.internal-link', { hasText: 'Other' }).first().hover();
	const pagePreview = page.locator('.hover-popover').last();
	await pagePreview.waitFor({ timeout: 5000 });
	await page.waitForFunction(() => /Other details live here/.test(document.querySelector('.hover-popover:last-of-type')?.textContent ?? ''), null, { timeout: 5000 });
	const pageBox = (await pagePreview.boundingBox())!;
	await page.mouse.move(pageBox.x + pageBox.width / 2, pageBox.y + pageBox.height / 2, { steps: 5 });
	await page.waitForTimeout(1000);
	assert.equal(await page.locator('.htoc-preview').count(), 1, 'the section preview stays open while its page preview is hovered');
	await pagePreview.locator('.htoc-button').hover();
	const pagePreviewToc = page.locator('.htoc-toc').nth(1);
	await pagePreviewToc.waitFor({ timeout: 3000 });
	assert.deepEqual(await pagePreviewToc.locator('.htoc-toc-item').allTextContents(), ['Other note', 'Other part']);
	await pagePreviewToc.locator('.htoc-toc-item', { hasText: 'Other part' }).hover();
	await page.waitForTimeout(1000);
	assert.match((await page.locator('.htoc-preview').last().textContent()) ?? '', /Other details live here/);
	assert.equal(await pagePreview.isVisible(), true, 'the page preview stays open while its table of contents is used');
	await page.screenshot({ path: `${out}/page-preview-in-preview.png` });
	await moveAway();
	await page.waitForTimeout(1000);
	assert.equal(await page.locator('.hover-popover').count(), 0, 'the page preview closes with the popups');

	step('page previews of links in the note get a T with the linked note table of contents');
	await scrollToLine(lineOf('Setup'));
	await page.locator('.workspace-leaf.mod-active .markdown-reading-view a.internal-link', { hasText: 'Other' }).first().hover();
	const notePreview = page.locator('.hover-popover').last();
	await notePreview.waitFor({ timeout: 5000 });
	const previewButtonBox = (await notePreview.locator('.htoc-button').boundingBox())!;
	assert.ok(previewButtonBox.width < 32 && previewButtonBox.height < 32, `the T in a page preview is a small round button, got ${previewButtonBox.width}x${previewButtonBox.height}`);
	await notePreview.locator('.htoc-button').hover();
	const notePreviewToc = page.locator('.htoc-toc').first();
	await notePreviewToc.waitFor({ timeout: 3000 });
	assert.deepEqual(await notePreviewToc.locator('.htoc-toc-item').allTextContents(), ['Other note', 'Other part']);
	await notePreviewToc.locator('.htoc-toc-item', { hasText: 'Other part' }).hover();
	await page.locator('.htoc-preview').first().waitFor({ timeout: 3000 });
	await page.waitForTimeout(1000);
	assert.equal(await notePreview.isVisible(), true, 'the page preview stays open while its table of contents is used');
	await page.screenshot({ path: `${out}/page-preview-toc.png` });

	step('section previews have the same spacing as Obsidian page previews');
	const spacing = (popup: string, content: string) => page!.evaluate(({ popup, content }) => {
		const box = document.querySelector(popup)!.getBoundingClientRect();
		const blocks = [...document.querySelector(content)!.querySelectorAll('h1, h2, p')];
		const first = blocks[0]!.getBoundingClientRect(), last = blocks[blocks.length - 1]!.getBoundingClientRect();
		return { left: Math.round(first.left - box.left), top: Math.round(first.top - box.top), bottom: Math.round(box.bottom - last.bottom),
			width: Math.round(box.width), fontSize: getComputedStyle(blocks[blocks.length - 1]!).fontSize };
	}, { popup, content });
	const native = await spacing('.hover-popover', '.hover-popover .markdown-preview-view');
	const ours = await spacing('.htoc-preview', '.htoc-preview .htoc-preview-content');
	console.log('  page preview', JSON.stringify(native), 'section preview', JSON.stringify(ours));
	for (const key of ['left', 'top', 'bottom', 'width'] as const)
		assert.ok(Math.abs(native[key] - ours[key]) <= 2, `${key}: page preview ${native[key]}px, section preview ${ours[key]}px`);
	assert.equal(ours.fontSize, native.fontSize, 'the same font size');
	await moveAway();
	await page.waitForTimeout(1000);
	assert.equal(await page.locator('.hover-popover').count(), 0, 'the page preview closes with the popups');

	step('the T next to a link keeps the page preview of that link open');
	const pagePreviewOf = (text: string) => page!.locator('.hover-popover', { hasText: text });
	await button.hover();
	await toc.waitFor({ timeout: 3000 });
	await toc.locator('.htoc-toc-item', { hasText: 'Setup' }).hover();
	await preview.waitFor({ timeout: 3000 });
	await preview.locator('a.internal-link', { hasText: 'Other' }).first().hover();
	await pagePreviewOf('Other intro').waitFor({ timeout: 5000 });
	await preview.locator('.htoc-link-toc').first().hover();
	await page.locator('.htoc-toc').nth(1).waitFor({ timeout: 3000 });
	await page.waitForTimeout(1200);
	assert.equal(await pagePreviewOf('Other intro').isVisible(), true, 'the page preview of the link stays open');
	assert.equal(await page.locator('.htoc-preview').first().isVisible(), true, 'the section preview stays open');

	step('the T in a nested page preview keeps every open card');
	await pagePreviewOf('Other intro').locator('a.internal-link', { hasText: 'Third' }).hover();
	await pagePreviewOf('Third intro').waitFor({ timeout: 5000 });
	await pagePreviewOf('Third intro').locator('.htoc-preview-button').hover();
	const thirdToc = page.locator('.htoc-toc', { hasText: 'Third note' });
	await thirdToc.waitFor({ timeout: 3000 });
	await thirdToc.locator('.htoc-toc-item', { hasText: 'Third part' }).hover();
	await page.locator('.htoc-preview', { hasText: 'Third details' }).waitFor({ timeout: 3000 });
	await page.waitForTimeout(1200);
	assert.equal(await page.locator('.htoc-preview', { hasText: 'Setup paragraph' }).isVisible(), true, 'the section preview stays open');
	assert.equal(await pagePreviewOf('Other intro').isVisible(), true, 'the outer page preview stays open');
	assert.equal(await pagePreviewOf('Third intro').isVisible(), true, 'the nested page preview stays open');
	await page.screenshot({ path: `${out}/nested-page-previews.png` });
	await moveAway();
	await page.waitForTimeout(1500);
	assert.equal(await page.locator('.hover-popover').count(), 0, 'the page previews close with the popups');

	step('clicking an item scrolls to the heading');
	await button.hover();
	await page.locator('.htoc-toc .htoc-toc-item', { hasText: 'Usage' }).click();
	await page.waitForTimeout(700);
	const scroll = await page.evaluate(() => (globalThis as any).app.workspace.getMostRecentLeaf().view.currentMode.getScroll());
	assert.ok(Math.abs(scroll - lineOf('Usage')) < 3, `scrolled to Usage (line ${lineOf('Usage')}), got ${scroll}`);
	await moveAway();

	step('a long table of contents fades out at the bottom until it is scrolled to the end');
	await page.evaluate(async () => {
		const g = globalThis as any;
		await g.app.workspace.getMostRecentLeaf().openFile(g.app.vault.getAbstractFileByPath('Long.md'));
	});
	await page.waitForTimeout(600);
	await button.hover();
	await toc.waitFor({ timeout: 3000 });
	assert.equal(await toc.locator('.htoc-toc-item').count(), 50);
	await page.waitForTimeout(300);
	await page.screenshot({ path: `${out}/long-toc.png` });
	await checkBottomFade(toc, 'a long table of contents');
	await moveAway();
	await setMode('preview');

	const noteLinkIcons = (mode: 'preview' | 'live' | 'source') =>
		page!.locator(`.workspace-leaf.mod-active ${mode === 'preview' ? '.markdown-reading-view' : '.markdown-source-view'} .htoc-note-link-toc`);
	for (const mode of ['preview', 'live'] as const) {
		step(`links in the note get a T with the linked note table of contents in ${mode} mode`);
		await setMode(mode);
		await scrollToLine(lineOf('Setup'));
		await noteLinkIcons(mode).first().waitFor({ timeout: 3000 });
		assert.equal(await noteLinkIcons(mode).count(), 1, 'one T next to the one link');
		const linkBox = (await noteLinkIcons(mode).first().evaluate((icon) => {
			// In live preview the hidden `]]` can sit between the link text and the T.
			let link = icon.previousElementSibling!;
			while (link.getBoundingClientRect().width === 0 && link.previousElementSibling) link = link.previousElementSibling;
			const box = link.getBoundingClientRect();
			return { x: box.x, y: box.y, width: box.width, height: box.height };
		}));
		const iconBox = (await noteLinkIcons(mode).first().boundingBox())!;
		assert.ok(iconBox.x >= linkBox.x + linkBox.width - 1 && iconBox.x - (linkBox.x + linkBox.width) < 12, 'the T sits right after the link');
		assert.ok(Math.abs(iconBox.y + iconBox.height / 2 - (linkBox.y + linkBox.height / 2)) < 6, 'the T is on the line of the link');
		await noteLinkIcons(mode).first().hover();
		await page.locator('.htoc-toc').first().waitFor({ timeout: 3000 });
		assert.deepEqual(await page.locator('.htoc-toc').first().locator('.htoc-toc-item').allTextContents(), ['Other note', 'Other part']);
		await page.screenshot({ path: `${out}/note-link-${mode}.png` });
		await moveAway();
	}
	step('links in source mode get no T');
	await setMode('source');
	await scrollToLine(lineOf('Setup'));
	assert.equal(await noteLinkIcons('source').count(), 0);
	await setMode('preview');

	for (const mode of ['preview', 'live', 'source'] as const) {
		step(`sticky headings in ${mode} mode`);
		await setMode(mode);
		await scrollToLine(0);
		assert.deepEqual(await stickyTexts(), [], 'nothing sticky at the top');
		await scrollToLine(lineOf('Install') + 6);
		await page.waitForFunction(() => document.querySelectorAll('.workspace-leaf.mod-active .htoc-sticky-row').length > 0, null, { timeout: 3000 });
		assert.deepEqual(await stickyTexts(), ['Guide', 'Setup', 'Install'], 'by default the heading comes with its parents');
		assert.deepEqual(await stickyNumbers(), [null, null, null], 'sticky headings are not numbered by default');
		if (mode === 'live') await page.screenshot({ path: `${out}/sticky-live.png` });
	}

	step('sticky row T icon shows the subheadings of that heading');
	await setMode('preview');
	await scrollToLine(lineOf('Setup') + 3);
	await page.waitForFunction(() => document.querySelector('.workspace-leaf.mod-active .htoc-sticky-row:last-child .htoc-sticky-text')?.textContent === 'Setup', null, { timeout: 3000 });
	assert.deepEqual(await stickyTexts(), ['Guide', 'Setup']);
	await page.locator('.workspace-leaf.mod-active .htoc-sticky-row').last().locator('.htoc-sticky-toc').hover();
	await page.locator('.htoc-toc').first().waitFor({ timeout: 3000 });
	assert.deepEqual(await page.locator('.htoc-toc').first().locator('.htoc-toc-item').allTextContents(), ['Install', 'Configure']);
	await page.screenshot({ path: `${out}/sticky-toc.png` });
	await moveAway();

	step('clicking a sticky heading jumps to it');
	await page.locator('.workspace-leaf.mod-active .htoc-sticky-row').last().locator('.htoc-sticky-text').click();
	await page.waitForTimeout(700);
	const back = await page.evaluate(() => (globalThis as any).app.workspace.getMostRecentLeaf().view.currentMode.getScroll());
	assert.ok(Math.abs(back - lineOf('Setup')) < 3, `jumped to Setup (line ${lineOf('Setup')}), got ${back}`);

	step('settings: position, disabling sticky headings');
	const updateSettings = (patch: object) => page!.evaluate(async ({ id, patch }) => {
		const plugin = (globalThis as any).app.plugins.plugins[id];
		Object.assign(plugin.settings, patch);
		await plugin.saveSettings();
	}, { id: PLUGIN_ID, patch });
	await updateSettings({ buttonPosition: 'bottom-center' });
	await page.waitForTimeout(200);
	assert.match((await button.getAttribute('class')) ?? '', /htoc-pos-bottom-center/);
	const movedBox = (await button.boundingBox())!;
	assert.ok(movedBox.y > leafBox.y + leafBox.height / 2, 'button moved to the bottom');
	assert.ok(Math.abs(movedBox.x + movedBox.width / 2 - (leafBox.x + leafBox.width / 2)) < 40, 'button is centered');
	await button.hover();
	await page.locator('.htoc-toc').first().waitFor({ timeout: 3000 });
	const popBox = (await page.locator('.htoc-toc').first().boundingBox())!;
	assert.ok(popBox.y + popBox.height <= movedBox.y + 1, 'popover opens above a bottom button');
	await page.screenshot({ path: `${out}/bottom-center.png` });
	await moveAway();
	await updateSettings({ stickyHeadings: false });
	await page.waitForTimeout(200);
	assert.equal(await page.locator('.workspace-leaf.mod-active .htoc-sticky').count(), 0, 'sticky overlay removed');
	await updateSettings({ stickyHeadings: true, buttonPosition: 'top-right' });
	await scrollToLine(lineOf('Configure') + 4);
	await page.waitForFunction(() => document.querySelector('.workspace-leaf.mod-active .htoc-sticky-row:last-child .htoc-sticky-text')?.textContent === 'Configure', null, { timeout: 3000 });

	step('settings: hiding the T icons in notes, on links and on sticky headings');
	assert.ok(await page.locator('.workspace-leaf.mod-active .htoc-sticky-toc').count() > 0);
	await updateSettings({ stickyIcons: false });
	await page.waitForTimeout(200);
	assert.equal(await page.locator('.workspace-leaf.mod-active .htoc-sticky-toc').count(), 0, 'sticky headings without T');
	assert.ok(await page.locator('.workspace-leaf.mod-active .htoc-sticky-row').count() > 0, 'sticky headings are still there');
	await updateSettings({ noteIcon: false });
	await page.waitForTimeout(200);
	assert.equal(await button.isVisible(), false, 'no T in the note');
	await updateSettings({ noteIcon: true, linkIcons: false });
	await page.waitForTimeout(200);
	await button.hover();
	await toc.locator('.htoc-toc-item', { hasText: 'Setup' }).hover();
	await preview.waitFor({ timeout: 3000 });
	await page.waitForTimeout(300);
	assert.equal(await preview.locator('a.internal-link').count(), 1);
	assert.equal(await preview.locator('.htoc-link-toc').count(), 0, 'no T next to links');
	await moveAway();
	await updateSettings({ linkIcons: true, stickyIcons: true });
	await page.waitForTimeout(200);
	assert.ok(await page.locator('.workspace-leaf.mod-active .htoc-sticky-toc').count() > 0, 'sticky T icons are back');
	for (const mode of ['preview', 'live'] as const) {
		await setMode(mode);
		await scrollToLine(lineOf('Setup'));
		await noteLinkIcons(mode).first().waitFor({ timeout: 3000 });
		await updateSettings({ noteLinkIcons: false });
		await page.waitForTimeout(300);
		assert.equal(await noteLinkIcons(mode).count(), 0, `no T next to links in the note in ${mode} mode`);
		await updateSettings({ noteLinkIcons: true });
		await noteLinkIcons(mode).first().waitFor({ timeout: 3000 });
	}
	await setMode('preview');

	step('settings: numbers on sticky headings, the full heading number format, and no numbers');
	await updateSettings({ stickyNumbers: true });
	await scrollToLine(lineOf('Install') + 6);
	await page.waitForFunction(() => document.querySelector('.workspace-leaf.mod-active .htoc-sticky-row:last-child .htoc-sticky-text')?.getAttribute('data-number') === '1.', null, { timeout: 3000 });
	assert.deepEqual(await stickyNumbers(), ['1.', '1.', '1.'], 'the setting numbers sticky headings');
	await updateSettings({ numberFormat: 'full' });
	await scrollToLine(lineOf('Configure') + 4);
	await page.waitForFunction(() => document.querySelector('.workspace-leaf.mod-active .htoc-sticky-row:last-child .htoc-sticky-text')?.getAttribute('data-number') === '1.1.2.', null, { timeout: 3000 });
	assert.deepEqual(await stickyNumbers(), ['1.', '1.1.', '1.1.2.']);
	assert.equal(await page.locator('.workspace-leaf.mod-active .htoc-sticky-text').last().evaluate((el) => getComputedStyle(el, '::before').content), '"1.1.2."');
	await button.hover();
	await toc.waitFor({ timeout: 3000 });
	assert.deepEqual(await numbersOf(toc.locator('.htoc-toc-item')), ['1.', '1.1.', '1.1.1.', '1.1.2.', '1.2.', '1.3.']);
	await page.screenshot({ path: `${out}/numbers-full.png` });
	await moveAway();
	await page.locator('.workspace-leaf.mod-active .htoc-sticky-row').nth(1).locator('.htoc-sticky-toc').hover();
	const subToc = page.locator('.htoc-toc').first();
	await subToc.waitFor({ timeout: 3000 });
	assert.deepEqual(await subToc.locator('.htoc-toc-item').allTextContents(), ['Install', 'Configure']);
	assert.deepEqual(await numbersOf(subToc.locator('.htoc-toc-item')), ['1.1.1.', '1.1.2.'], 'subheadings keep their numbers in the note');
	await moveAway();
	await updateSettings({ headingNumbers: false });
	await page.waitForTimeout(200);
	assert.deepEqual(await stickyNumbers(), ['1.', '1.1.', '1.1.2.'], 'sticky headings keep their numbers without numbers in tables of contents');
	await button.hover();
	await toc.waitFor({ timeout: 3000 });
	assert.deepEqual(await numbersOf(toc.locator('.htoc-toc-item')), [null, null, null, null, null, null], 'no numbers in the table of contents');
	await moveAway();
	await updateSettings({ stickyNumbers: false });
	await page.waitForTimeout(200);
	assert.deepEqual(await stickyNumbers(), [null, null, null], 'no numbers on sticky headings');
	await updateSettings({ headingNumbers: true, numberFormat: 'level' });

	step('the T sits right after the inline title in every mode');
	const titleEnd = () => page!.evaluate(() => {
		const title = document.querySelector('.workspace-leaf.mod-active .inline-title')!;
		const range = document.createRange();
		range.selectNodeContents(title);
		const lines = range.getClientRects();
		const last = lines[lines.length - 1]!;
		return { right: last.right, middle: last.top + last.height / 2 };
	});
	const assertAfterTitle = async (where: string) => {
		const end = await titleEnd();
		const box = (await button.boundingBox())!;
		assert.ok(box.x >= end.right && box.x - end.right < 16, `${where}: the T sits right after the title, got x ${box.x}, the title ends at ${end.right}`);
		assert.ok(Math.abs(box.y + box.height / 2 - end.middle) < 3, `${where}: the T is on the line of the title`);
	};
	const setInlineTitle = async (shown: boolean) => {
		await page!.evaluate((shown) => (globalThis as any).app.vault.setConfig('showInlineTitle', shown), shown);
		await page!.waitForTimeout(300);
	};
	const inlineTitle = page.locator('.workspace-leaf.mod-active .inline-title');
	await setInlineTitle(true);
	for (const mode of ['preview', 'live', 'source'] as const) {
		await setMode(mode);
		await scrollToLine(0);
		await assertAfterTitle(mode);
		assert.equal(await inlineTitle.textContent(), 'Main', 'the title text stays unchanged');
		await button.hover();
		await toc.waitFor({ timeout: 3000 });
		const titleButtonBox = (await button.boundingBox())!, titleTocBox = (await toc.boundingBox())!;
		assert.ok(titleTocBox.y >= titleButtonBox.y + titleButtonBox.height && Math.abs(titleTocBox.x - titleButtonBox.x) < 2, `${mode}: the table of contents opens below the T`);
		assert.deepEqual(await toc.locator('.htoc-toc-item').allTextContents(), ['Guide', 'Setup', 'Install', 'Configure', 'Usage', 'FAQ']);
		if (mode === 'live') await page.screenshot({ path: `${out}/title-icon.png` });
		await moveAway();
	}

	step('the T follows the title when reading view is toggled, the note scrolls, the pane narrows and the note is renamed');
	await page.evaluate(() => (globalThis as any).app.commands.executeCommandById('markdown:toggle-preview'));
	await page.waitForTimeout(600);
	assert.equal(await page.evaluate(() => (globalThis as any).app.workspace.getMostRecentLeaf().view.getMode()), 'preview');
	// Reading view comes back at its own scroll position.
	await scrollToLine(0);
	await assertAfterTitle('toggled to reading view');
	const unscrolled = (await button.boundingBox())!;
	await page.evaluate(() => { document.querySelector('.workspace-leaf.mod-active .markdown-preview-view')!.scrollTop = 100; });
	await page.waitForTimeout(300);
	assert.ok(Math.abs((await button.boundingBox())!.y - (unscrolled.y - 100)) < 2, 'the T scrolls with the title');
	// Far from the top, reading view takes the title out of the page; the T must not jump into a corner.
	await scrollToLine(lineOf('Configure') + 4);
	assert.equal(await inlineTitle.count(), 0, 'reading view dropped the title far from the top');
	assert.doesNotMatch((await button.getAttribute('class')) ?? '', /htoc-pos-/, 'the T stays with the title out of sight');
	await scrollToLine(0);
	await assertAfterTitle('back at the top');
	await page.evaluate(() => (globalThis as any).app.workspace.rightSplit.expand());
	await page.waitForTimeout(800);
	assert.ok((await button.boundingBox())!.x < unscrolled.x - 20, 'the title moved left in the narrower pane');
	await assertAfterTitle('narrower pane');
	await page.evaluate(() => (globalThis as any).app.workspace.rightSplit.collapse());
	await page.waitForTimeout(800);
	const rename = (from: string, to: string) => page!.evaluate(async ({ from, to }) => {
		const g = globalThis as any;
		await g.app.fileManager.renameFile(g.app.vault.getAbstractFileByPath(from), to);
	}, { from, to });
	const shortTitleEnd = (await titleEnd()).right;
	await rename('Main.md', 'Main with a longer title.md');
	await page.waitForTimeout(500);
	assert.ok((await titleEnd()).right > shortTitleEnd + 50, 'the title got longer');
	await assertAfterTitle('renamed');
	await rename('Main with a longer title.md', 'Main.md');
	await page.waitForTimeout(500);
	await assertAfterTitle('renamed back');

	step('without the inline title, or with the setting off, the T goes back to its corner');
	const assertInCorner = async (where: string) => {
		assert.match((await button.getAttribute('class')) ?? '', /htoc-pos-top-right/, where);
		const box = (await button.boundingBox())!;
		assert.ok(box.x > leafBox.x + leafBox.width / 2 && box.y < leafBox.y + leafBox.height / 2, `${where}: the T is in the top right of the note`);
	};
	await setInlineTitle(false);
	await assertInCorner('inline title hidden');
	await setInlineTitle(true);
	await assertAfterTitle('inline title shown again');
	await updateSettings({ titleIcon: false });
	await page.waitForTimeout(200);
	await assertInCorner('setting off');
	await button.hover();
	await toc.waitFor({ timeout: 3000 });
	const cornerBox = (await button.boundingBox())!, cornerTocBox = (await toc.boundingBox())!;
	assert.ok(Math.abs(cornerTocBox.x + cornerTocBox.width - (cornerBox.x + cornerBox.width)) < 2, 'the table of contents opens towards the middle again');
	await moveAway();
	await updateSettings({ titleIcon: true });
	await page.waitForTimeout(200);
	await assertAfterTitle('setting on again');
	await setInlineTitle(false);
	await assertInCorner('inline title hidden again');

	step('settings tab renders');
	assert.equal(await page.evaluate(() => (globalThis as any).app.commands.executeCommandById('app:open-settings')), true);
	// Obsidian 1.14 opens settings in their own window.
	const settingsPage = context.pages().find((candidate) => candidate !== page) ?? await context.waitForEvent('page');
	const settingRow = (name: string) => settingsPage.locator('.setting-item')
		.filter({ has: settingsPage.locator('.setting-item-name').getByText(name, { exact: true }) });
	await settingsPage.getByText('Hovered Table of Content', { exact: true }).click();
	await settingsPage.getByText('Icon position', { exact: true }).waitFor({ timeout: 5000 });
	const positionSelect = settingsPage
		.locator('.setting-item', { hasText: 'Icon position' }).locator('select:not(.is-measuring)'); // Obsidian adds a hidden measuring select
	assert.deepEqual(await positionSelect.locator('option').allTextContents(), ['Top left', 'Top center', 'Top right', 'Bottom left', 'Bottom center', 'Bottom right']);
	assert.equal(await positionSelect.inputValue(), 'top-right');
	const stickyToggle = settingRow('Sticky headings').locator('.checkbox-container');
	assert.match((await stickyToggle.getAttribute('class')) ?? '', /is-enabled/, 'sticky headings are on by default');
	for (const name of ['Icon after the note title', 'Icon in notes', 'Icons on links', 'Icons on links in notes', 'Icons on sticky headings'])
		assert.match((await settingRow(name).locator('.checkbox-container').getAttribute('class')) ?? '', /is-enabled/, `${name} is on by default`);
	assert.match((await settingRow('Heading numbers in tables of contents').locator('.checkbox-container').getAttribute('class')) ?? '', /is-enabled/, 'heading numbers in tables of contents are on by default');
	const stickyNumbersToggle = settingRow('Numbers on sticky headings').locator('.checkbox-container');
	assert.doesNotMatch((await stickyNumbersToggle.getAttribute('class')) ?? '', /is-enabled/, 'numbers on sticky headings are off by default');
	const formatSelect = settingRow('Heading number format').locator('select:not(.is-measuring)');
	assert.deepEqual(await formatSelect.locator('option').allTextContents(), ['Within the section: 1, 2', 'With the parents: 1.1, 1.2']);
	assert.equal(await formatSelect.inputValue(), 'level');
	await settingsPage.screenshot({ path: `${out}/settings.png` });
	await stickyToggle.click();
	await page.waitForTimeout(300);
	assert.equal(await page.locator('.workspace-leaf.mod-active .htoc-sticky').count(), 0, 'the toggle disables sticky headings');
	assert.equal(await settingRow('Sticky heading mode').locator('select:not(.is-measuring)').isDisabled(), true, 'dependent settings are disabled');
	await positionSelect.selectOption('bottom-left');
	await page.waitForTimeout(300);
	assert.match((await button.getAttribute('class')) ?? '', /htoc-pos-bottom-left/, 'the dropdown moves the icon');
	const titleToggle = settingRow('Icon after the note title').locator('.checkbox-container');
	await titleToggle.click();
	await page.waitForTimeout(300);
	const savedSettings = await page.evaluate(async () => (globalThis as any).app.plugins.plugins['hovered-table-of-content'].loadData());
	assert.equal(savedSettings.buttonPosition, 'bottom-left', 'declarative dropdown persists');
	assert.equal(savedSettings.stickyHeadings, false, 'declarative toggle persists');
	assert.equal(savedSettings.titleIcon, false, 'the icon after the note title toggle persists');
	await titleToggle.click();
	await page.waitForTimeout(300);
	assert.match((await titleToggle.getAttribute('class')) ?? '', /is-enabled/, 'the icon follows the note title again');
	await stickyToggle.click();
	await page.waitForTimeout(300);
	assert.equal(await settingRow('Sticky heading mode').locator('select:not(.is-measuring)').isDisabled(), false, 'dependent settings are enabled again');
	await formatSelect.selectOption('full');
	await page.waitForTimeout(300);
	await button.hover();
	await toc.waitFor({ timeout: 3000 });
	assert.deepEqual(await numbersOf(toc.locator('.htoc-toc-item')), ['1.', '1.1.', '1.1.1.', '1.1.2.', '1.2.', '1.3.'], 'the dropdown changes the number format');
	await moveAway();
	const numbersToggle = settingRow('Heading numbers in tables of contents').locator('.checkbox-container');
	const savedNumbers = () => page!.evaluate(async () => {
		const saved = await (globalThis as any).app.plugins.plugins['hovered-table-of-content'].loadData();
		return [saved.headingNumbers, saved.stickyNumbers, saved.numberFormat];
	});
	await numbersToggle.click();
	await page.waitForTimeout(300);
	assert.equal(await formatSelect.isDisabled(), true, 'the number format is disabled without numbers');
	assert.deepEqual(await savedNumbers(), [false, false, 'full'], 'the number settings persist');
	await stickyNumbersToggle.click();
	await page.waitForTimeout(300);
	assert.equal(await formatSelect.isDisabled(), false, 'numbers on sticky headings enable the number format');
	assert.deepEqual(await savedNumbers(), [false, true, 'full'], 'numbers on sticky headings persist');
	await stickyNumbersToggle.click();
	await numbersToggle.click();
	await page.waitForTimeout(300);
	assert.equal(await formatSelect.isDisabled(), false, 'the number format is enabled again');
	await settingsPage.close();

	assert.equal(errors.length, 0, errors.join('\n'));
	await writeFile(`${out}/report.json`, JSON.stringify({ obsidian: process.env.OBSIDIAN_VERSION,
		plugin: JSON.parse(await readFile('manifest.json', 'utf8')).version, realApp: true, errors }, null, 2));
	console.log('Real Obsidian end-to-end checks passed');
} catch (error) {
	if (page) await page.screenshot({ path: `${out}/failure.png` }).catch(() => {});
	failure = error;
} finally {
	if (browser) await browser.close().catch(() => {});
	if (app && app.exitCode === null) app.kill('SIGTERM');
}
if (failure) throw failure;
