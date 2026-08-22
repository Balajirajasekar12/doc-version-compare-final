import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = String.raw`C:\Users\BALAJI\Downloads\doc-version-compare-final-main\doc-version-compare-final-main\test-fixtures\highmark`;

const MIME = {
  '.rtf': 'application/rtf',
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  try {
    const urlPath = decodeURIComponent(req.url || '/').replace(/^\//, '');
    
    if (urlPath === '' || urlPath === '/') {
      // List all files in ROOT
      const files = fs.readdirSync(ROOT).filter(f => {
        const ext = path.extname(f).toLowerCase();
        return ['.pdf', '.rtf', '.docx', '.xlsx'].includes(ext);
      }).map(f => ({
        name: f,
        path: f,
        size: fs.statSync(path.join(ROOT, f)).size,
      }));
      res.setHeader('Content-Type', 'application/json');
      res.writeHead(200);
      res.end(JSON.stringify(files));
      return;
    }
    
    const filePath = path.join(ROOT, urlPath);
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

server.listen(9878, '127.0.0.1', () => {
  console.log('File server running on http://127.0.0.1:9878');
  console.log('Serving from:', ROOT);
});
