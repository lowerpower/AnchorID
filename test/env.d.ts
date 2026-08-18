declare module 'cloudflare:test' {
	interface ProvidedEnv extends Env {}
}

// miniflare Text-module imports (used to hash the real static pages' inline scripts)
declare module '*.html' {
	const content: string;
	export default content;
}
