# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.0.0] - 2018-05-03

## Added

- Better unit tests
- (Empty) Documentation section in readme file.
- Added error codes with each thrown error. All codes can be found in the new
  export `ErrorCodes`.
- Added the following new public functions:
  - `concatPacketBuffers(buffers?, offset?)`
  - `createPacketIterator(buffer, breakAtZeroLength?, breakAtIncompletePackage?)`
  - `readPacketLength(buffer, offset?)`

## Changed

- Updated package description.
- Updated sections "What is this?" and "Usage" in readme file.
- Renamed public export `createPacketInspectorStream` to `createPacketReader`
  and changed return value type from `[stream.Transform, Promise>` to
  `stream.Transform`.

## Fixed

- Returned `stream.Transform` stream from `createPacketReader` was halting on
  final block.

## Removed

- Removed section "Public API" in readme file.
- Removed the following public functions:
  - `createPacketReadableStream(buffers, pauseAtIndex?)`
  - `createPacketIterator(buffers, breakAtIndex?)`

## [1.1.0] - 2018-04-27

### Added

- Added new public function `createPacketIterator(buffers, breakAtIndex?)`.

### Fixed

- Corrected "Constructor" to "Arguments" in the readme file.

## [1.0.0] - 2018-04-05

### Added

- Initial release

[Unreleased]: https://github.com/revam/koa-git-smart-proxy/compare/git-packet-streams-v2.0.0...HEAD
[1.1.0]: https://github.com/revam/koa-git-smart-proxy/compare/git-packet-streams-v1.1.0...git-packet-streams-v2.0.0
[1.1.0]: https://github.com/revam/koa-git-smart-proxy/compare/git-packet-streams-v1.0.0...git-packet-streams-v1.1.0
