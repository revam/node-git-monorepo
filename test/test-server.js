'use strict';
// @ts-check

const http = require("http");
const HttpStatus = require("http-status");
const { createDriver, Service, ServiceType } = require(".");

const { ORIGIN_ENV: origin = "./repos" } = process.env;
const driver = createDriver(origin);
const server = http.createServer(async function(request, response) {
  if (request.url === "/favicon.ico") {
    response.statusCode = 404;
    return resonse.end();
  }

  console.log(`REQUEST - ${request.method} - ${request.url}`);
  const service = new Service(driver, request.method, request.url, request.headers, request);

  service.onAccept.addOnce(function ({status, headers, body}) {
    headers.forEach(function (value, header) { response.setHeader(header, value) });
    response.statusCode = status;
    body.pipe(response, {end: true});
  });
  service.onReject.addOnce(function ({status, headers, reason}) {
    headers.forEach(function (value, header) { response.setHeader(header, value) });
    response.statusCode = status;
    response.end(reason || HttpStatus[status], "utf8");
  });
  service.onError.addOnce(function(err) {
    console.error(err);
    if (!response.headersSent) {
      response.statusCode = err.status || err.statusCode || 500;
      response.setHeader("Content-Type", "text/plain");
      response.end(HttpStatus[response.statusCode], "utf8");
    }
  });

  console.log(`SERVICE - ${ServiceType[service.type]} - ${service.repository}`)

  try {
    await service.ready;
    if (!await service.exists()) {
      await service.reject(404);
    } else if (!await service.access()) {
      await service.reject(403);
    } else {
      await service.accept();
    }
  } catch (err) {
    console.log("WTF ERROR!");
    service.onError.dispatch(err);
  }

  console.log(`RESPONSE - ${request.method} - ${request.url} - ${response.statusCode}\n`);
});

process.on('SIGTERM', async function() {
  server.close();
});

server.listen(3000, () => console.log("server is ready"));
