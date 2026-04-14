const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const rootDir = __dirname;
const port = parseInt(process.env.PORT || '3000', 10);

const mimeByExt = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml; charset=utf-8',
    '.ico': 'image/x-icon',
    '.webp': 'image/webp',
    '.txt': 'text/plain; charset=utf-8'
};

const safeJoin = (base, target) => {
    const targetPath = path.normalize(path.join(base, target));
    if (!targetPath.startsWith(base)) return null;
    return targetPath;
};

const server = http.createServer(async (req, res) => {
    try {
        const u = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

        if (req.method !== 'GET' && req.method !== 'HEAD') {
            res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Method Not Allowed');
            return;
        }

        const reqPath = decodeURIComponent(u.pathname || '/');
        const rel = reqPath === '/' ? '/index.html' : reqPath;
        const filePath = safeJoin(rootDir, rel);

        if (!filePath) {
            res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Bad Request');
            return;
        }

        let stat = null;
        try { stat = fs.statSync(filePath); } catch { stat = null; }

        if (!stat || !stat.isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Not Found');
            return;
        }

        const ext = path.extname(filePath).toLowerCase();
        const mime = mimeByExt[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-store' });

        if (req.method === 'HEAD') {
            res.end();
            return;
        }

        fs.createReadStream(filePath).pipe(res);
    } catch {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Server Error');
    }
});

server.listen(port, () => {
    console.log(`GoGold server running on port ${port}`);
});
