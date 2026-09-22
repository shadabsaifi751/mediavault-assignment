import http from 'node:http';

let requestHandler;

// Intercept http.createServer to capture the route handler without altering server/
const originalCreateServer = http.createServer;
http.createServer = function (fn) {
  requestHandler = fn;
  const server = originalCreateServer.apply(this, arguments);
  server.listen = () => server; // Prevent port binding in serverless environment
  return server;
};

// Import mock server
await import('../server/index.mjs');

export default async function handler(req, res) {
  if (requestHandler) {
    return requestHandler(req, res);
  }
  res.writeHead(500, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: { message: 'Server handler not initialized' } }));
}
