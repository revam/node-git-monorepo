# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Added a new class `PacketReader` with two (extra) events `packet-read` and
  `packet-done`. The exported function `createPacketReader` is kept for
  backwards-cabability, but should not be used.

### Changed

- Made the `fn` argument of `createPacketReader` optional. But it still throws
  if supplied with anything other than a function or `undefined`.

- Production builds no longer contain source maps at all.

- Development builds now contain source maps for code and declaration files.

- More stricter linting for both source and tests. Also cleaned some of the code
  outside the errors and warnings thrown from the stricter rules.

### Fixed

- Wrong headline size in changelog for some previous verions.

- `concatPacketBuffers` was not passing its defined tests. Corrected code so it
  passes all valid tests.

## [2.0.2] - 2018-05-27

### Fixed

- When uploading (git push), the reader failed because it tried to read the PACK
  data. It should have stopped before, and it does now.

## [2.0.1] - 2018-05-03

### Fixed

- Fix version compare links in changelog

## [2.0.0] - 2018-05-03

### Added

- Better unit tests
- (Empty) Documentation section in readme file.
- Added error codes with each thrown error. All codes can be found in the new
  export `ErrorCodes`.
- Added the following new public functions:
  - `concatPacketBuffers(buffers?, offset?)`
  - `createPacketIterator(buffer, breakAtZeroLength?, breakAtIncompletePackage?)`
  - `readPacketLength(buffer, offset?)`

### Changed

- Updated package description.
- Updated sections "What is this?" and "Usage" in readme file.
- Renamed public export `createPacketInspectorStream` to `createPacketReader`
  and changed return value type from `[stream.Transform, Promise>` to
  `stream.Transform`.

### Fixed

- Returned `stream.Transform` stream from `createPacketReader` was halting on
  final block.

### Removed

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

[Unreleased]: https://github.com/revam/node-git-monorepo/compare/git-packet-streams-v2.0.2...HEAD
[2.0.2]: https://github.com/revam/node-git-monorepo/compare/git-packet-streams-v2.0.1...git-packet-streams-v2.0.2
[2.0.1]: https://github.com/revam/node-git-monorepo/compare/git-packet-streams-v2.0.0...git-packet-streams-v2.0.1
[2.0.0]: https://github.com/revam/node-git-monorepo/compare/git-packet-streams-v1.1.0...git-packet-streams-v2.0.0
[1.1.0]: https://github.com/revam/node-git-monorepo/compare/git-packet-streams-v1.0.0...git-packet-streams-v1.1.0
