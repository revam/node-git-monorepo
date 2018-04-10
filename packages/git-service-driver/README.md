# git-service-driver

Basic git service driver

## Install

```sh
npm install --save git-service-driver
```

## What is this?

This package contains some helpers to create drivers compatible with the
[IServiceDriver](.) interface.

## Related packages

- [git-packet-streams](.)
- [git-service](.)
- [git-service-http](.)
- [git-service-koa](.)

## Usage

**Note:** See git-service for a more complete usage example.

```js
import { Service } from "git-service";
import { createDriver } from "git-service-drivers";

const driver = createDriver("/data/repos");

const service = new Service(driver, ...);
```

## Public API

**List of related apis** (grouped by type):

- `class`
  - [Service](.) ([git-service](.))
- `interface`
  - [IServiceDriver](.) ([git-service](.))

**List of exports** (grouped by type):

- `function`
  - [createDriver](.)
  - [createFileSystemDriver](.)
  - [createHttpDriver](.)
- `interface`
  - [IServiceDriverCache](.)

### **createDriver** (function)

Creates and returns a driver fit for origin. Also see [IServiceDriver](.).

#### Arguments

- `origin`
  \<[String](.)>
  Either an url or a path.

- `cache`
  *[optional]*
  \<[IServiceDriverCache](.)>
  Cache to use with driver.

### **createFileSystemDriver** (function)

Creates a service driver for the filesystem.

#### Arguments

- `origin`
  \<[String](.)>
  A relative or absolute path. Path will be resolved from current working directory if
  relative.

- `cache`
  *[optional]*
  \<[IServiceDriverCache](.)>
  Cache to use with driver.

### **createHttpDriver** (function)

Creates a service driver forwarding to a http(s) server.

#### Arguments

- `origin`
  \<[String](.)>
  An url using the http(s) protocol.

- `cache`
  *[optional]*
  \<[IServiceDriverCache](.)>
  Cache to use with driver.

### **createDriverCache** (function)

Creates an cache for one or more service drivers.

### **IServiceDriverCache** (interface)

Service driver cache interface. Stores responses from IServiceDriver.

#### Methods

- `clear`
  \<[Promise](.)\<[void](.)>>
  Clears all cached data.
- `delete`
  \<[Promise](.)\<[Boolean](.)>>
  Deletes an entry from cache.
  - `key`
    \<[String](.)>
    Entry identifier key.
- `get`
  \<[Promise](.)\<`T`>>
  Gets entry of type `T` from cache if found or provided value if not found.
  - `key`
    \<[String](.)>
    Entry identifier key.
  - `value`
    \<`T`>
    *[optional]*
    Returned if no matching entry is found in cache.
- `has`
  \<[Promise](.)\<[Boolean](.)>>
  Checks if an entry exists in cache.
  - `key`
    \<[String](.)>
    Entry identifier key.
- `set`
  \<[Promise](.)\<[void](.)>>
  Sets value for entry in cache.
  - `key`
    \<[String](.)>
    Entry identifier key.
  - `value`
    \<`T`>
    New entry value.

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
