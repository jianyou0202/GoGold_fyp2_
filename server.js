const http = require('http');
const https = require('https');
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

const rssUrl = 'https://news.google.com/rss/search?q=gold%20price%20OR%20gold%20futures%20OR%20GC%3DF%20OR%20xauusd%20when%3A7d&hl=en-US&gl=US&ceid=US:en';

const fetchRss = () => {
    return new Promise((resolve, reject) => {
        const r = https.request(
            rssUrl,
            {
                method: 'GET',
                headers: {
                    'User-Agent': 'GoGold/1.0 (+news proxy)',
                    'Accept': 'application/rss+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.1'
                }
            },
            (resp) => {
                const chunks = [];
                resp.on('data', (c) => chunks.push(c));
                resp.on('end', () => {
                    const text = Buffer.concat(chunks).toString('utf8');
                    if (resp.statusCode && resp.statusCode >= 200 && resp.statusCode < 300) {
                        resolve(text);
                        return;
                    }
                    reject(new Error(`Upstream HTTP ${resp.statusCode || 500}`));
                });
            }
        );
        r.on('error', reject);
        r.end();
    });
};

const server = http.createServer(async (req, res) => {
    try {
        const u = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

        if (u.pathname === '/api/news') {
            if (req.method !== 'GET' && req.method !== 'HEAD') {
                res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('Method Not Allowed');
                return;
            }
            try {
                const xml = await fetchRss();
                res.writeHead(200, {
                    'Content-Type': 'application/rss+xml; charset=utf-8',
                    'Cache-Control': 'public, max-age=300'
                });
                if (req.method === 'HEAD') { res.end(); return; }
                res.end(xml);
            } catch {
                res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
                res.end('Bad Gateway');
            }
            return;
        }

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
