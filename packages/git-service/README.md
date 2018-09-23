# git-service

Serve git over http(s).

## Install

From the npm register:

```sh
$ npm install --save git-service
```

From GitHub:

```sh
$ npm install --save https://github.com/revam/node-git-service/releases/download/git-service-v$VERSION/package.tgz
```

From git.lan (internet-people can ignore this):

```sh
$ npm install --save https://git.lan/mist/node-git-monorepo@git-service-v$VERSION/package.tgz
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
[here](https://git.kernel.org/pub/scm/git/git.git/tree/Documentation/technical), among other
places.

## Documentation

The documentation is not available as of yet, but if you use TypeScript, the definitions are available with some (short) descriptions. There are also some examples below for how you could use this library.

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
import { createMiddleware } from "git-service";
import { resolve } from "path";

// Load variables from environment
const origin = resolve(__dirname, process.env.ORIGIN_ENV || "./repos");
const port = parseInt(process.env.PORT, 10) || 3000;

// Create server
const server = createServer(createMiddleware(origin));

// Start server
server.listen(port, (err) =>
  err ? console.error(err) : console.log(`listening on port ${port}`));
```

Some snippets for controller.

```js
// Some simple logging
let int = 0;
controller.onUsable.add((request) => {
  request.state.ticket = `#${(int++).toString().padStart(4, "0")}`;
  if (int > 9999) { int = 0; }
  console.log(
    '%s - Request %s %s (url: "%s", method: %s)',
    request.state.ticket,
    request.path || "<unknown>",
    request.service || "Unknown",
    request.url,
    request.method,
  );
});
controller.onComplete.add((request) => {
  console.log(
    ' %s - Response %s %s (status: %s)',
    request.state.ticket,
    request.response.statusCode,
    request.response.statusMessage,
    request.status,
  );
});

// Restrict HTTP methods to known methods for server
const METHODS = new Set(["HEAD", "GET", "POST"]);
// LogicController#use gives us a context for request, with bound methods for
// controller.
controller.use(function (request, response) {
  if (!METHODS.has(request.method)) {
    return this.reject(501);
  }
});

// Reject request for resource "/favicon.ico"
controller.use(function (request) {
  if (request.url === "/favicon.ico") {
    return this.reject(404);
  }
});

// Reject all requests for invalid service types.
controller.use(function (request) {
  if (!request.service) {
    return this.reject(400, "Invalid service");
  }
});

// Reject all requests for repositories not ending with ".git" or ".git/".
const GIT_REGEX = /\.git\/?$/;
controller.use(function (request) {
  if (!GIT_REGEX.test(request.path)) {
    return this.reject(400, 'Repository path must end with ".git".');
  }
});

// Add user to state if users credentials are valid.
import Users from "./model/user"; // Example model from database.
controller.onUsable.add((request) => {
  if (request.headers.has("Authorization")) {
    const header = request.headers.get("Authorization");
    if (header.startsWith("Basic")) {
      // Works even if password contain colon (:).
      const data = Buffer.from(header.split(" ")[1] || "", "base64").toString("utf8").split(":");
      const username = data.shift();
      const password = data.join(":");
      const user = username && await Users.findByUsername(username) || undefined;
      if (user && await user.comparePassword(password)) {
        request.state.user = user;
      }
    }
  }
});

// Redirect from map
const redirects = new Map([
  ["test-2.git", "test-3.git"],
]);
controller.use(function (request) {
  if (redirects.has(request.path)) {
    return this.redirect(redirects.get(request.path));
  }
});

// Map public path to internal path or reject with 404.
const pathToInternalMap = new Map([
  ["revam/git-service.git", "5b/9d/ee4cc4e8af2864e2f34c"], // Example mapping
]);
controller.use(function (request) {
  if (!pathToInternalMap.has(request.path)) {
    return this.reject(404);
  }
  request.path = pathToInternalMap.get(request.path);
});
```

Http server connected to a database for repository metadata (e.g. web hooks,
public/internal paths, etc.) and user authorization. The database part is
omitted here.

```js
import { createServer } from "http";
import { createMiddleware } from "git-service";
import { resolve } from "path";

