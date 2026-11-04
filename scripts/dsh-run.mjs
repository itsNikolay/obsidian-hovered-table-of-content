import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Probe only local tools. No model request or credential values enter the report.
const probe = (command, args) => spawnSync(command, args, { encoding: 'utf8', timeout: 5000 });
const dsh = probe('dsh', ['--version']);
const docker = probe('docker', ['info', '--format', '{{.ServerVersion}}']);
const keyConfigured = Boolean(process.env.DEEPSEEK_API_KEY?.trim());
const ready = keyConfigured && dsh.status === 0 && docker.status === 0;
const report = process.argv[2] === '--preflight' ? console.log : console.error;
report('Model: deepseek-official / deepseek-flash');
report(`DEEPSEEK_API_KEY: ${keyConfigured ? 'configured' : 'missing (reload your interactive shell before launching)'}`);
report(`DSH CLI: ${dsh.status === 0 ? 'available' : 'unavailable'}`);
report(`Docker: ${docker.status === 0 ? 'available' : 'unavailable; the coordinator needs Docker access'}`);
report('Docker validation owner: coordinator. Workers implement and report commands; the coordinator executes tests.');

if (!ready) {
	process.exitCode = 1;
} else if (process.argv[2] !== '--preflight') {
	const args = process.argv.slice(2);
	const task = (args.length === 0 || (args.length === 1 && args[0] === '-') ? readFileSync(0, 'utf8') : args.join(' ')).trim();
	if (!task) {
		console.error('Provide a task argument or pipe a task on stdin.');
		process.exitCode = 1;
	} else {
		const directory = mkdtempSync(join(tmpdir(), 'htoc-dsh-'));
		try {
			const overlay = join(directory, 'flash.yml');
			writeFileSync(overlay, '- id: agent-default-model\n  config:\n    provider: deepseek-official\n    model: deepseek-flash\n');
			const instructions = 'Docker validation is owned by the coordinator. Do not run Docker or retry alternative builders. Implement the task and report the commands the coordinator should run. Read only the task and relevant source files; keep session event logs out of your context.\n\n';
			const result = spawnSync('dsh', ['headless', '--patch', overlay, '--json', instructions + task], { stdio: 'inherit' });
			if (result.error) console.error('DSH could not start. Check the CLI installation.');
			process.exitCode = result.status ?? 1;
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	}
}
