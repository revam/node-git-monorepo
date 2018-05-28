# git-service

Serve git smart protocol over http(s).

## Install

```sh
$ npm install --save git-service
```

## What is this?

This packages main focus is defining an abstraction for serving git. It
includes several helpers for creating a git server or framework middleware.

See the documentation for a full list of exports.

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

The documentation can be  found at [github](.).

## Related packages

- [git-service-koa](https://www.npmjs.com/package/git-service-koa)
- [git-packet-streams](https://www.npmjs.com/package/git-packet-streams)

## Simular projects

- [pushover](https://github.com/substack/pushover)
- [git-http-backend](https://github.com/substack/git-http-backend)
- [git-server](https://github.com/stackdot/NodeJS-Git-Server)
- [grack](https://github.com/schacon/grack)

## Usage

Bare http server.

```js
import { createServer } from "http";
import { createController, createMiddleware } from "git-service";
import { resolve } from "path";

// Load variables from environment
const { ORIGIN_ENV = "./repos", PORT } = process.env;

// Create controller and server
const controller = createController(resolve(__dirname, ORIGIN_ENV));
const server = createServer(createMiddleware(controller));

// Log errors thrown in controller
controller.onError.add((error) => console.error(error));

// Start serving git
server.listen(parseInt(PORT, 10) || 3000, (err)
  => err ? console.error(err) : console.log(`listening on port ${PORT || 3000}`));
```

Minimal http server, but with some logging added.

```js
import { createServer } from "http";
import { createController, createMiddleware } from "git-service";
import { resolve } from "path";

// Load variables from environment
const { ORIGIN_ENV = "./repos", PORT } = process.env;

// Create controller, middleware and server
const controller = createController(resolve(__dirname, ORIGIN_ENV));
const middleware = createMiddleware(controller, (service) => {
  service.onRequest.addOnce((request) => {
    console.log(`SERVICE REQUEST - ${request.service} - ${request.path}`);
  });
  service.onResponse.addOnce((response) => {
    console.log(`SERVICE RESPONSE - ${response.statusCode} - ${response.statusMessage}`);
  });
});
const server = createServer(async function(request, response) {
  console.log(`REQUEST - ${request.method} - ${request.url}`);
  await middleware(request, response);
  console.log(`RESPONSE - ${response.statusCode} - ${response.statusMessage}`);
});

// Log errors thrown in controller
controller.onError.add((error) => console.error(error));

// Start serving git
server.listen(parseInt(PORT, 10) || 3000, (err)
  => err ? console.error(err) : console.log(`listening on port ${PORT || 3000}`));
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
