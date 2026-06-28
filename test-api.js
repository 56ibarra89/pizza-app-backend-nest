const http = require('http');

const data = JSON.stringify({
  payments: [{ method: 'EFECTIVO', amount: 150 }]
});

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/orders/ORD-1782012817650/finalize',
  method: 'PATCH',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = http.request(options, (res) => {
  let resData = '';
  res.on('data', (chunk) => {
    resData += chunk;
  });
  res.on('end', () => {
    console.log(`STATUS: ${res.statusCode}`);
    console.log(`BODY: ${resData}`);
  });
});

req.on('error', (e) => {
  console.error(`problem with request: ${e.message}`);
});

req.write(data);
req.end();
