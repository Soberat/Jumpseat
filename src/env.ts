import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	DATABASE_URL: {
		description: 'Path to the SQLite database file.',
		schema: (value) => value || 'data/jumpseat.db'
	},
	PUBLIC_ORIGIN: {
		description:
			'Public base URL used when building share links (e.g. your Tailscale Funnel URL). Falls back to the request origin.',
		schema: (value) => value || undefined
	}
});
