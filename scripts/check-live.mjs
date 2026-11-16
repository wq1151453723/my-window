import https from 'node:https';

const url = 'https://wq1151453723.github.io/my-window/';
https.get(url, (res) => {
  const chunks = [];
  res.on('data', (c) => chunks.push(c));
  res.on('end', () => {
    const buf = Buffer.concat(chunks);
    const html = buf.toString('utf8');
    const ids = [...html.matchAll(/id="([a-z-]+)"/g)].map((m) => m[1]);
    const clean = buf.includes(Buffer.from('\u6211\u7684\u7a97\u53e3', 'utf8'));
    console.log('HTTP', res.statusCode, 'bytes', buf.length);
    console.log('sections:', ids.join(', '));
    console.log('clean utf8:', clean);
    console.log('images:', [...html.matchAll(/src="images\/([^"]+)/g)].length, '| audio:', [...html.matchAll(/src="audio\/([^"]+)/g)].length);
    console.log('cards:', [...html.matchAll(/class="card"/g)].length, '| details:', [...html.matchAll(/<details>/g)].length);
  });
}).on('error', (e) => console.log('ERR', e.message));
