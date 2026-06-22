// Production server: serves the built frontend + Vercel-style API handlers as
// a regular Express app. Designed to be run on a plain VPS (Ubuntu, PM2, …).
//
//   node server.mjs                # default port 3001
//   PORT=4000 node server.mjs      # override port
//
// Picks up every file under ./api recursively and mounts it as a route based
// on its path. `index.js` → collection route. `[name].js` → /:name dynamic.

import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import express from 'express';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiDir = path.join(__dirname, 'api');
const staticDir = path.join(__dirname, 'dist');

const app = express();
// Large limit: image uploads send base64 data URIs which inflate ~33%.
app.use(express.json({ limit: '1gb' }));
app.use(express.urlencoded({ extended: true, limit: '1gb' }));

// Body-parse safety: Vercel handlers may expect req.body for POST/PUT.
// express.json() handles it for application/json; raw bodies are passed through.

async function mountRoutes(dir, prefix) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('_')) continue;
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      await mountRoutes(full, `${prefix}/${entry.name}`);
      continue;
    }

    if (!entry.name.endsWith('.ts') && !entry.name.endsWith('.js')) continue;

    const base = entry.name.replace(/\.(ts|js)$/, '');
    let routePath = prefix;

    if (base === 'index') {
      // /api/users/index.js → /api/users
    } else if (base.startsWith('[[...') && base.endsWith(']]')) {
      const param = base.slice(5, -2);
      routePath = `${prefix}/:${param}*?`;
    } else if (base.startsWith('[...') && base.endsWith(']')) {
      const param = base.slice(4, -1);
      routePath = `${prefix}/*${param}`;
    } else if (base.startsWith('[') && base.endsWith(']')) {
      const param = base.slice(1, -1);
      routePath = `${prefix}/:${param}`;
    } else {
      routePath = `${prefix}/${base}`;
    }

    const mod = await import(pathToFileURL(full).href);
    const handler = mod.default;
    if (typeof handler !== 'function') {
      console.warn(`[server] skip ${full} (no default export)`);
      continue;
    }

    app.all(routePath, async (req, res) => {
      // Vercel-style handlers read dynamic segments from req.query.
      // Express 5 marks req.query as a read-only getter, so we shim it with
      // a merged object before calling the handler.
      const mergedQuery = { ...req.query, ...req.params };
      Object.defineProperty(req, 'query', { value: mergedQuery, configurable: true });
      try {
        await handler(req, res);
      } catch (err) {
        console.error(`[server] handler error ${routePath}:`, err);
        if (!res.headersSent) {
          res.status(500).json({ message: err?.message || 'Internal Server Error' });
        }
      }
    });
    console.log(`  → ${routePath}`);
  }
}

console.log('[server] mounting API routes:');
await mountRoutes(apiDir, '/api');

// Static frontend
if (fs.existsSync(staticDir)) {
  app.use(express.static(staticDir, { index: false, maxAge: '1y' }));
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.sendFile(path.join(staticDir, 'index.html'));
  });
  console.log(`[server] serving static from ${staticDir}`);
} else {
  console.warn(`[server] dist/ not found — run \`npm run build\` first`);
}

const PORT = parseInt(process.env.PORT || '3001', 10);
const server = app.listen(PORT, () => {
  console.log(`[server] listening on http://0.0.0.0:${PORT}`);
});

// Keep process alive and handle shutdown
process.on('SIGINT', () => {
  console.log('[server] shutting down...');
  server.close(() => process.exit(0));
});

// Prevent process from exiting
process.stdin.resume();
