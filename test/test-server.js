"use strict";

let counter = 0;
const http = require("http");
const HttpStatus = require("http-status");
const { createDriver, createDriverCache, Service, ServiceType } = require("..");
const { ORIGIN_ENV: origin = "./repos", PORT } = process.env;
const port = safeParseInt(PORT, 3000);
const cache = createDriverCache();
const driver = createDriver(origin, cache);
const server = http.createServer(async function(request, response) {
  if (request.url === "/favicon.ico") {
    response.statusCode = 404;
    return response.end();
  }

  const id = counter++;
  console.log(`${id} - REQUEST - ${request.method} - ${request.url}`);
  response.on("finish", () => console.log(`${id} - RESPONSE - ${response.statusCode}`));

  const service = new Service(driver, request.method, request.url, request.headers, request);

  service.onAccept.addOnce(function ({status, headers, body}) {
    headers.forEach(function (value, header) { response.setHeader(header, value); });
    response.statusCode = status;
    body.pipe(response, {end: true});
  });
  service.onReject.addOnce(function ({status, headers, reason}) {
    headers.forEach(function (value, header) { response.setHeader(header, value); });
    response.statusCode = status;
    response.end(reason || HttpStatus[status], "utf8");
  });
  service.onError.addOnce(function (err) {
    if (!response.headersSent) {
      response.statusCode = err.status || err.statusCode || 500;
      response.setHeader("Content-Type", "text/plain");
      response.end(HttpStatus[response.statusCode], "utf8");
    } else if (response.connection.writable) {
      response.end();
    }
  });
  service.onError.add(function (err) {
    console.error(err, id);
  });

  console.log(`${id} - SERVICE - ${ServiceType[service.type]} - ${service.repository}`)

  service.inform("Served from package 'git-service' found at npmjs.com");

  if (!await service.exists()) {
    await service.reject(404);
  } else if (!await service.access()) {
    await service.reject(403);
  } else {
    await service.accept();
  }
});

process.on("SIGTERM", () => server.close());
server.listen(port, () => console.log(`server is listening on port ${port}`));

function safeParseInt(source, default_value) {
  const value = parseInt(source);
  return Number.isNaN(value) ? default_value : value;
}
