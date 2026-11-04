// @vitest-environment node
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, expect, test } from 'vitest';

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))); });

async function tools() {
	const directory = await mkdtemp(join(tmpdir(), 'htoc-tooling-'));
	directories.push(directory);
	const bin = join(directory, 'bin'), log = join(directory, 'calls.jsonl');
	await mkdir(bin);
	for (const name of ['docker', 'dsh']) {
		await writeFile(join(bin, name), `#!/usr/bin/env node\nconst fs = require('node:fs');\nconst args = process.argv.slice(2);\nfs.appendFileSync(process.env.CALL_LOG, JSON.stringify({command:${JSON.stringify(name)},args,patch:args.includes('--patch') ? fs.readFileSync(args[args.indexOf('--patch')+1],'utf8') : undefined})+'\\n');\nif (args[0] === '--version') console.log('dsh test-version');\nif (args[0] === 'info') { console.log('test-docker'); process.exit(Number(process.env.DOCKER_EXIT || 0)); }\nif (args[0] === 'headless') { console.log('worker finished'); process.exit(Number(process.env.DSH_EXIT || 0)); }\n`, { mode: 0o755 });
	}
	const env = { ...process.env, PATH: `${bin}:${process.env.PATH ?? ''}`, CALL_LOG: log, DEEPSEEK_API_KEY: 'unit-test-key-must-stay-private' };
	const run = (script: string, args: string[] = [], extra: Record<string, string> = {}) => spawnSync(process.execPath,
		['--experimental-strip-types', resolve(script), ...args], { encoding: 'utf8', env: { ...env, ...extra } });
	const calls = async () => {
		try { return (await readFile(log, 'utf8')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line) as { command: string; args: string[]; patch?: string }); }
		catch { return []; }
	};
	return { run, calls };
}

test('DSH preflight reports the chosen model without disclosing the API key or calling a model', async () => {
	const { run, calls } = await tools();
	const result = run('scripts/dsh-run.mjs', ['--preflight']);
	expect(result.status).toBe(0);
	expect(result.stdout).toContain('deepseek-flash');
	expect(result.stdout).toContain('DEEPSEEK_API_KEY');
	expect(result.stdout + result.stderr).not.toContain('unit-test-key-must-stay-private');
	expect((await calls()).some(call => call.args[0] === 'headless')).toBe(false);
});

test('missing credentials or coordinator Docker access fail before launching a worker', async () => {
	const { run, calls } = await tools();
	const missing = run('scripts/dsh-run.mjs', ['build this'], { DEEPSEEK_API_KEY: '' });
	expect(missing.status).toBe(1);
	expect(missing.stdout + missing.stderr).toContain('DEEPSEEK_API_KEY');
	const docker = run('scripts/dsh-run.mjs', ['build this'], { DOCKER_EXIT: '1' });
	expect(docker.status).toBe(1);
	expect(docker.stdout + docker.stderr).toContain('Docker');
	expect((await calls()).some(call => call.args[0] === 'headless')).toBe(false);
});

test('DSH launch selects Flash, assigns Docker to the coordinator and preserves worker failure', async () => {
	const { run, calls } = await tools();
	const result = run('scripts/dsh-run.mjs', ['Implement the approved ticket'], { DSH_EXIT: '7' });
	expect(result.status).toBe(7);
	const worker = (await calls()).find(call => call.command === 'dsh' && call.args[0] === 'headless');
	expect(worker?.args).toContain('--patch');
	expect(worker?.patch).toContain('model: deepseek-flash');
	expect(worker?.patch).toContain('provider: deepseek-official');
	const prompt = worker?.args.at(-1) ?? '';
	expect(prompt).toContain('coordinator');
	expect(prompt).toContain('Implement the approved ticket');
	const overlay = worker?.args[(worker?.args.indexOf('--patch') ?? -1) + 1];
	expect(overlay).toBeTruthy();
	await expect(readFile(overlay!, 'utf8')).rejects.toThrow();
});

test('filtered Docker unit tests preserve each argument, including a test name with spaces', async () => {
	const { run, calls } = await tools();
	const result = run('scripts/run-docker.mjs', ['unit', 'tests/unit/toc.test.ts', '-t', 'clicking the title']);
	expect(result.status).toBe(0);
	const invocation = (await calls()).find(call => call.args[0] === 'run');
	expect(invocation?.args.slice(-4)).toEqual(['unit', 'tests/unit/toc.test.ts', '-t', 'clicking the title']);
});

test('unknown E2E scenarios fail before building an image', async () => {
	const { run, calls } = await tools();
	const result = run('scripts/run-docker.mjs', ['e2e', '--scenario', 'typo']);
	expect(result.status).toBe(1);
	expect(result.stdout + result.stderr).toContain('Unknown E2E scenario');
	expect(await calls()).toEqual([]);
});

test('UI lint rejects synthetic clicks and accepts real clicks and non-click events', () => {
	const lint = (code: string) => spawnSync(process.execPath, ['node_modules/eslint/bin/eslint.js', '--config', 'eslint.ui.config.mjs',
		'--stdin', '--stdin-filename', 'scripts/test-obsidian-docker.mts'], { input: code, encoding: 'utf8' });
	for (const code of ["await title.dispatchEvent('click');", "element.dispatchEvent(new MouseEvent('click'));", "await title['dispatchEvent']('click');"]) {
		const result = lint(code);
		expect(result.status).toBe(1);
		expect(result.stdout).toContain('real pointer');
	}
	expect(lint("await title.click(); await title.dispatchEvent('mouseenter');").status).toBe(0);
});
