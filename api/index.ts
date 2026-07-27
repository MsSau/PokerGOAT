// Vercel serverless entrypoint. Vercel treats every file under /api as its
// own function; this project only needs one, since server.ts's Express app
// already owns its own internal routing (/api/verdict-prose, /api/deep-
// analysis, /api/verdict-reflection). vercel.json rewrites every /api/*
// request to this function while preserving the original path, so Express's
// own route table still matches exactly as it does locally — this file is
// intentionally just a re-export, no routing logic of its own.
//
// The `.js` extension below is required, not stylistic: Vercel's Node
// builder transpiles this and server.ts separately (unlike `build:server`'s
// esbuild bundle, which inlines everything into one file) and runs them
// under real Node ESM resolution, which — unlike CommonJS `require` — never
// auto-resolves extensionless relative specifiers. Without it this crashed
// every /api/* request in production with ERR_MODULE_NOT_FOUND, even though
// it worked locally under tsx/Vite's more permissive resolution.
export { default } from '../server.js';
