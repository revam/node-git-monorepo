// from packages
import { spawn } from 'child_process';
import * as fs from "fs";
import { join } from 'path';
import { promisify } from 'util';

const appendFile = promisify(fs.appendFile);
const exists = promisify(fs.exists);
const mkdir = promisify(fs.mkdir);

export async function create_repo(path: string) {
  // Create directory
  await mkdir(path);

  // Init normal repo
  await new Promise((done, reject) => {
    const {stderr} = spawn('git', ['init'], {cwd: path});

    stderr.once('data', (chunk) => {
      stderr.removeListener('end', done);
      reject(chunk.toString());
    });

    stderr.once('end', done);
  });

  // Create an empty README.md
  await appendFile(join(path, 'README.md'), '');

  // Add files
  await new Promise((done, reject) => {
    const {stderr} = spawn('git', ['add', '.'], {cwd: path});

    stderr.once('data', (chunk) => {
      stderr.removeListener('end', done);
      reject(chunk.toString());
    });

    stderr.once('end', done);
  });

  // Commit
  await new Promise((done, reject) => {
    const {stderr} = spawn('git', ['commit', '-m', 'Initial commit'], {cwd: path});

    stderr.once('data', (chunk) => {
      stderr.removeListener('end', done);
      reject(chunk.toString());
    });

    stderr.once('end', done);
  });
}

export async function create_bare_repo(path: string) {
  // Create directory
  await mkdir(path);

  // Init bare repo
  await new Promise((done, reject) => {
    const {stderr} = spawn('git', ['init', '--bare'], {cwd: path});

    stderr.once('data', (chunk) => {
      stderr.removeListener('end', done);
      reject(chunk.toString());
    });

    stderr.once('end', done);
  });
}

export async function sync_repos(repo1: string, repo2: string) {
  return;
}
