import https from 'node:https';

const base = 'https://wq1151453723.github.io/my-window/';
const pages = ['index.html', 'books.html', 'ai-course.html', 'ai-tools.html', 'markets.html', 'world.html', 'wechat.html'];

function get(url) {
  return new Promise((resolve) => {
    https.get(url, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, buf: Buffer.concat(chunks) }));
    }).on('error', (e) => resolve({ status: 0, buf: Buffer.alloc(0), err: e.message }));
  });
}

for (const p of pages) {
  const r = await get(base + p);
  const clean = r.buf.includes(Buffer.from('\u6211\u7684\u7a97\u53e3', 'utf8'));
  const html = r.buf.toString('utf8');
  const links = [...html.matchAll(/href="([a-z-]+\.html)"/g)].map((m) => m[1]);
  console.log(p.padEnd(16), r.status, String(r.buf.length).padStart(7) + 'B', 'utf8:' + clean, 'links:' + [...new Set(links)].join(','));
}
