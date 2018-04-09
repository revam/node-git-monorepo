import { ChildProcess, spawn } from "child_process";
import { createPacketReadableStream } from "git-packet-streams";
import { IServiceDriver, ISignalAcceptData } from "git-service";
import fetch, { Headers } from "node-fetch";
import { join, normalize, resolve } from "path";
import { Readable } from "stream";

/**
 * Service driver cache interface. Stores responses from IServiceDriver.
 */
export interface IServiceDriverCache {
  /**
   * Clears all cached data.
   */
  clear(): Promise<void>;
  /**
   * Deletes an entry from cache.
   */
  delete(key: string): Promise<boolean>;
  /**
   * Gets an entry from cache.
   */
  get<T>(key: string, value?: T): Promise<T>;
  /**
   * Checks if a valid entry exists in cache.
   */
  has(key: string): Promise<boolean>;
  /**
   * Sets value for entry in cache.
   */
  set<T>(key: string, value: T, expireTimeout?: number): Promise<void>;
}

export function createDriver(origin: string = './repos', cache?: IServiceDriverCache): IServiceDriver {
  if (/https?:\/\//.test(origin)) {
    return createHttpDriver(origin, cache);
  } else {
    if (/file:\/\//.test(origin)) {
      origin = origin.slice(7);
    }
    origin = resolve(normalize(origin));
    return createFileSystemDriver(origin, cache);
  }
}

export function createFileSystemDriver(origin: string, cache?: IServiceDriverCache): IServiceDriver {
  return {
    get origin() { return origin; },
    access(repository, hint) { return accessLocal(origin, repository, hint); },
    empty(repository) { return empty(cache, origin, repository); },
    exists(repository) { return exists(cache, origin, repository); },
    get(repository, hint, headers, input?, messages?) {
      return getLocal(origin, repository, hint, input, messages);
    },
    hint(...hints) { return hintLocal(...hints); },
    init(repository) { return Promise.resolve(false); },
  };
}

export function createHttpDriver(origin: string, cache?: IServiceDriverCache): IServiceDriver {
  return {
    get origin() { return origin; },
    access(repository, hint) { return accessHttp(origin, repository, hint); },
    empty(repository) { return empty(cache, origin, repository); },
    exists(repository) { return exists(cache, origin, repository); },
    get(repository, hint, headers, input?, messages?) {
      return getHttp(origin, repository, hint, headers, input, messages);
    },
    hint(...hints) { return hintHttp(...hints); },
    init(repository) { return Promise.resolve(false); },
  };
}

export function createDriverCache(): IServiceDriverCache {
  const map = new Map<string, any>();
  return {
    async clear() { return map.clear(); },
    async delete(key) { return map.delete(key); },
    async has(key) { return map.has(key); },
    async get(key) { return map.get(key); },
    async set(key, value) { map.set(key, value); },
  };
}

function hintLocal(...hints: string[]): string {
  return hints[1];
}

function hintHttp(...hints: string[]): string {
  return hints[0];
}

async function exists(cache: IServiceDriverCache, origin: string, repository: string): Promise<boolean> {
  const key = `${origin};${repository};exists`;
  if (cache && cache.has(key)) {
    return cache.get<boolean>(key);
  }

  const exitCode = await lsRemote(origin, repository);
  if (cache) {
    cache.set(key, exitCode);
  }

  return exitCode === 0 || exitCode === 2;
}

async function empty(cache: IServiceDriverCache, origin: string, repository: string): Promise<boolean> {
  const key = `${origin};${repository};exists`;
  if (cache && cache.has(key)) {
    return cache.get<boolean>(key);
  }

  const exitCode = await lsRemote(origin, repository);
  if (cache) {
    cache.set(key, exitCode);
  }

  return exitCode === 2;
}

async function lsRemote(origin: string, repository: string): Promise<number> {
  // disallow anchestor paths
  if (/\.\.?(\/\\)/.test(repository)) {
    return 128;
  }
  const fullpath = join(origin, repository);
  const child = spawn('git', ['ls-remote', '--exit-code', fullpath, 'HEAD'], {stdio: ['ignore', null, null]});
  const {exitCode} = await exec(child);

  return exitCode;
}

