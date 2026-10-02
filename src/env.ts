import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	DATABASE_URL: {
		description: 'Path to the SQLite database file.',
		schema: (value) => value || 'data/jumpseat.db'
	},
	ANTHROPIC_API_KEY: {
		description:
			'Claude API key for the AI trip planner (console.anthropic.com). The planner is hidden without it.',
		schema: (value) => value || undefined
	},
	AERODATABOX_API_KEY: {
		description:
			'RapidAPI key for AeroDataBox (rapidapi.com/aedbx-aedbx/api/aerodatabox), used to fill in flights from their number. Lookup is hidden without it.',
		schema: (value) => value || undefined
	},
	APP_PASSWORD: {
		description:
			'Lets internet visitors (through Tailscale Funnel) sign in and use the whole app. Without it they only get share links. The tailnet never asks for it.',
		schema: (value) => value || undefined
	},
	PUBLIC_ORIGIN: {
		description:
			'Public base URL used when building share links (e.g. your Tailscale Funnel URL). Falls back to the request origin.',
		schema: (value) => value || undefined
	}
});
