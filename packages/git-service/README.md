# git-service

Serve git over http(s).

## Prerequirements

This package requires that [git](https://git.kernel.org/pub/scm/git/git.git/) is
installed and available either locally or in the path.

## Install

From npm:

```sh
$ npm install --save git-service
```

From GitHub:

```sh
$ npm install --save https://github.com/revam/node-git-monorepo/releases/download/git-service/v$VERSION/package.tgz
```

From git.lan (internet-people can ignore this):

```sh
$ npm install --save https://git.lan/mist@node/git@git-service/v$VERSION/package.tgz
```

## What is this?

It is meant as an substitude for server-side git hooks implemented in
typescript. This allows for more dynamic controll of requests as opposed to a
static hook, in my opinion, as it allows an application to controll any and all
syncronization between the itself and its clients.

It exports some high-level and some low-level functions, some interfaces and some
classes used as part of the logic. It is reccomended to use the high-level
functions and interfaces, unless your requirements require some low-level
changes than cannot be implemented at a high-level.

It is adviced to see the source-code for a full list of exports, or the usage
examples below, as the documentation is not available yet.

### Motivation for this library

As I was not familiar with git hooks, and wanted control over what goes in and
out of my local git server, I set out to create a library to handle the git-
functionality of a http git server.

I am not a fan of events used in a middleware-driven workflow, as it breaks the
pattern, so I made this library which, in my eyes, is better suited in a
middleware-driven workflow. I also wanted it to be framework independent, so it
can adapt to any framework you want to use.

It's a side-project, so expect irregular updates, if you plan to use it in any
of your projects. [Below](#simular-projects) you can find some simular projects
with different approches to this , and in which
helped me greatly when creating this library.

Also a great help was the technical documentation for git, which can be found
[here](https://git.kernel.org/pub/scm/git/git.git/tree/Documentation/technical),
among other places (such at github).

### Simular projects

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
    request.service || "<unknown>",
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
  ["test-1.git", "test-2.git"], // Example mapping
  ]);
controller.use(function (request) {
  if (redirects.has(request.path)) {
    return this.redirect(redirects.get(request.path));
  }
});

// Map public path to internal path or reject with 404.
const pathToInternalMap = new Map([
  ["root/git.git", "5b/9d/ee4cc4e8af2864e2f34c"], // Example mapping
]);
controller.use(function (request) {
  if (!pathToInternalMap.has(request.path)) {
    return this.reject(404);
  }
  request.path = pathToInternalMap.get(request.path);
});
```

Http server connected to a database for repository metadata (e.g. web hooks,
public/internal paths, etc.) and user authorization. The database/models part is
omitted here.

**Note:** For simplicity's sake do all functions run in sync.

```js
import { createServer } from "http";
import { createMiddleware, ServiceType } from "git-service";
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
    // Check if user (logged-in or anonymus) has access to service at repository.
    checkForAccess(request, response) {
      const repository = request.state.repository;
      if (!repository) {
        throw new Error("Repository missing from request state");
      }
      // Check for access
      if (checkForAccess(repository, request.service, user)) {
        return true;
      }
      if (user) {
        // Repository is forbidden for user.
        response.statusCode = 403;
      } else {
        // Unauthorized atempt for a retricted repository
        response.headers.set("WWW-Authenticate", "Basic");
        response.statusCode = 401;
      }
      return false;
    },
    // Check if repository is enabled.
    checkIfEnabled(request, response) {
      const repository = request.state.repository;
      if (!repository) {
        throw new Error("Repository missing from request state");
      }
      // Reject if repository is archived and the requested service is receive-pack.
      if (repository.isArchived && request.service === ServiceType.ReceivePack) {
        response.addMessage("Repository is archived and will not accept any new changes.");
        return false;
      }
      return true;
    },
    // Check if repository exists in database (and on disk).
    checkIfExists(request, response) {
      // Find the first match that is NOT marked as deleted.
      const record = Repositories.findOne({ href: request.path, isDeleted: false });
      // We check for redirects when no repository was found.
      if (!record) {
        const redirect = Repositories.checkForRedirect(request.path);
        if (redirect) {
          request.response.statusCode = 308;
          request.response.headers.set("Location", redirect);
        }
        return false;
      }
      request.state.repository = record;
      request.path = repository.path;
      return true;
    },
  },
}, (controller) => {
  // Basic guards (combined from above snippets) (with cache control)
  const GIT_REGEX = /\.git$/;
  const METHODS = new Set(["HEAD", "GET", "POST"]);
  controller.use(function (request, response) {
    // Reject unsupported methods for this server.
    if (!METHODS.has(request.method)) {
      return this.reject(501);
    }
    // Browsers like to ask servers for favicons. We don't like to repeat
    // ourself very often.
    if (request.url === "/favicon.ico") {
      response.headers.set("Cache-Control", "public, max-age=31536000");
      return this.reject(404);
    }
    // But always ask us for the latest version of everything other then a fav-
    // icon.
    response.headers.set("Cache-Control", "no-cache, no-store");
    // Reject if no service has been set for request. A typical invalid service.
    if (!request.service) {
      return this.reject(400, "Invalid Service");
    }
    if (!GIT_REGEX.test(request.path!)) {
      return this.reject(400, 'Repository must end with ".git"');
    }
    // The hrefs in the database does not contain ".git" at the end, but this
    // basic server only has the logic for the git clients, hench the above
    // guard and this slicing.
    request.path = request.path!.slice(0, -4);
  });
  // Authenticate users
  controller.onUsable.add((request) => {
    if (request.headers.has("Authorization")) {
      const header = request.headers.get("Authorization");
      if (header.startsWith("Basic")) {
        const data = Buffer.from(header.split(" ")[1] || "", "base64")
          .toString("utf8")
          .split(":");
        const username = data.shift();
        const password = data.join(":");
        const user = username && Users.findOneByUsername(username) || undefined;
        if (user && user.comparePassword(password)) {
          request.state.user = user;
        }
      }
    }
  });
}));

function checkRepositoryForAccess(repository, service, user) {
  // A user can have special access rights
  if (user) {
    // Hard-code repository owner access rights.
    if (repository.ownerId === user.id) {
      return true;
    }
    // Check for an entry for user
    const entry = findUserAccessLevel(repository, user);
    if (entry) {
      if (service === ServiceType.ReceivePack) {
        return entry.canPush;
      }
      return entry.canFetchOrView;
    }
  }
  // Check if service is upload-pack and repository is public.
  return service === ServiceType.UploadPack && repository.isPublic;
}

// For simplicity's sake are the levels a part of the repository model.
function findUserAccessLevel(repository, user) {
  return repository.accessLevelEntries.find((e) => e.userId === user.id);
}

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

## Documentation

The documentation is not available as of yet, but if you use TypeScript, the
definitions are available with some (short) descriptions. There are also some
examples below for how you could use this library.

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
