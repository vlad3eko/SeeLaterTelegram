import { spawn } from 'node:child_process';
import { access, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import type { ProcessOptions } from '../types.js';

export type ProcessResult = { stdout: string; stderr: string };

export async function runProcess(
  command: string,
  args: string[],
  options: ProcessOptions = {},
): Promise<ProcessResult> {
  const label = options.label ?? command;
  const maxStderrBytes = options.maxStderrBytes ?? 2 * 1024 * 1024;

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let stderrBytes = 0;
    let settled = false;
    let timeout: NodeJS.Timeout | undefined;

    const finishError = (error: Error) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      reject(error);
    };

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      // Current commands should emit little stdout; cap it to prevent accidental memory growth.
      if (stdout.length < 2 * 1024 * 1024) stdout += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      const size = Buffer.byteLength(chunk, 'utf8');
      stderrBytes += size;
      stderr += chunk;
      if (stderrBytes > maxStderrBytes) {
        stderr = stderr.slice(-maxStderrBytes);
        stderrBytes = Buffer.byteLength(stderr, 'utf8');
      }
    });

    child.once('error', (error) => {
      finishError(new Error(`[${label}] Could not start process: ${error.message}`, { cause: error }));
    });

    if (options.timeoutMs && options.timeoutMs > 0) {
      timeout = setTimeout(() => {
        child.kill('SIGTERM');
        setTimeout(() => child.kill('SIGKILL'), 5_000).unref();
        finishError(new Error(`[${label}] Timed out after ${options.timeoutMs} ms.`));
      }, options.timeoutMs);
      timeout.unref();
    }

    child.once('close', (code, signal) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(
        `[${label}] Process failed (code=${code ?? 'null'}, signal=${signal ?? 'none'}).\n${stderr.trim().slice(-12_000)}`,
      ));
    });
  });
}

export async function assertFileExists(filePath: string, label: string): Promise<void> {
  try {
    await access(filePath);
  } catch (error) {
    throw new Error(`${label} does not exist: ${filePath}`, { cause: error });
  }
}

export async function prepareOutputPath(filePath: string): Promise<void> {
  await mkdir(path.dirname(path.resolve(filePath)), { recursive: true });
  await rm(filePath, { force: true });
}

/** Escape a path for use inside an FFmpeg filter option, not a shell argument. */
export function escapeFilterValue(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/,/g, '\\,')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/;/g, '\\;');
}

export function ffmpegFilterPath(filePath: string): string {
  // Forward slashes are accepted by FFmpeg on Windows and avoid backslash ambiguity.
  return escapeFilterValue(path.resolve(filePath).replace(/\\/g, '/'));
}

export function ffmpegFilterGraphPath(filePath: string): string {
    const optionPath = ffmpegFilterPath(filePath);

    return optionPath
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/([\[\],;])/g, '\\$1');
}
