import { ChildProcess, spawn } from "child_process";
import fetch, { Headers } from "node-fetch";
import { join, normalize, resolve } from "path";
import { Readable } from "stream";
import { IServiceAcceptData, IServiceDriver, IServiceDriverCache, ServiceError } from ".";
import { ServiceErrorCode, SymbolSource } from "./constants";
import { ParseOutput } from "./transform";

export function isDriver(driver: any): boolean {
  return 'origin' in driver && typeof driver.origin === 'string' &&
         'access' in driver && typeof driver.access === 'function' &&
         'exists' in driver && typeof driver.exists === 'function' &&
         'empty' in driver && typeof driver.empty === 'function' &&
         'init' in driver && typeof driver.init === 'function' &&
         'hint' in driver && typeof driver.hint === 'function' &&
         'get' in driver && typeof driver.get === 'function';
}

export function createDriver(origin: string = './repos', cache?: IServiceDriverCache): IServiceDriver {
  if (/https?:\/\//.test(origin)) {
    return createHttpDriver(origin, cache);
  } else {
    if (/file:\/\//.test(origin)) {
      origin = origin.slice(7);
    }
    origin = resolve(normalize(origin));
    return createLocalDriver(origin, cache);
  }
}

export function createLocalDriver(origin: string, cache?: IServiceDriverCache): IServiceDriver {
  return {
    get cache() { return cache; },
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
    get cache() { return cache; },
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
    clear() { return map.clear(); },
    delete(...args) { return map.delete(args.join(';')); },
    has(...args) { return map.has(args.join(';')); },
    get(...args) { return map.get(args.join(';')); },
    set(c, o, r, v) { return map.set(`${c};${o};${r}`, v); },
  };
}

function hintLocal(...hints: string[]): string {
  return hints[1];
}

function hintHttp(...hints: string[]): string {
  return hints[0];
}

async function exists(cache: IServiceDriverCache, origin: string, repository: string): Promise<boolean> {
  if (cache && cache.has('exists', origin, repository)) {
    return cache.get('exists', origin, repository);
  }

  const exitCode = await lsRemote(origin, repository);
  if (cache) {
    cache.set('exists', origin, repository, exitCode);
  }

  return exitCode === 0 || exitCode === 2;
}

async function empty(cache: IServiceDriverCache, origin: string, repository: string): Promise<boolean> {
  if (cache && cache.has('exists', origin, repository)) {
    return cache.get('exists', origin, repository);
  }

  const exitCode = await lsRemote(origin, repository);
  if (cache) {
    cache.set('exists', origin, repository, exitCode);
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
                        input?: Readable, messages?: Buffer[]): Promise<IServiceAcceptData> {
  const headers = new Headers();

  const fullpath = `${origin}/${repository}`;
  const child = spawn('git', [command, input ? '--stateless-rpc' : '--advertise-refs', fullpath]);

  if (input) {
    input.pipe(child.stdin);
  }

  const {exitCode, stdout, stderr} = await exec(child);

  if (exitCode !== 0) {
    throw new ServiceError({
      errorCode: map_error(stderr),
      message: 'Failed to execute git',
    });
  }

  const body = input ? new ParseOutput([stdout, ...messages]) : new ParseOutput([service_headers[command], stdout], 1);
  headers.set('Content-Type', `application/x-git-${command}-${input ? 'result' : 'advertisement'}`);
  headers.set('Content-Length', body.byteLength.toString());
  return {status: 200, headers, body};
}

async function getHttp(origin: string, repository: string, path: string, in_headers: Headers,
                       input?: Readable, messages?: Buffer[]): Promise<IServiceAcceptData> {
  const url = `${origin}/${repository}/${path}`;

  // Ensure we have no encoding from backend
  in_headers.delete('Accept-Encoding');
  in_headers.set('Accept-Encoding', 'identity');

  const response = await fetch(url, input ? {method: 'POST', body: input, headers: in_headers} : {headers: in_headers});

  let body: any;
  if (response.status === 200) {
    const output = await response.buffer();
    if (messages && messages.length) {
      body = new ParseOutput([output, ...messages]);
      response.headers.set('Content-Length', body.byteLength.toString());
    } else {
      body = new ParseOutput([output]);
    }
  } else {
    body = response.body;
  }

  return { body, headers: response.headers, status: response.status };
}

function map_error(stderr: string): ServiceErrorCode {
  return ServiceErrorCode.UnknownError;
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
