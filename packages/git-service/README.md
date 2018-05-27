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

The documentation can be  found at [github](.).

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

Bare http server.

```js
import { createServer, STATUS_CODES } from "http";
import { createController, createService } from "git-service";
import { resolve } from "path";
import { promisify } from "util";

const { ORIGIN_ENV = "./repos", PORT } = process.env;
let port = parseInt(PORT, 10);
if (Number.isNaN(port)) {
  port = 3000;
}
const origin = resolve(ORIGIN_ENV);
const controller = createController(origin);
controller.onError.add((error) => console.error(error));
const server = createServer(async function(request, response) {
  console.log(`REQUEST - ${request.method} - ${request.url}`);
  const service = createService(controller, request.url,  request.method, request.headers, request);
  try {
    const {body, headers, statusCode, statusMessage} = await service.serve();
    headers.forEach(function (header, value) { response.setHeader(header, value); });
    response.statusCode = statusCode;
    response.statusMessage = statusMessage;
    await promisify(response.end.bind(response))(body);
  } catch (error) {
    console.error(error);
    if (typeof error === "object") {
      if (!response.headersSent) {
        response.statusCode = error.status || error.statusCode || 500;
        response.setHeader("Content-Type", "text/plain");
        response.setHeader("Content-Length", STATUS_CODES[response.statusCode].length);
        response.write(STATUS_CODES[response.statusCode], "utf8");
      }
    }
    if (response.writable) {
      response.end();
    }
  }
});

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