async function accessLocal(origin: string, repository: string, command: string): Promise<boolean> {
  return true;
}

async function accessHttp(origin: string, repository: string, fragment: string): Promise<boolean> {
  return true;
}

const service_headers = {
  'receive-pack': Buffer.from('001f# service=git-receive-pack\n0000'),
  'upload-pack': Buffer.from('001e# service=git-upload-pack\n0000'),
};

async function getLocal(origin: string, repository: string, command: string,
                        input?: Readable, messages?: Buffer[]): Promise<ISignalAcceptData> {
  const headers = new Headers();

  const fullpath = `${origin}/${repository}`;
  const child = spawn('git', [command, input ? '--stateless-rpc' : '--advertise-refs', fullpath]);

  if (input) {
    input.pipe(child.stdin);
  }

  const {exitCode, stdout, stderr} = await exec(child);

  if (exitCode !== 0) {
    throw new Error('Failed to execute git');
  }

  const packets = input ? [stdout, ...messages] : [service_headers[command], stdout];
  const body = createPacketReadableStream(packets, input ? 0 : 1);
  headers.set('Content-Type', `application/x-git-${command}-${input ? 'result' : 'advertisement'}`);
  headers.set('Content-Length', count_bytes(packets).toString());
  return {status: 200, headers, body};
}

async function getHttp(origin: string, repository: string, path: string, in_headers: Headers,
                       input?: Readable, messages?: Buffer[]): Promise<ISignalAcceptData> {
  const url = `${origin}/${repository}/${path}`;

  // Ensure we have no encoding from backend
  in_headers.delete('Accept-Encoding');
  in_headers.set('Accept-Encoding', 'identity');

  const response = await fetch(url, input ? {method: 'POST', body: input, headers: in_headers} : {headers: in_headers});

  let body: Readable = response.body as Readable;
  if (input && response.status === 200 && messages && messages.length) {
      const packets = [await response.buffer(), ...messages];
      body = createPacketReadableStream(packets, 0);
      response.headers.set('Content-Length', count_bytes(packets).toString());
  }

  return { body, headers: response.headers, status: response.status };
}

function count_bytes(buffers: Buffer[]) {
  return buffers.reduce((p, c) => p + c.length, 0);
}

// Taken and modified from
// https://github.com/Microsoft/vscode/blob/2288e7cecd10bfaa491f6e04faf0f45ffa6adfc3/extensions/git/src/git.ts
// Copyright (c) 2017-2018 Microsoft Corporation. MIT License
async function exec(child: ChildProcess): Promise<IExecutionResult> {
  const disposables: Array<() => void> = [];

  const once = (ee: NodeJS.EventEmitter, name: string, fn: (...args: any[]) => void) => {
    ee.once(name, fn);
    disposables.push(() => ee.removeListener(name, fn));
  };

  const on = (ee: NodeJS.EventEmitter, name: string, fn: (...args: any[]) => void) => {
    ee.on(name, fn);
    disposables.push(() => ee.removeListener(name, fn));
  };

  const result = Promise.all([
    new Promise<number>((a, r) => {
      once(child, 'error', r);
      once(child, 'exit', a);
    }),
    new Promise<Buffer>((a) => {
      const buffers: Buffer[] = [];
      on(child.stdout, 'data', (b: Buffer) => buffers.push(b));
      once(child.stdout, 'close', () => a(Buffer.concat(buffers)));
    }),
    new Promise<string>((a) => {
      const buffers: Buffer[] = [];
      on(child.stderr, 'data', (b: Buffer) => buffers.push(b));
      once(child.stderr, 'close', () => a(Buffer.concat(buffers).toString('utf8')));
    }),
  ]);

  try {
    const [exitCode, stdout, stderr] = await result;

    return { exitCode, stdout, stderr };
  } finally {
    disposables.forEach((d) => d());
  }
}

interface IExecutionResult {
  exitCode: number;
  stdout: Buffer;
  stderr: string;
}
