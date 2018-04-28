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

## What is this?

This packages main focus is defining interfaces for a high-level git service. It also
includes a reference implementation of the main interface, `IService`, as default export.
All the git-heavy work is done by a driver implementing the `IServiceDriver` interface,
and the reference implementation can be found in the seperate
[`git-service-driver` package](.).

See the documentation for a full list of exported interfaces.

### Motivation for this package

I am not a fan of events used in a middleware-driven workflow, as it breaks the
middleware-pattern, so I made this library which, in my eyes, is better suited for such
uses. I also made it framework independent so it can be fit for any framework you want to
use.

It's a side-project, so expect irregular updates, if any, in case you want to use it.
Below you can find some simular projects which helped me greatly when creating this
package. Also a great help was the technical documentation for git, which can be found
[at github](https://github.com/git/git/blob/master/Documentation/technical).

## Documentation

The full documentation can be  found at [github](.).

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

## Usage

**Note:** It is recommended to use a function or class from a sub-package found above.

```js
"use strict";

import http from "http";
import HttpStatus from "http-status";
import Service, { RequestType, serveResponse } from "git-service";
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
