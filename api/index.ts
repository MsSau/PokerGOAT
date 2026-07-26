// Vercel serverless entrypoint. Vercel treats every file under /api as its
// own function; this project only needs one, since server.ts's Express app
// already owns its own internal routing (/api/verdict-prose, /api/deep-
// analysis, /api/verdict-reflection). vercel.json rewrites every /api/*
// request to this function while preserving the original path, so Express's
// own route table still matches exactly as it does locally — this file is
// intentionally just a re-export, no routing logic of its own.
export { default } from '../server';
