import { ChildProcess, spawn } from "child_process";
import fetch, { Headers } from "node-fetch";
import { join, normalize, resolve } from "path";
import { PassThrough, Readable, Transform, Writable } from "stream";
import { IServiceAcceptData, IServiceDriver, ServiceError } from ".";
import { ServiceErrorCode, SymbolSource } from "./constants";
import { FuseOutput } from "./transform";

export function isDriver(driver: any): boolean {
  return 'origin' in driver && typeof driver.origin === 'string' &&
         'access' in driver && typeof driver.access === 'function' &&
         'exists' in driver && typeof driver.exists === 'function' &&
         'empty' in driver && typeof driver.empty === 'function' &&
         'init' in driver && typeof driver.init === 'function' &&
         'hint' in driver && typeof driver.hint === 'function' &&
         'get' in driver && typeof driver.get === 'function';
}

export function createDriver(origin: string = './repos'): IServiceDriver {
  if (/https?:\/\//.test(origin)) {
    return createHttpDriver(origin);
  } else {
    if (/file:\/\//.test(origin)) {
      origin = origin.slice(7);
    }
    origin = resolve(normalize(origin));
    return createLocalDriver(origin);
  }
}

export function createLocalDriver(origin: string): IServiceDriver {
  return {
    get origin() { return origin; },
    access(repository, hint) { return accessLocal(origin, repository, hint); },
    empty(repository) { return empty(origin, repository); },
    exists(repository) { return exists(origin, repository); },
    get(repository, hint, headers, input?, messages?) {
      return getLocal(origin, repository, hint, input, messages);
    },
    hint(...hints) { return hintLocal(...hints); },
    init(repository) { return Promise.resolve(false); },
  };
}

export function createHttpDriver(origin: string): IServiceDriver {
  return {
    get origin() { return origin; },
    access(repository, hint) { return accessHttp(origin, repository, hint); },
    empty(repository) { return empty(origin, repository); },
    exists(repository) { return exists(origin, repository); },
    get(repository, hint, headers, input?, messages?) {
      return getHttp(origin, repository, hint, headers, input, messages);
    },
    hint(...hints) { return hintHttp(...hints); },
    init(repository) { return Promise.resolve(false); },
  };
}

function hintLocal(...hints: string[]): string {
  return hints[1];
}

function hintHttp(...hints: string[]): string {
  return hints[0];
}

async function exists(origin: string, repository: string): Promise<boolean> {
  const exitCode = await lsRemote(origin, repository);

  return exitCode === 0;
}

async function empty(origin: string, repository: string): Promise<boolean> {
  const exitCode = await lsRemote(origin, repository);

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

  const cwd = `${origin}/${repository}`;
  const args = [command, '--strict', input ? '--stateless-rpc' : '--advertise-refs', '.'];
  const child = spawn('git', args, {cwd});

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

  const body = stdout.pipe(new FuseOutput(input ? messages : [service_headers[command]]), {end: true});

  await new Promise((a) => body.on('finish', a));
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

  const {status, headers: out_headers, body: output} = await fetch(
    url,
    input ? {method: 'POST', body: input, headers: in_headers} : {headers: in_headers},
  );

  // Only append messages if result was OK
  const body = status === 200 ? output.pipe(new FuseOutput(input ? messages : undefined)) : output as Readable;
  if (body instanceof FuseOutput) {
    await new Promise((a) => body.once('finish', a));
    out_headers.set('Content-Length', body.byteLength.toString());
  }

  return { body, headers: out_headers, status };
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
    new Promise<Readable>((a, r) => {
      const passthrough = child.stdout.pipe(new PassThrough());
      once(child.stderr, 'close', () => a(passthrough));
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
  stdout: Readable;
  stderr: string;
}