// Example models for database
import Users from "./model/user";
import Repositories from "./model/repository";

// Load variables from environment
const origin = resolve(__dirname, process.env.ORIGIN_ENV || "./repos");
const port = parseInt(process.env.PORT, 10) || 3000;

const server = createServer(createMiddleware({
  origin,
  methods: {
    // Check service/user access for repository.
    checkForAccess(request, response) {
      const repository = request.state.repository;
      if (!repository) {
        response.statusCode = 500;
        return false;
      }
      return repository.checkForAccess(response, request.service, request.state.user);
    },
    // Check if repository exists in database.
    async checkIfExists(request, response) {
      const record = await Repositories.findByPublicPath(request.path);
      if (!record) {
        return false;
      }
      if (record.publicPath !== request.path) {
        response.statusCode = 308;
        response.headers.set("Location", record.publicPath);
      }
      request.state.repository = record;
      request.path = record.path;
      return true;
    },
  },
}, (controller) => {
  controller.use((request) => {
    if (!request.service) {
      return controller.reject(request, 400, "Invalid service");
    }
  });
  const GIT_REGEX = /\.git\/?$/;
  controller.onUsable.add((request) => {
    if (!GIT_REGEX.test(request.path)) {
      return controller.reject(request, 400, 'Repository must end with ".git"');
    }
  });
  controller.onUsable.add((request) => {
    if (request.headers.has("Authorization")) {
      const header = request.headers.get("Authorization");
      if (header.startsWith("Basic")) {
        const data = Buffer.from(header.split(" ")[1] || "", "base64")
          .toString("utf8")
          .split(":");
        const username = data.shift();
        const password = data.join(":");
        const user = username && await Users.findOneByUsername(username) || undefined;
        if (user && await user.comparePassword(password)) {
          request.state.user = user;
        }
      }
    }
  });
}));

// Start server
server.listen(port, (err) =>
  err ? console.error(err) : console.log(`listening on port ${port}`));
```

Manual use of controller. (Only `onError` signal is used) It is recommended to use the
`LogicController#serve()` method, but still possible to use the controller manually.

```js
import { createServer, STATUS_CODES } from "http";
import { createController } from "git-service";
import { resolve } from "path";

// Load variables from environment
const origin = resolve(__dirname, process.env.ORIGIN_ENV || "./repos");
const port = parseInt(process.env.PORT, 10) || 3000;

// Create controller and server
const controller = createController(origin);
const server = createServer(async (request, response) => {
  try {
    // Create request (and response)
    const requestData = await controller.create(request, request.header, request.method, request.url);
    // Logic
    if (!await controller.checkIfExists(request)) {
      await controller.reject(request, 404);
    } else if (!await controller.checkForAccess(request)) {
      await controller.reject(request, 401);
    } else if (!await controller.checkIfEnabled(request)) {
      await controller.reject(request, 403);
    } else {
      await controller.accept(request);
    }
    // Get response
    const responseData = requestData.response;
    responseData.headers.forEach((header, value) => response.setHeader(header, value));
    response.statusCode = responseData.statusCode;
    response.statusMessage = responseData.statusMessage;
    await new Promise((resolve, reject) =>
      response.write(responseData.body, (err) => err = reject(err) : resolve()));
  } catch (error) {
    console.error(error);
    if (!response.headersSent) {
      response.statusCode = error && (error.statusCode || error.status) || 500;
      response.statusMessage = STATUS_CODES[response.statusCode];
      response.setHeader("Content-Type", "text/plain");
      response.setHeader("Content-Length", response.statusMessage.length);
      response.write(response.statusMessage, "utf8");
    }
  } finally {
    if (response.writable) {
      await new Promise((resolve, reject) =>
        response.end((err) => err ? reject(err) : resolve()));
    }
  }
});

// Log errors thrown in controller
controller.onError.add((error) => console.error(error));

// Start server
server.listen(port, (err) =>
  err ? console.error(err) : console.log(`listening on port ${port}`));
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
