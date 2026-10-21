// @vitest-environment node
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { scanRelease } from '../../scripts/scan-virustotal.mts';
import { createClient, verdict, type ApiResponse } from '../../scripts/virustotal-client.mts';

const secret = 'unit-test-secret-not-a-real-key';
const cleanStats = { malicious: 0, suspicious: 0, undetected: 3, harmless: 1 };
const sha256 = (data: Uint8Array | string) => createHash('sha256').update(data).digest('hex');
const directories: string[] = [];

afterEach(async () => {
	await Promise.all(directories.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
});

async function fixture() {
	const directory = await mkdtemp(join(tmpdir(), 'htoc-virus-test-'));
	directories.push(directory);
	await writeFile(join(directory, 'main.js'), '// public plugin fixture');
	await writeFile(join(directory, 'styles.css'), '.htoc-icon { color: black; }');
	await writeFile(join(directory, 'manifest.json'), JSON.stringify({ id: 'hovered-table-of-content', version: '1.0.0' }));
	await writeFile(join(directory, 'private-note.md'), 'PRIVATE MUST NEVER UPLOAD');
	return { directory, output: join(directory, 'reports') };
}

type Request = (path: string, options?: { method?: string; body?: BodyInit }) => Promise<ApiResponse>;

function scanClient(stats: Record<string, number> = cleanStats) {
	const uploads: { name: string; bytes: Buffer }[] = [];
	const request: Request = async (path, options) => {
		if (path === '/files') {
			const file = (options?.body as FormData).get('file') as File;
			uploads.push({ name: file.name, bytes: Buffer.from(await file.arrayBuffer()) });
			return { data: { id: `analysis-${uploads.length}` } };
		}
		return { data: { attributes: { status: 'completed', stats } },
			meta: { file_info: { sha256: sha256(uploads.at(-1)!.bytes) } } };
	};
	return { uploads, request };
}

const response = (status: number, payload: unknown) => ({ status, ok: status >= 200 && status < 300,
	headers: new Headers(), json: async () => payload }) as unknown as Response;

function clock() {
	let time = 0;
	const waits: number[] = [];
	return { now: () => time, sleep: async (ms: number) => { waits.push(ms); time += ms; }, waits };
}

const readReport = async (output: string) =>
	JSON.parse(await readFile(join(output, 'virustotal-report.json'), 'utf8')) as
		{ status: string; files: { status: string; detected?: number }[] };

describe('VirusTotal client', () => {
	test('verdict distinguishes complete clean, flagged, and pending analyses', () => {
		expect(verdict({ status: 'queued' })).toEqual({ status: 'pending' });
		expect(verdict({ status: 'in-progress', stats: { malicious: 1 } })).toEqual({ status: 'pending' });
		expect(verdict({ status: 'completed', stats: { malicious: 0, suspicious: 0, undetected: 5, harmless: 2, timeout: 1 } }))
			.toEqual({ status: 'no-detections', detected: 0, analyzed: 7 });
		expect(verdict({ status: 'completed', stats: { malicious: 2, suspicious: 1, undetected: 5, harmless: 2 } }))
			.toEqual({ status: 'flagged', detected: 3, analyzed: 10 });
	});

	test('verdict fails closed for missing, malformed, and unsupported statistics', () => {
		const valid = { malicious: 0, suspicious: 0, undetected: 1, harmless: 0 };
		for (const stats of [undefined, null, [], {}, { ...valid, malicious: -1 },
			{ ...valid, suspicious: 0.5 }, { ...valid, undetected: '1' },
			{ ...valid, timeout: NaN }, { ...valid, harmless: Infinity },
			{ malicious: 0, suspicious: 0, undetected: 0, harmless: 0 },
			{ malicious: 0, suspicious: 0, undetected: 0, harmless: 0, timeout: 3 }]) {
			expect(() => verdict({ status: 'completed', stats: stats as Record<string, number> })).toThrow();
		}
	});

	test('requests use the fixed API, authenticate, and prohibit redirects', async () => {
		const calls: { url: string; options: RequestInit }[] = [];
		const body = new FormData();
		body.append('file', new Blob(['fixture']), 'fixture.js');
		const client = createClient({ apiKey: secret, ...clock(),
			fetchImpl: (async (url: string, options: RequestInit) => {
				calls.push({ url, options });
				return response(200, { data: { id: 'analysis-id' } });
			}) as typeof fetch });
		expect(await client.request('/files', { method: 'POST', body })).toEqual({ data: { id: 'analysis-id' } });
		const call = calls[0]!;
		expect(call.url).toBe('https://www.virustotal.com/api/v3/files');
		expect(new Headers(call.options.headers).get('x-apikey')).toBe(secret);
		expect(call.options.redirect).toBe('error');
		expect(call.options.body).toBe(body);
		expect(call.options.method).toBe('POST');
		expect(call.options.signal).toBeInstanceOf(AbortSignal);
	});

	test('rejects missing credentials and paths that could expose the API key', async () => {
		for (const apiKey of [undefined, '', '   ']) expect(() => createClient({ apiKey })).toThrow();
		let calls = 0;
		const client = createClient({ apiKey: secret, ...clock(),
			fetchImpl: (async () => { calls++; return response(200, {}); }) });
		for (const path of ['https://example.com/files', '//example.com/files', 'files',
			'/files?key=bad', '/analyses/a#fragment', '/unknown']) {
			await expect(client.request(path)).rejects.toThrow(/^(?!.*unit-test-secret)/);
		}
		expect(calls).toBe(0);
	});

	test('requests keep the public API interval without real delays', async () => {
		const fake = clock();
		const starts: number[] = [];
		const client = createClient({ apiKey: secret, ...fake, intervalMs: 16000,
			fetchImpl: (async () => { starts.push(fake.now()); return response(200, { data: {} }); }) });
		await client.request('/files/a');
		await client.request('/files/b');
		await client.request('/files/c');
		expect(starts).toHaveLength(3);
		expect(starts[1]! - starts[0]!).toBeGreaterThanOrEqual(16000);
		expect(starts[2]! - starts[1]!).toBeGreaterThanOrEqual(16000);
	});

	test('retries temporary HTTP failures and bounds exhausted attempts', async () => {
		let calls = 0;
		const fake = clock();
		const client = createClient({ apiKey: secret, ...fake, intervalMs: 1, maxAttempts: 4,
			fetchImpl: (async () => response([429, 503, 200][calls++]!, { data: { id: 'ok' } })) });
		expect(await client.request('/analyses/a')).toEqual({ data: { id: 'ok' } });
		expect(calls).toBe(3);
		expect(fake.waits.every(ms => Number.isFinite(ms) && ms >= 0)).toBe(true);
		calls = 0;
		const failing = createClient({ apiKey: secret, ...clock(), intervalMs: 1, maxAttempts: 4,
			fetchImpl: (async () => { calls++; return response(503, { error: { message: secret } }); }) });
		await expect(failing.request('/files/a')).rejects.toThrow(/^(?!.*unit-test-secret)/);
		expect(calls).toBe(4);
	});

	test('authentication failures are not retried or exposed with secret data', async () => {
		let calls = 0;
		const client = createClient({ apiKey: secret, ...clock(),
			fetchImpl: (async () => { calls++; return response(401, { error: { message: secret } }); }) });
		await expect(client.request('/files/a')).rejects.toThrow(/^(?!.*unit-test-secret)/);
		expect(calls).toBe(1);
	});

	test('rejects malformed JSON and network failures without leaking secrets', async () => {
		const client = createClient({ apiKey: secret, ...clock(),
			fetchImpl: (async () => ({ ...response(200, null), json: async () => { throw new SyntaxError(secret); } })) as unknown as typeof fetch });
		await expect(client.request('/files/a')).rejects.toThrow(/^(?!.*unit-test-secret)/);
		const networkFailure = createClient({ apiKey: secret, ...clock(), intervalMs: 1,
			fetchImpl: (async () => { throw new Error(secret); }) });
		await expect(networkFailure.request('/files/a')).rejects.toThrow(/^(?!.*unit-test-secret)/);
	});
});

describe('release scan', () => {
	test('uploads only the three release files and writes verifiable hash reports', async () => {
		const locations = await fixture();
		const client = scanClient();
		const result = await scanRelease({ ...locations, client });
		expect(result.status).toBe('no-detections');
		expect(client.uploads.map(file => file.name)).toEqual(['main.js', 'manifest.json', 'styles.css']);
		for (const file of client.uploads) {
			expect(file.bytes).toEqual(await readFile(join(locations.directory, file.name)));
			const item = result.files.find(item => item.name === file.name)!;
			expect(item.sha256).toBe(sha256(file.bytes));
			expect(item.url).toBe(`https://www.virustotal.com/gui/file/${sha256(file.bytes)}`);
		}
		const saved = await readReport(locations.output);
		expect(saved.status).toBe('no-detections');
		const markdown = await readFile(join(locations.output, 'virustotal-report.md'), 'utf8');
		expect(markdown).toContain('Hovered Table of Content 1.0.0');
		expect(markdown).toContain(result.files[0]!.sha256);
		expect(JSON.stringify(saved)).not.toContain('PRIVATE MUST NEVER UPLOAD');
	});

	test('rejects a manifest from another plugin', async () => {
		const locations = await fixture();
		await writeFile(join(locations.directory, 'manifest.json'), JSON.stringify({ id: 'other-plugin', version: '1.0.0' }));
		const client = scanClient();
		await expect(scanRelease({ ...locations, client })).rejects.toThrow(/Hovered Table of Content/);
		expect(client.uploads).toHaveLength(0);
	});

	test('blocks detections and keeps the flagged verdict', async () => {
		const locations = await fixture();
		await expect(scanRelease({ ...locations, client: scanClient({ ...cleanStats, suspicious: 1 }) }))
			.rejects.toThrow(/blocked/);
		const saved = await readReport(locations.output);
		expect(saved.status).toBe('flagged');
		expect(saved.files.every(file => file.detected === 1)).toBe(true);
	});

	test('fails closed when a pending analysis reaches its deadline', async () => {
		const locations = await fixture();
		let time = 0;
		const request: Request = async (path) => {
			time += 10;
			return path === '/files' ? { data: { id: 'pending' } } : { data: { attributes: { status: 'queued' } } };
		};
		await expect(scanRelease({ ...locations, client: { request }, now: () => time, timeoutMs: 30 }))
			.rejects.toThrow(/timed out/);
		const saved = await readReport(locations.output);
		expect(saved.status).toBe('incomplete');
		expect(saved.files[0]!.status).toBe('pending');
	});

	test('rejects mismatched remote hashes and malformed API responses', async () => {
		for (const mode of ['hash', 'missing-id', 'invalid-stats']) {
			const locations = await fixture();
			const request: Request = async (path) => {
				if (path === '/files') return { data: mode === 'missing-id' ? {} : { id: 'a' } };
				return { data: { attributes: { status: 'completed', stats: mode === 'invalid-stats' ? {} : cleanStats } },
					meta: mode === 'hash' ? { file_info: { sha256: 'wrong' } } : {} };
			};
			await expect(scanRelease({ ...locations, client: { request } })).rejects.toThrow();
			expect((await readReport(locations.output)).status).toBe('incomplete');
		}
	});

	test('checks all files before uploading and rejects symbolic links', async () => {
		const locations = await fixture();
		await unlink(join(locations.directory, 'styles.css'));
		await symlink(join(locations.directory, 'private-note.md'), join(locations.directory, 'styles.css'));
		const client = scanClient();
		await expect(scanRelease({ ...locations, client })).rejects.toThrow(/regular release file/);
		expect(client.uploads).toHaveLength(0);
	});

	test('detects release files modified after upload', async () => {
		const locations = await fixture();
		const client = scanClient();
		const request: Request = async (...args) => {
			const result = await client.request(...args);
			if (client.uploads.length === 3) await writeFile(join(locations.directory, 'main.js'), '// changed');
			return result;
		};
		await expect(scanRelease({ ...locations, client: { request } })).rejects.toThrow(/changed during scanning/);
		expect((await readReport(locations.output)).status).toBe('incomplete');
	});
});
