import tseslint from 'typescript-eslint';

const dispatch = ':matches([callee.property.name="dispatchEvent"], [callee.property.value="dispatchEvent"])';
export default [{
	files: ['scripts/test-obsidian-docker.mts', 'scripts/record-demo.mts'],
	languageOptions: { parser: tseslint.parser },
	rules: {
		'no-restricted-syntax': ['error', {
			selector: `CallExpression${dispatch}[arguments.0.value="click"]`,
			message: 'Use a real pointer click in UI checks, not a synthetic click event.',
		}, {
			selector: `CallExpression${dispatch}[arguments.0.type="NewExpression"][arguments.0.arguments.0.value="click"]`,
			message: 'Use a real pointer click in UI checks, not a synthetic click event.',
		}],
	},
}];
