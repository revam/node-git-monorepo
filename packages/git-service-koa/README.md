# git-service-koa

Git service middleware for koa

## Install

### From npm

```sh
$ npm install --save git-service-koa
```

### From GitHub

### Spesific release:

```sh
$ npm install --save https://github.com/revam/node-git-monorepo/releases/download/git-service-koa/v$VERSION/package.tgz
```

### From git.lan

Internet people can ignore this.

#### Latest release:

```sh
$ npm install --save http://git.lan/mist@node/git@git-service-koa/latest/npm-pack.tgz
```

#### Spesific release:

```sh
$ npm install --save http://git.lan/mist@node/git@git-service-koa/v$VERSION/npm-pack.tgz
```

## What is this?

This package contains a middleware for using
[git-service](https://npmjs.com/package/git-service) with
[koa](https://npmjs.com/package/koa).

## Usage

Bare example.

```js
import createKoaMiddleware from "git-service-koa";
import koa from "koa";
import { resolve } from "path";

// Load variables from environment
const origin = resolve(process.env.REPOSITORY_ROOT || "./repositories");
const port = parseInt(process.env.NODE_PORT || "", 10) || 3000;

// Create application and attach middleware
const app = new koa();
app.use(createKoaMiddleware(origin));

// Start server
app.listen(port, (err)
  => err ? console.error(err) ? console.log("Listening on port %s", port));
```

Extended example. Requires node v10.x or newer (for the regex matching).

**Note:** You need to implement the models first for it to work.

```js
import createKoaMiddleware from "git-service-koa";
import koa from "koa";
import { resolve } from "path";

// Example models
import Bucket from "./models/Bucket";
import Project from "./models/Project";
import User from "./models/User";

// Load variables from environment
const origin = resolve(process.env.REPOSITORY_ROOT || "./repositories");
const port = parseInt(process.env.NODE_PORT || "", 10) || 3000;
const regex = /^\/(?<bucket>[\w\d\-_]{2,}[^\.\/]*)\/(?<project>[\w\d\-_]+[^\.\/]*)\.git(?<path>\/?|\/.+)?$/;

const middleware = createKoaMiddleware({
  methods: {
    checkForAccess(request, response) {
      const project = request.state.project;
      if (!project) {
        throw new Error("Project info missing when checking for access");
      }
      // Authenticate user
      const header = request.headers.get("Authorization");
      let user;
      if (header && header.startsWith("Basic ")) {
        const data = Buffer.from(header.split(" ")[1] || "", "base64").toString("utf8").split(":");
        const username = data.shift();
        const password = data.join(":");
        const user1 = username && User.findByUsername(username) || undefined;
        if (user && user.comparePassword(password)) {
          user = user1;
        }
      }
      // Check access rights per service type and user permissions
      if (project.checkForAccess(request.service, user)) {
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
    checkIfEnabled(request) {
      const project = request.state.project;
      if (!project) {
        throw new Error("Project info missing when checking if enabled");
      }
      return project.checkIfEnabled(request.service);
    },
    checkIfExists(request, response) {
      const result = regex.exec(request.url);
      if (result) {
        const path = result.groups.path && result.groups.path || "/";
        const bucketPath = result.groups.bucket;
        const projectPath = result.groups.project;
        // Redirect to project homepage if path is empty.
        if (path === "/") {
          response.statusCode = 308;
          response.headers.set("Location", `/${bucketPath}/${projectPath}`);
        }
        else if (request.service) {
          // Try to find bucket
          const bucket = Bucket.findByPath(bucketPath);
          if (bucket && !bucket.isHidden) {
            // Try to find project directly from bucket
            const project = bucket.findProject(projectPath);
            if (project && !project.isHidden) {
              // Set project and path
              request.state.project = project;
              request.path = project.gitPath;
              return true;
            }
            // Try to find project through redirect from bucket
            const redirected = bucket.findProjectThroughRedirect(projectPath);
            if (redirected) {
              response.statusCode = 308;
              response.headers.set("Location", `${redirected.publicPath}.git`);
            }
          }
        }
      }
      return false;
    },
  }
  origin,
});

// Create application and attach middleware
const app = new koa();
app.use(middleware);

// All other routes
app.use((ctx) => ctx.body = "Hello World!");

// Start server
app.listen(port, (err)
  => err ? console.error(err) ? console.log("Listening on port %s", port));
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
