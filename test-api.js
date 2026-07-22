const http = require('https');
const data = JSON.stringify({ videoUrl: '/memes/Kedy/kedi1.mp4', caption: 'test' });
const req = http.request('https://girgirsamata.com/api/download-video-meme', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data)
  }
}, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => console.log('STATUS:', res.statusCode, 'BODY:', body));
});
req.on('error', (e) => console.error(e));
req.write(data);
req.end();
