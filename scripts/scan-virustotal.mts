import { readFile, writeFile, mkdir, lstat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createClient, verdict, type Verdict } from './virustotal-client.mts';

const files = ['main.js', 'manifest.json', 'styles.css'];
interface ScanItem { name: string; sha256: string; status: Verdict['status']; url: string; analysisId?: string; detected?: number; analyzed?: number; stats?: Record<string, number>; analysisDate?: number; completedAt?: string }
interface ScanReport { service: string; version: string; startedAt: string; status: string; files: ScanItem[]; finishedAt?: string }
interface ScanOptions { directory?: string; output?: string; apiKey?: string; client?: ReturnType<typeof createClient>; timeoutMs?: number; now?: () => number }
const digest = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');

export async function scanRelease({ directory = '.', output = 'artifacts/virustotal',
	apiKey = process.env.VIRUSTOTAL_API_KEY, client = createClient({ apiKey }),
	timeoutMs = 20 * 60 * 1000, now = Date.now }: ScanOptions = {}) {
	const snapshots = [];
	// Preflight every allowlisted artifact before making a single external request.
	for (const name of files) {
		const path = join(resolve(directory), name);
		if (!(await lstat(path)).isFile()) throw new Error(`Expected regular release file: ${name}`);
		const bytes = await readFile(path);
		if (!bytes.length || bytes.length > 32 * 1024 * 1024) throw new Error(`Invalid upload size: ${name}`);
		snapshots.push({ name, path, bytes, sha256: digest(bytes) });
	}
	const manifest: { id?: unknown; version?: unknown } = JSON.parse(snapshots[1]!.bytes.toString('utf8'));
	if (manifest.id !== 'hovered-table-of-content' || typeof manifest.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(manifest.version))
		throw new Error('Expected Hovered Table of Content release manifest');
	const report: ScanReport = { service: 'VirusTotal', version: manifest.version,
		startedAt: new Date(now()).toISOString(), status: 'incomplete', files: [] };
	const deadline = now() + timeoutMs;
	await mkdir(output, { recursive: true });
	try {
		for (const file of snapshots) {
			const item: ScanItem = { name: file.name, sha256: file.sha256, status: 'pending',
				url: `https://www.virustotal.com/gui/file/${file.sha256}` };
			report.files.push(item);
			const form = new FormData();
			form.append('file', new Blob([new Uint8Array(file.bytes)]), file.name);
			const uploaded = await client.request('/files', { method: 'POST', body: form });
			const id = uploaded.data?.id;
			if (typeof id !== 'string' || !id.length) throw new Error('VirusTotal returned no analysis ID');
			item.analysisId = id;
			while (now() < deadline) {
				const analysis = await client.request(`/analyses/${encodeURIComponent(id)}`);
				const result = verdict(analysis.data?.attributes);
				const remoteHash = analysis.meta?.file_info?.sha256;
				if (remoteHash && remoteHash !== file.sha256) throw new Error('VirusTotal analysis hash mismatch');
				if (result.status === 'pending') continue;
				Object.assign(item, result, { stats: analysis.data?.attributes?.stats,
					analysisDate: analysis.data?.attributes?.date, completedAt: new Date(now()).toISOString() });
				break;
			}
			if (item.status === 'pending') throw new Error('VirusTotal analysis timed out; scan not verified');
		}
		for (const file of snapshots) {
			if (digest(await readFile(file.path)) !== file.sha256) throw new Error('Release artifacts changed during scanning');
		}
		report.status = report.files.some(item => item.status === 'flagged') ? 'flagged' : 'no-detections';
		if (report.status === 'flagged') throw new Error('VirusTotal reported malicious or suspicious detections; release blocked');
		return report;
	} catch (error) {
		report.status = report.files.some(item => item.status === 'flagged') ? 'flagged' : 'incomplete';
		// Only the verdict and local identifiers go into the report; never credentials or response bodies.
		throw error;
	} finally {
		report.finishedAt = new Date(now()).toISOString();
		await writeFile(join(output, 'virustotal-report.json'), JSON.stringify(report, null, 2) + '\n');
		const rows = report.files.map(item => `| ${item.name} | ${item.status} | ${item.detected ?? '—'} / ${item.analyzed ?? '—'} | [SHA-256 report](${item.url}) |`);
		await writeFile(join(output, 'virustotal-report.md'), [
			`# VirusTotal — Hovered Table of Content ${manifest.version}`, '',
			`Overall result: **${report.status}**. Scan: ${report.startedAt}.`, '',
			'| File | Result | Detections / engine verdicts | Report |', '| --- | --- | --- | --- |', ...rows, '',
			'No detections is an antivirus scan result, not a guarantee that software is safe. Unsupported engines and failures are recorded in the JSON statistics.', '',
			...report.files.map(item => `- ${item.name}: \`${item.sha256}\``), ''
		].join('\n'));
	}
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
	try {
		const result = await scanRelease({ directory: process.argv[2] || '.', output: process.argv[3] || 'artifacts/virustotal' });
		console.log(`VirusTotal: ${result.status} for ${result.files.length} release files`);
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	}
}
