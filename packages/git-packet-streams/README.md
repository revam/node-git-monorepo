# git-packet-streams

Helper streams for to work with the git packet format

## Install

```sh
npm install --save git-packet-streams
```

## What is this?

This package contains two helper functions to work with buffered (git) packet streams.

## Related packages

- [git-service](.)
- [git-service-driver](.)
- [git-service-http](.)
- [git-service-koa](.)

## Usage

```js
import { createPacketInspectStream, createPacketReadableStream } from "git-packet-streams";

console.log("inspecting");
const readable = createPacketReadableStream([Buffer.from("0008test00000007abc")]);
const [inspect, promise] = createPacketInspectStream((buffer) => console.log(buffer.toString("utf8", 4));
readable.pipe(inspect);
promise.then(() => console.log("done inspecting"));
```

## Public API

**Exports list:**

- [createPacketInspectStream](.)
- [createPacketReadableStream](.)
- [createPacketIterator](.)

### **createPacketInspectStream** (function)

Creates a duplex passthrough stream that inspects each packet passing through.
Returns both the stream and a promise resolving when the first packet load is
inspected.

**Note:** The stream will throw erros if it receives incomplete packets.

#### Arguments

- `forEach`
  \<[Function](.)>
  A function accepting iterating over each buffered packet in stream.

#### Return value

- \<\[ [Transform](.), [Promise](.)\<void> \]>
  A stream and a promise.

### **createPacketReadableStream** (function)

Creates a readable stream consistent of all packets provided as part of `buffers`.

**Note:** The stream will throw erros if it receives incomplete packets.

#### Arguments

- `buffers`
  \<[Array](.)\<[Buffer](.)>>
  Packet buffers. Packets may be chunked over multiple buffers.
- `pauseBufferIndex`
  \<[Number](.)>
  Optional index to break at, and resume when rest of buffers are consumed.

### **createPacketIterator** (function)

Creates an iterator yielding packets from multiple buffers.

#### Arguments

- `buffers`
  \<[Array](.)\<[Buffer](.)>>
  Packet buffers. Packets may be chunked over multiple buffers.
- `pauseBufferIndex`
  \<[Number](.)>
  Optional index to break at, and resume when rest of buffers are consumed.

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
