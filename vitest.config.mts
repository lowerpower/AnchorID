import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
	test: {
		hookTimeout: 30000,
		poolOptions: {
			workers: {
				wrangler: { configPath: './wrangler.jsonc' },
				miniflare: {
					bindings: {
						// Admin auth (required for admin routes to be enabled in tests)
						ANCHOR_ADMIN_TOKEN: 'test-admin-token',
						// Fake email provider so login/signup handlers don't return 501
						RESEND_API_KEY: 'test-resend-key',
						EMAIL_FROM: 'test@example.com',
						// Low rate limits for security tests (comments in security.spec.ts reference these)
						IP_RESOLVE_RL_PER_HOUR: '5',
						IP_CLAIMS_RL_PER_HOUR: '5',
						IP_ADMIN_LOGIN_RL_PER_HOUR: '3',
						IP_LOGIN_RL_PER_HOUR: '5',
						IP_EDIT_RL_PER_HOUR: '5',
						IP_UPDATE_RL_PER_HOUR: '10',
						IP_CLAIM_RL_PER_HOUR: '5',
						CLAIM_RL_PER_HOUR: '5',
					},
				},
			},
		},
	},
});
