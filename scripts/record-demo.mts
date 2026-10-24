// Records the README demo GIF in the real Linux Obsidian app inside Docker (see docker/entrypoint.sh).
// Uses a synthetic, disposable vault; never touches the host Obsidian or a personal vault.
import { chromium, type Browser, type Locator, type Page } from 'playwright';
import type { ChildProcess } from 'node:child_process';
import { mkdir, writeFile, copyFile } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { homedir } from 'node:os';
import { join } from 'node:path';

if (process.env.HTOC_DOCKER !== '1') throw new Error('Run this through npm run docker:demo. Host Obsidian is never launched.');

const PLUGIN_ID = 'hovered-table-of-content';
const WIDTH = 1200, HEIGHT = 760, GIF_WIDTH = 900, FPS = 10;
const vault = '/tmp/htoc-vault', profile = join(homedir(), '.config', 'obsidian'), out = '/artifacts';
const pluginDir = `${vault}/.obsidian/plugins/${PLUGIN_ID}`;
await mkdir(pluginDir, { recursive: true });
await mkdir(profile, { recursive: true });
await mkdir(out, { recursive: true });
for (const file of ['main.js', 'manifest.json', 'styles.css']) await copyFile(file, `${pluginDir}/${file}`);
await writeFile(`${vault}/.obsidian/community-plugins.json`, JSON.stringify([PLUGIN_ID]));
await writeFile(`${vault}/.obsidian/app.json`, JSON.stringify({ safeMode: false, livePreview: true, showInlineTitle: true }));
await writeFile(`${vault}/.obsidian/appearance.json`, JSON.stringify({ theme: 'obsidian' }));
await writeFile(`${profile}/obsidian.json`, JSON.stringify({ vaults: { demo: { path: vault, ts: Date.now(), open: true } } }));

const prose = (topic: string, count: number) => Array.from({ length: count }, (_, i) => [
	`The ${topic} step keeps the team moving without surprises.`,
	`Write down what you changed, why it matters and who should look at it next.`,
	`Small, frequent updates are easier to follow than one large batch (note ${i + 1}).`,
].join(' ')).join('\n\n');
const handbook = [
	// The inline title already shows the note name.
	'# Overview',
	'Everything a new teammate needs in one note: how to get set up, how work flows and how we ship.',
	prose('onboarding', 2),
	'## Getting started',
	'New here? Skim the [[Glossary]] first, then follow the steps below.',
	prose('setup', 2),
	'### Install',
	'- Clone the repository\n- Install the dependencies\n- Run the test suite once',
	prose('install', 3),
	'### Configure',
	'Copy the example settings and fill in your own values.',
	prose('configure', 3),
	'## Workflow',
	prose('planning', 2),
	'### Branches',
	'One branch per change, named after the ticket.',
	prose('branching', 4),
	'### Reviews',
	'Every change gets at least one review before it lands.',
	prose('review', 4),
	'## Release',
	prose('release', 4),
	'## FAQ',
	prose('support', 4),
].join('\n\n');
await writeFile(`${vault}/Project Handbook.md`, handbook + '\n');
await writeFile(`${vault}/Glossary.md`, [
	'# Glossary', 'Words we use every day.',
	'## Build', 'A versioned bundle of the plugin, ready to install.',
	'## Release train', 'Every second Tuesday the main branch is tagged and shipped. Missed it? Catch the next one.',
	'## Vault', 'A folder of Markdown notes that Obsidian opens as one workspace.',
].join('\n\n') + '\n');

let app: ChildProcess | undefined, recorder: ChildProcess | undefined;
let browser: Browser | undefined, page: Page | undefined;
let failure: unknown;
let cursor = { x: WIDTH / 2, y: HEIGHT / 2 };

/** Shows a fake pointer (Xvfb draws none) and a caption bar on top of the Obsidian window. */
async function installOverlay() {
	await page!.addStyleTag({ content: `
		#demo-cursor { position: fixed; z-index: 100000; pointer-events: none; width: 22px; height: 22px; margin: -2px 0 0 -3px;
			filter: drop-shadow(0 1px 2px rgba(0,0,0,.6)); }
		#demo-caption { position: fixed; z-index: 99999; pointer-events: none; left: 50%; bottom: 36px; transform: translateX(-50%);
			padding: 10px 20px; border-radius: 10px; background: rgba(124, 58, 237, .95); color: #fff;
			font: 600 20px/1.3 system-ui, sans-serif; white-space: nowrap; box-shadow: 0 6px 24px rgba(0,0,0,.4); transition: opacity .25s; }
		#demo-caption:empty { opacity: 0; }` });
	await page!.evaluate(() => {
		const pointer = document.createElement('div');
		pointer.id = 'demo-cursor';
		pointer.innerHTML = '<svg viewBox="0 0 22 22" width="22" height="22"><path d="M3 2 L3 18 L7.5 14 L10.5 20.5 L13 19.5 L10 13 L16 13 Z" fill="#fff" stroke="#000" stroke-width="1.3" stroke-linejoin="round"/></svg>';
		const caption = document.createElement('div');
		caption.id = 'demo-caption';
		document.body.append(pointer, caption);
		document.addEventListener('mousemove', (event) => {
			pointer.style.left = `${event.clientX}px`;
			pointer.style.top = `${event.clientY}px`;
		}, true);
	});
}

