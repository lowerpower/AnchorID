import { env, createExecutionContext, waitOnExecutionContext, SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import worker from '../src/index';

// For now, you'll need to do something like this to get a correctly-typed
// `Request` to pass to `worker.fetch()`.
const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

describe('AnchorID worker', () => {
	it('homepage returns AnchorID HTML (unit style)', async () => {
		const request = new IncomingRequest('http://example.com');
		// Create an empty context to pass to `worker.fetch()`.
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		// Wait for all `Promise`s passed to `ctx.waitUntil()` to settle before running test assertions
		await waitOnExecutionContext(ctx);
		const html = await response.text();
		expect(html).toContain('<title>AnchorID</title>');
		expect(html).toContain('Canonical UUID identity anchors');
		expect(html).toContain('Create Your AnchorID');
	});

	it('homepage returns AnchorID HTML (integration style)', async () => {
		const response = await SELF.fetch('https://example.com');
		const html = await response.text();
		expect(html).toContain('<title>AnchorID</title>');
		expect(html).toContain('Canonical UUID identity anchors');
		expect(html).toContain('Create Your AnchorID');
	});
});
