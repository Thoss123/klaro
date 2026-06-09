const https = require('https');

https.get('https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@5/svgs/solid/map-signs.svg', (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  res.on('data', d => process.stdout.write(d));
});