let captionCount = 0;
/** Captions are numbered in the order they appear; an empty text hides the caption. */
const caption = (text: string) => page!.evaluate((text) => { document.getElementById('demo-caption')!.textContent = text; },
	text && `${++captionCount}. ${text}`);
const pause = (ms: number) => page!.waitForTimeout(ms);

/** Moves the pointer like a person would: eased, at screen refresh rate. */
async function glide(x: number, y: number, duration = 600) {
	const from = cursor, steps = Math.max(1, Math.round(duration / 16));
	for (let i = 1; i <= steps; i++) {
		const t = i / steps, ease = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
		await page!.mouse.move(from.x + (x - from.x) * ease, from.y + (y - from.y) * ease);
		await pause(16);
	}
	cursor = { x, y };
}

async function glideTo(target: Locator, duration?: number, dx = 0.5) {
	await target.waitFor({ timeout: 5000 });
	const box = (await target.boundingBox())!;
	await glide(box.x + box.width * dx, box.y + box.height / 2, duration);
}

async function scrollBy(total: number, steps: number) {
	for (let i = 0; i < steps; i++) {
		await page!.mouse.wheel(0, total / steps);
		await pause(40);
	}
}

try {
	app = spawn(process.env.OBSIDIAN_EXECUTABLE || '/opt/squashfs-root/obsidian', ['--no-sandbox', '--disable-gpu',
		'--remote-debugging-port=9222', `--user-data-dir=${profile}`], { stdio: 'ignore' });
	for (let attempt = 0; attempt < 120 && !browser; attempt++) {
		try { browser = await chromium.connectOverCDP('http://127.0.0.1:9222', { timeout: 1000 }); }
		catch { await new Promise((resolve) => setTimeout(resolve, 250)); }
	}
	assert.ok(browser, 'Cannot connect to Obsidian');
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
	for (const args of [['windowsize', windowId, String(WIDTH), String(HEIGHT)], ['windowmove', windowId, '0', '0']])
		assert.equal(spawnSync('xdotool', args).status, 0, 'Cannot size Obsidian window');
	await trust.click();
	await page.waitForFunction(() => (globalThis as any).app?.vault?.getName() === 'htoc-vault', null, { timeout: 60000 });
	await page.evaluate(async (id) => {
		const g = globalThis as any;
		await g.app.plugins.enablePluginAndSave(id);
		const leaf = g.app.workspace.getLeaf(false);
		await leaf.openFile(g.app.vault.getAbstractFileByPath('Project Handbook.md'), { state: { mode: 'preview' } });
		g.app.workspace.leftSplit.collapse();
		g.app.workspace.rightSplit.collapse();
	}, PLUGIN_ID);
	await page.getByRole('button', { name: 'Allow', exact: true }).first().click({ timeout: 5000 }).catch(() => {});
	await page.bringToFront();
	await page.waitForFunction(() => (globalThis as any).app.metadataCache.getCache('Project Handbook.md')?.headings?.length === 9, null, { timeout: 15000 });
	await page.evaluate(() => {
		const leaf = (globalThis as any).app.workspace.getMostRecentLeaf();
		return leaf.setViewState({ type: 'markdown', state: { file: 'Project Handbook.md', mode: 'preview' } });
	});
	const button = page.locator('.workspace-leaf.mod-active .htoc-button');
	await button.waitFor({ timeout: 10000 });
	await installOverlay();
	await page.mouse.move(cursor.x, cursor.y);
	await pause(1000);

	recorder = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'x11grab', '-draw_mouse', '0', '-framerate', '30',
		'-video_size', `${WIDTH}x${HEIGHT}`, '-i', ':99.0+0,0', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '12',
		'-pix_fmt', 'yuv444p', '/tmp/demo.mp4'], { stdio: ['pipe', 'inherit', 'inherit'] });
	await pause(1200);

	await caption('Hover the T after the note title to see the table of contents');
	await glideTo(button, 900);
	const toc = page.locator('.htoc-toc').first();
	await toc.waitFor({ timeout: 3000 });
	await pause(1300);

	await caption('Hover a heading to preview its section');
	await glideTo(toc.locator('.htoc-toc-item', { hasText: 'Getting started' }), 500, 0.3);
	const preview = page.locator('.htoc-preview').first();
	await preview.waitFor({ timeout: 3000 });
	await pause(1500);

	await caption('Hover a link to see the linked note');
	const link = preview.locator('a.internal-link', { hasText: 'Glossary' }).first();
	const linkBox = (await link.boundingBox())!;
	await glide(linkBox.x + linkBox.width + 60, cursor.y, 400); // into the preview first, so the TOC list is not crossed
	await glideTo(link, 500, 0.4);
	const pagePreview = page.locator('.hover-popover', { hasText: 'Release train' });
	await pagePreview.waitFor({ timeout: 5000 });
	await pause(1600);

	await caption('Page previews get a T with the table of contents');
	await glideTo(pagePreview.locator('.htoc-preview-button'), 700);
	const previewToc = page.locator('.htoc-toc', { hasText: 'Release train' });
	await previewToc.waitFor({ timeout: 3000 });
	await pause(900);
	await glideTo(previewToc.locator('.htoc-toc-item', { hasText: 'Release train' }), 500, 0.3);
	await page.locator('.htoc-preview', { hasText: 'Every second Tuesday' }).waitFor({ timeout: 3000 });
	await pause(2000);

	await caption('Links in the note get a T too');
	await glide(WIDTH * 0.12, HEIGHT * 0.85, 600);
	await page.waitForFunction(() => !document.querySelector('.htoc-popup, .hover-popover'), null, { timeout: 5000 });
	const noteLinkIcon = page.locator('.workspace-leaf.mod-active .markdown-reading-view .htoc-note-link-toc').first();
	await glideTo(noteLinkIcon, 800);
	const noteLinkToc = page.locator('.htoc-toc', { hasText: 'Release train' });
	await noteLinkToc.waitFor({ timeout: 3000 });
	await pause(900);
	await glideTo(noteLinkToc.locator('.htoc-toc-item', { hasText: 'Build' }), 500, 0.3);
	await page.locator('.htoc-preview', { hasText: 'A versioned bundle' }).waitFor({ timeout: 3000 });
	await pause(1800);

	await caption('Click a heading to jump to it');
	await glide(WIDTH * 0.12, HEIGHT * 0.85, 600);
	await pause(500);
	await glideTo(button, 700);
	await toc.waitFor({ timeout: 3000 });
	await glideTo(page.locator('.htoc-toc .htoc-toc-item', { hasText: 'Install' }), 500, 0.3);
	await pause(500);
	await page.mouse.down();
	await page.mouse.up();
	await glide(WIDTH * 0.45, HEIGHT * 0.5, 500);
	await pause(1500);

	await caption('Sticky headings stay on top while you scroll');
	const stickyRow = (text: string) => page!.locator('.workspace-leaf.mod-active .htoc-sticky-row', { has: page!.locator('.htoc-sticky-text', { hasText: text }) });
	for (let i = 0; i < 20 && await stickyRow('Branches').count() === 0; i++) await scrollBy(150, 5);
	await scrollBy(150, 5);
	await pause(1400);

	await caption('The T on a sticky heading lists its subheadings');
	await glideTo(stickyRow('Workflow').locator('.htoc-sticky-toc'), 700);
	await page.locator('.htoc-toc').first().waitFor({ timeout: 3000 });
	await pause(1800);

	await caption('Click a sticky heading to jump back to it');
	await glideTo(stickyRow('Workflow').locator('.htoc-sticky-text'), 600, 0.2);
	await pause(500);
	await page.mouse.down();
	await page.mouse.up();
	await pause(1800);
	await caption('');
	await pause(800);

	recorder.stdin!.end('q');
	await new Promise((resolve) => recorder!.once('exit', resolve));
	const gif = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', '/tmp/demo.mp4', '-vf',
		`fps=${FPS},scale=${GIF_WIDTH}:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`,
		'-loop', '0', `${out}/demo.gif`], { stdio: 'inherit' });
	assert.equal(gif.status, 0, 'GIF conversion failed');
	console.log(`Demo written to ${out}/demo.gif`);
} catch (error) {
	if (page) await page.screenshot({ path: `${out}/demo-failure.png` }).catch(() => {});
	failure = error;
} finally {
	if (recorder && recorder.exitCode === null) recorder.kill('SIGINT');
	if (browser) await browser.close().catch(() => {});
	if (app && app.exitCode === null) app.kill('SIGTERM');
}
if (failure) throw failure;
