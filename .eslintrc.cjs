const vitestFiles = ['app/**/__tests__/**/*', 'app/**/*.{spec,test}.*']
const testFiles = ['**/tests/**', ...vitestFiles]
const appFiles = ['app/**']

/** @type {import('@types/eslint').Linter.BaseConfig} */
module.exports = {
	extends: [
		'@remix-run/eslint-config',
		'@remix-run/eslint-config/node',
		'prettier',
	],
	plugins: ['unused-imports'],
	rules: {
		'react-refresh/only-export-components': 'off',
		// playwright requires destructuring in fixtures even if you don't use anything 🤷‍♂️
		'no-empty-pattern': 'off',
		'no-console': 'warn',
		'@typescript-eslint/no-unused-vars': 'off',
		'unused-imports/no-unused-imports': [
			'warn',
			{ varsIgnorePattern: '^_', argsIgnorePattern: '^_' },
		],
		'@typescript-eslint/consistent-type-imports': [
			'warn',
			{
				prefer: 'type-imports',
				disallowTypeAnnotations: true,
				fixStyle: 'inline-type-imports',
			},
		],
		'import/no-duplicates': ['warn', { 'prefer-inline': true }],
		'import/consistent-type-specifier-style': ['warn', 'prefer-inline'],
		'import/order': [
			'warn',
			{
				alphabetize: { order: 'asc', caseInsensitive: true },
				groups: [
					'builtin',
					'external',
					'internal',
					'parent',
					'sibling',
					'index',
				],
			},
		],
	},
	overrides: [
		{
			plugins: ['remix-react-routes', 'react-refresh'],
			files: appFiles,
			excludedFiles: testFiles,
			rules: {
				'remix-react-routes/use-link-for-routes': 'error',
				'remix-react-routes/require-valid-paths': 'error',
				// disable this one because it doesn't appear to work with our
				// route convention. Someone should dig deeper into this...
				'remix-react-routes/no-relative-paths': [
					'off',
					{ allowLinksToSelf: true },
				],
				'remix-react-routes/no-urls': 'error',
				'no-restricted-imports': [
					'error',
					{
						patterns: [
							{
								group: testFiles,
								message: 'Do not import test files in app files',
							},
						],
					},
				],
			},
		},
		{
			extends: ['@remix-run/eslint-config/jest-testing-library'],
			files: vitestFiles,
			rules: {
				'testing-library/no-await-sync-events': 'off',
				'jest-dom/prefer-in-document': 'off',
			},
			// we're using vitest which has a very similar API to jest
			// (so the linting plugins work nicely), but it means we have to explicitly
			// set the jest version.
			settings: {
				jest: {
					version: 28,
				},
			},
		},
		// {
		// 	files: ['*.html'],
		// 	extends: ['plugin:@html-eslint/recommended'],
		// 	parser: '@html-eslint/parser',
		// 	rules: {
		// 		'@html-eslint/require-closing-tags': 'off',
		// 		'@html-eslint/indent': 'off',
		// 	},
		// },
	],
}
