import express from 'express';
import type {Request, Response, NextFunction} from 'express';
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

const distDir = path.join(__dirname, 'dist');
const staticRoot =
  process.env.NODE_ENV === 'production' && fs.existsSync(distDir)
    ? distDir
    : __dirname;

const BLOCKED_FILES = new Set([
  '/package.json',
  '/package-lock.json',
  '/tsconfig.json',
  '/metadata.json',
  '/server.ts',
  '/README.md',
  '/AGENTS.md',
  '/.env',
  '/.env.example',
  '/.gitignore',
]);

app.use((req: Request, res: Response, next: NextFunction) => {
  const normalizedPath = req.path.toLowerCase();
  if (
    BLOCKED_FILES.has(req.path) ||
    normalizedPath.endsWith('.ts') ||
    normalizedPath.startsWith('/.')
  ) {
    res.status(404).send('Not found');
    return;
  }
  next();
});

app.use(
  express.static(staticRoot, {
    dotfiles: 'ignore',
    index: 'index.html',
  })
);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`L'Oréal Routine Builder running at http://0.0.0.0:${PORT}`);
});
