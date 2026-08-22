import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = String.raw`C:\Users\BALAJI\Downloads\sample_reports_4_formats\sample_reports_4_formats`;

const MIME = {
  '.rtf': 'application/rtf',
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

function walkFiles(dir, base) {
  const results = [];
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (fs.statSync(full).isDirectory()) {
      results.push(...walkFiles(full, base));
    } else {
      const ext = path.extname(entry).toLowerCase();
      if (['.pdf', '.rtf', '.docx', '.xlsx'].includes(ext)) {
        const rel = path.relative(base, full).split(path.sep).join('/');
        results.push({ name: entry, path: rel, size: fs.statSync(full).size });
      }
    }
  }
  return results;
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  try {
    const urlPath = decodeURIComponent(req.url || '/').replace(/^\//, '');
    
    // Root: return file listing as JSON
    if (urlPath === '' || urlPath === '/') {
      const allFiles = walkFiles(ROOT, ROOT);
      res.setHeader('Content-Type', 'application/json');
      res.writeHead(200);
      res.end(JSON.stringify(allFiles));
      return;
    }
    
    const normalizedPath = urlPath.split('/').join('\\');
    const filePath = path.join(ROOT, normalizedPath);
    const resolved = path.resolve(filePath);

    if (!resolved.startsWith(path.resolve(ROOT))) {
      res.writeHead(403); res.end('Forbidden'); return;
    }
    if (!fs.existsSync(resolved) || fs.statSync(resolved).isDirectory()) {
      res.writeHead(404); res.end('Not found: ' + urlPath); return;
    }

    const ext = path.extname(resolved).toLowerCase();
    res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
    fs.createReadStream(resolved).pipe(res);
  } catch (e) {
    console.error('[ERR]', e);
    res.writeHead(500); res.end('Error');
  }
});

server.listen(9877, '127.0.0.1', () => {
  console.log('File server running on http://127.0.0.1:9877');
  console.log('Serving from:', ROOT);
});
