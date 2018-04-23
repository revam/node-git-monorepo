# git-service

Serve git over http(s).

## Install
This is a [Node.js](https://nodejs.org/en/) module available through the
[npm registry](https://www.npmjs.com/).

Before installing, [download and install Node.js](https://nodejs.org/en/download/).
Node.js 8 or higher is required.

Installation is done using the
[`npm install` command](https://docs.npmjs.com/getting-started/installing-npm-packages-locally):

```sh
$ npm install --save git-service
```

## Why start at version 2?

Because this is actually a rewrite of another package. But since the main reason for the
package changed, so did the name. If you're interested, the other package can be found
[here](.).

## What is this?

This package is a framework independent library for serving git over http(s).
The main export are the interfaces `IService` and `IServiceDriver`, tougether
creating a commonground for serving git trough node.
In addition to these interfaces does this package also contain;
a reference class `Service` implementing `IService`, the two functions `serveRequest` and `checkIfValidServiceDriver`, and some more interfaces you can find in the [full documentation](.).

**Note:** An implementation of `IServiceDriver` is **not** so you can use any compatible driver that passes the checks in `checkIfValidServiceDriver`. For the reference driver implementation see package [git-service-driver](.). Though it is a reference implementation, it does

### Motivation for this package

I am not a fan of events used in a middleware-driven workflow, as it breaks the
middleware-pattern, so I made this library which, in my eyes, is better suited for such
uses. I also made it framework independent so it can be fit for any framework you want to
use.

It's a side-project, so expect irregular updates, if any, in case you want to use it.
Below you can find some simular projects which helped me greatly when creating this
package. Also a great help was the technical documentation for git, which can be found
[at github](https://github.com/git/git/blob/master/Documentation/technical).

## Related packages

- [git-service-driver](.)
- [git-service-http](.)
- [git-service-koa](.)
- [git-packet-streams](.)

## Simular projects

- [pushover](https://github.com/substack/pushover)
- [git-http-backend](https://github.com/substack/git-http-backend)
- [git-server](.)
- [grack](.)

## Documentation

THe full documentation can be found at [Github Pages](.).

## Usage

**Note:** It is recommended to use a function or class from a sub-package found above.

```js
"use strict";

import http from "http";
import HttpStatus from "http-status";
import { RequestType, Service } from "git-service";
import { createDriver, createDriverCache } from "git-service-basic-drivers";

const { ORIGIN_ENV: origin = "./repos", PORT } = process.env;
const port = safeParseInt(PORT, 3000);
const cache = createDriverCache();
const driver = createDriver(origin, cache);
const server = http.createServer(async function(request, response) {
  if (request.url === "/favicon.ico") {
    response.statusCode = 404;
    return response.end();
  }
  console.log("HTTP %s - %s", request.method, request.url);
  const service = new Service(driver, request.method, request.url, request.headers, request);
  service.onResponse.addOnce(function ({body, headers, statuscode, statusMessage}) {
    headers.forEach(function (value, header) { response.setHeader(header, value); });
    response.statusCode = statusCode;
    response.statusMessage = statusMessage;
    body.pipe(response, {end: true});
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
  service.onError.add(function (err) { console.error(err, id); });
  service.informClient("Served from package 'git-service' found at npmjs.com");
  await serveRequest(service);
});

process.on("SIGTERM", () => server.close());
server.listen(port, () => console.log(`server is listening on port ${port}`));

function safeParseInt(source, default_value) {
  const value = parseInt(source);
  return Number.isNaN(value) ? default_value : value;
}
```

## Typescript

This module includes a [TypeScript](https://www.typescriptlang.org/)
declaration file to enable auto complete in compatible editors and type
information for TypeScript projects. This module depends on the Node.js
types, so install `@types/node`:

```sh
npm install --save-dev @types/node
```

## Changelog and versioning

All notable changes to this project will be documented in [CHANGELOG.md](./CHANGELOG.md).

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## License

This project is licensed under the MIT license. See [LICENSE](./LICENSE) for the full terms.
