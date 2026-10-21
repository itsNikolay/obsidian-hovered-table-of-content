// Builds the test image and runs one of the entrypoint modes (unit, check, e2e, demo).
// The container has no network and only writes screenshots/reports to artifacts/docker.
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const mode = process.argv[2] || 'check';
if (!['unit', 'check', 'e2e', 'demo'].includes(mode)) throw new Error('Expected unit, check, e2e or demo');
const out = resolve('artifacts/docker');
mkdirSync(out, { recursive: true });
const image = 'hovered-table-of-content-test';
const run = (args) => {
	const result = spawnSync('docker', args, { stdio: 'inherit' });
	if (result.error) throw result.error;
	if (result.status !== 0) process.exit(result.status || 1);
};
run(['build', '-f', 'docker/Dockerfile', '-t', image, '.']);
run(['run', '--rm', '--shm-size=1g', '--network=none',
	'--mount', `type=bind,source=${out},target=/artifacts`,
	image, 'bash', 'docker/entrypoint.sh', mode]);
if (mode === 'demo') {
	mkdirSync('docs', { recursive: true });
	copyFileSync(resolve(out, 'demo.gif'), 'docs/demo.gif');
	console.log('Updated docs/demo.gif');
}
