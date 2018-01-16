// from packages
import { ok } from 'assert';
import { spawn } from 'child_process';
import * as intoStream from 'into-stream';
import { resolve } from 'path';
import { Readable, Writable } from 'stream';
import { directory } from 'tempy';
import * as through from 'through';
import { promisify } from 'util';
// from libraries
import {
  exists,
  GitBasePack,
  GitCommand,
  Headers,
  ReceivePack,
  UploadPack,
} from '../src';
import { create_bare_repo, create_non_repo, create_repo } from './helpers';

interface CreateSourceOptions {
  command?: GitCommand;
  input?: Writable;
  output?: Readable;
  messages?: Iterable<string> | IterableIterator<string>;
  has_input: boolean;
  Pack: typeof GitBasePack;
}

const git_command = (r, c, a = []) => spawn('git', [c, ...a, '.'], {cwd: r});

function create_command(input?: Writable, output?: Readable): GitCommand {
  if (!(output && output.readable)) {
    output = through();
  }

  if (!(input && input.writable)) {
    input = through();
  }

  const stderr = through();

  return (c, r, a) => ({stdout: output, stdin: input, stderr});
}

function create_source({command, input, output, messages, has_input, Pack}: CreateSourceOptions) {
  if (!command) {
    command = create_command(input, output);
  }

  const source = new Pack({
    command,
    has_input,
  });

  // Append verbose messages
  if (messages) {
    source.verbose(messages);
  }

  return source;
}

describe('GitBasePack', () => {
  it('should advertise when no input is supplied', async(done) => {
    const test_buffer = Buffer.from('test buffer');

    // Test both services
    for (const service of Reflect.ownKeys(Headers)) {
      const results = [
        Headers[service],
        test_buffer,
      ];
      const output = intoStream(test_buffer);

      const source = create_source({
        Pack: GitBasePack,
        has_input: false,
        output,
      });

      // @ts-ignore
      source.service = service;

      await source.process_input();
      await source.accept('');

      await new Promise((next) => {
        source.pipe(through(
          (b) => ok(results.shift().equals(b), 'should be equal'),
          next,
        ));
      });
    }

    done();
  });

  it('should be able to check if given repo is a valid one.', async(done) => {
    // Create temp folder
    const repos = directory();

    // Test case 1: Non repo
    const test1 = resolve(repos, 'test1');

    await create_non_repo(test1);

    ok(!await exists(git_command, test1), 'should not exist');

    // Test case 2: Non-init. repo
    const test2 = resolve(repos, 'test2');

    await create_repo(test2);

    ok(await exists(git_command, test2), 'should exist, though no log');

    // Test case 3: Init. repo with commit
    const test3 = resolve(repos, 'test3');

    await create_bare_repo(test3);

    ok(await exists(git_command, test3), 'should exist');

    done();
  }, 10000);

  it('should be able to add verbose messages to output', async(done) => {
    done();
  });
});

describe('UploadPack', () => {
  it('should understand valid requests to git-upload-pack service', async(done) => {
    // Random
    const input = intoStream([
      '0032want 0a53e9ddeaddad63ad106860237bbf53411d11a7\n',
      '0032want d049f6c27a2244e12041955e262a404c7faba355\n',
      '0032have 441b40d833fdfa93eb2908e52742248faf0ee993\n',
      '0032have 2cb58b79488a98d2721cea644875a8dd0026b115\n',
      '0000',
    ]) as Readable;

    const source = create_source({
      Pack: UploadPack,
      has_input: true,
    });

    input.pipe(source);

    ok(source, 'should now have a source');

    await source.process_input();

    // Should have successfully parsed all want,
    expect(source.metadata.want).toMatchObject([
      '0a53e9ddeaddad63ad106860237bbf53411d11a7',
      'd049f6c27a2244e12041955e262a404c7faba355',
    ]);

    // and have.
    expect(source.metadata.have).toMatchObject([
      '441b40d833fdfa93eb2908e52742248faf0ee993',
      '2cb58b79488a98d2721cea644875a8dd0026b115',
    ]);

    done();
  });
});

describe('ReceivePack', () => {
  const results = [
    // tslint:disable-next-line
    '00760a53e9ddeaddad63ad106860237bbf53411d11a7 441b40d833fdfa93eb2908e52742248faf0ee993 refs/heads/maint\0 report-status\n',
    '0000',
    '\nPACK....',
  ];

  it('should understand valid requests to git-receive-pack service', async(done) => {
    const input = intoStream(results) as Readable;

    const source = create_source({
      Pack: ReceivePack,
      has_input: true,
    });

    input.pipe(source);

    ok(source, 'should now have a source');

    await source.process_input();

    expect(source.metadata.ref.path).toBe('refs/heads/maint');
    expect(source.metadata.ref.name).toBe('maint');
    expect(source.metadata.ref.type).toBe('heads');
    expect(source.metadata.old_commit).toBe('0a53e9ddeaddad63ad106860237bbf53411d11a7');
    expect(source.metadata.new_commit).toBe('441b40d833fdfa93eb2908e52742248faf0ee993');
    expect(source.metadata.capabilities).toMatchObject(['report-status']);

    done();
  });

  it('should pipe all data, both parsed and unparsed', async(done) => {
    const input = intoStream(results) as Readable;

    const r = results.map((s) => Buffer.from(s));
    const throughput = through(
      (b) => ok(r.shift().equals(b), 'should be equal'),
      done,
    );

    const source = create_source({
      Pack: ReceivePack,
      has_input: true,
      input: throughput,
    });

    input.pipe(source);

    ok(source, 'should now have a source');

    await source.process_input();

    await source.accept('');
  });
});

describe('Seperator', () => {
  it('should seperate a normal input buffer', async(done) => {
    done();
  });

  it('should combine with next buffer when missing data (underflow)', async(done) => {
    done();
  });

  it('should cut the rest of current buffer when no match can be made (overflow)', async(done) => {
    done();
  });
});

describe('match', () => {
  it('should provide basic info for request', async(done) => {
    done();
  });
});
