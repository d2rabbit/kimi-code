import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import WebSocket from 'ws';

import {
  IHostTerminalService,
  ScopeActivation,
  LifecycleScope,
  registerScopedService,
  type TerminalProcess,
  type TerminalSpawnOptions,
} from '@moonshot-ai/agent-core-v2';
import { ErrorCode } from '../src/protocol/error-codes';
import type { Terminal } from '@moonshot-ai/agent-core-v2/os/interface/terminal';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type RunningServer, startServer } from '../src/start';
import { TEST_HOST_IDENTITY } from './helpers/hostIdentity';
import { authHeaders, bearerToken } from './helpers/auth';

// --- Fake PTY service -------------------------------------------------------
//
// `startServer` bootstraps the real `HostTerminalService` (backed by node-pty).
// Registering this fake at App scope AFTER those imports overrides it —
// `buildCollection` applies scoped registrations in import order and the last
// `set` for a given (scope, id) wins. Every spawned process is pushed into the
// module-level collectors below so tests can inspect cwd / kill state.

class FakeTerminalProcess implements TerminalProcess {
  private readonly dataListeners = new Set<(data: string) => void>();
  private readonly exitListeners = new Set<(event: { exitCode: number | null }) => void>();
  readonly writes: string[] = [];
  readonly resizes: Array<[number, number]> = [];
  killed = false;

  readonly onProcessData = (listener: (data: string) => void): { dispose(): void } => {
    this.dataListeners.add(listener);
    return { dispose: () => this.dataListeners.delete(listener) };
  };

  readonly onProcessExit = (
    listener: (event: { exitCode: number | null }) => void,
  ): { dispose(): void } => {
    this.exitListeners.add(listener);
    return { dispose: () => this.exitListeners.delete(listener) };
  };

  write(data: string): void {
    this.writes.push(data);
  }
  resize(cols: number, rows: number): void {
    this.resizes.push([cols, rows]);
  }
  kill(): void {
    this.killed = true;
  }
  emitData(data: string): void {
    for (const listener of this.dataListeners) listener(data);
  }
  emitExit(exitCode: number | null): void {
    for (const listener of this.exitListeners) listener({ exitCode });
  }
}

class FakeHostTerminalService implements IHostTerminalService {
  declare readonly _serviceBrand: undefined;

  spawn(options: TerminalSpawnOptions): Promise<TerminalProcess> {
    spawnOptions.push(options);
    const proc = new FakeTerminalProcess();
    processes.push(proc);
    return Promise.resolve(proc);
  }
}

const spawnOptions: TerminalSpawnOptions[] = [];
const processes: FakeTerminalProcess[] = [];

registerScopedService(
  LifecycleScope.App,
  IHostTerminalService,
  FakeHostTerminalService,
  ScopeActivation.OnDemand,
  'terminal-test',
);

// --- Test harness -----------------------------------------------------------

interface Envelope<T> {
  code: number;
  msg: string;
  data: T;
  request_id: string;
  details?: { path: string; message: string }[];
}

interface WsFrame {
  type: string;
  id?: string;
  code?: number;
  payload?: Record<string, unknown>;
  terminal_id?: string;
}

describe('server-v2 /api/v1/sessions/{sid}/terminals', () => {
  let server: RunningServer | undefined;
  let home: string | undefined;
  let work: string | undefined;
  let base: string;

  beforeEach(async () => {
    spawnOptions.length = 0;
    processes.length = 0;
    home = await mkdtemp(join(tmpdir(), 'kimi-server-v2-term-home-'));
    work = await mkdtemp(join(tmpdir(), 'kimi-server-v2-term-work-'));
    await writeFile(
      join(home, 'config.toml'),
      [
        '[providers.stub]',
        'type = "openai"',
        'base_url = "http://127.0.0.1:9999"',
        'api_key = "stub"',
        '',
        '[models.stub]',
        'provider = "stub"',
        'model = "stub"',
        'max_context_size = 1000',
        '',
      ].join('\n'),
    );
    server = await startServer({
      hostIdentity: TEST_HOST_IDENTITY,
      host: '127.0.0.1',
      port: 0,
      homeDir: home,
      logLevel: 'silent',
    });
    base = `http://127.0.0.1:${server.port}`;
  });

  afterEach(async () => {
    if (server !== undefined) {
      await server.close();
      server = undefined;
    }
    if (home !== undefined) {
      await rm(home, { recursive: true, force: true });
      home = undefined;
    }
    if (work !== undefined) {
      await rm(work, { recursive: true, force: true });
      work = undefined;
    }
  });

  async function createSession(cwd: string): Promise<string> {
    const res = await fetch(`${base}/api/v1/sessions`, {
      method: 'POST',
      headers: authHeaders(server as RunningServer, { 'content-type': 'application/json' }),
      body: JSON.stringify({ metadata: { cwd } }),
    } as never);
    const body = (await res.json()) as Envelope<{ id: string }>;
    expect(body.code).toBe(0);
    return body.data.id;
  }

  async function post<T>(path: string, body: unknown): Promise<Envelope<T>> {
    const res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: authHeaders(server as RunningServer, { 'content-type': 'application/json' }),
      body: JSON.stringify(body),
    } as never);
    return (await res.json()) as Envelope<T>;
  }

  async function get<T>(path: string): Promise<Envelope<T>> {
    const res = await fetch(`${base}${path}`, {
      headers: authHeaders(server as RunningServer),
    } as never);
    return (await res.json()) as Envelope<T>;
  }

  async function openTerminalSocket(): Promise<{
    ws: WebSocket;
    next: (predicate: (frame: WsFrame) => boolean) => Promise<WsFrame>;
  }> {
    const ws = new WebSocket(
      `ws://127.0.0.1:${(server as RunningServer).port}/api/v1/ws`,
      [`kimi-code.bearer.${bearerToken(server as RunningServer)}`],
    );
    const frames: WsFrame[] = [];
    const waiters: Array<{
      predicate: (frame: WsFrame) => boolean;
      resolve: (frame: WsFrame) => void;
    }> = [];
    ws.on('message', (data) => {
      const frame = JSON.parse((data as Buffer).toString()) as WsFrame;
      const index = waiters.findIndex((waiter) => waiter.predicate(frame));
      if (index >= 0) {
        waiters.splice(index, 1)[0]?.resolve(frame);
      } else {
        frames.push(frame);
      }
    });
    await new Promise<void>((resolveOpen, rejectOpen) => {
      ws.once('open', resolveOpen);
      ws.once('error', rejectOpen);
    });
    return {
      ws,
      next: (predicate) => {
        const index = frames.findIndex(predicate);
        if (index >= 0) return Promise.resolve(frames.splice(index, 1)[0]!);
        return new Promise((resolveFrame, rejectFrame) => {
          const timer = setTimeout(() => rejectFrame(new Error('timed out waiting for WS frame')), 2000);
          waiters.push({
            predicate,
            resolve: (frame) => {
              clearTimeout(timer);
              resolveFrame(frame);
            },
          });
        });
      },
    };
  }

  it('creates terminals for multiple sessions using each session workspace cwd', async () => {
    const rootA = await mkdtemp(join(tmpdir(), 'kimi-server-v2-term-a-'));
    const rootB = await mkdtemp(join(tmpdir(), 'kimi-server-v2-term-b-'));
    try {
      const sidA = await createSession(rootA);
      const sidB = await createSession(rootB);

      const termA = (await post<Terminal>(`/api/v1/sessions/${sidA}/terminals`, { cols: 100, rows: 30 }))
        .data;
      const termB = (await post<Terminal>(`/api/v1/sessions/${sidB}/terminals`, {})).data;

      expect(termA.session_id).toBe(sidA);
      expect(termA.cols).toBe(100);
      expect(termA.rows).toBe(30);
      expect(termA.status).toBe('running');
      expect(termB.session_id).toBe(sidB);
      // Each session resolves cwd against its own workspace workDir.
      expect(spawnOptions.map((o) => o.cwd)).toEqual([resolve(rootA), resolve(rootB)]);

      const listA = (await get<{ items: Terminal[] }>(`/api/v1/sessions/${sidA}/terminals`)).data;
      const listB = (await get<{ items: Terminal[] }>(`/api/v1/sessions/${sidB}/terminals`)).data;
      expect(listA.items.map((t) => t.id)).toEqual([termA.id]);
      expect(listB.items.map((t) => t.id)).toEqual([termB.id]);
    } finally {
      await rm(rootA, { recursive: true, force: true });
      await rm(rootB, { recursive: true, force: true });
    }
  });

  it('resolves an explicit relative cwd against the session workspace', async () => {
    const sid = await createSession(work as string);
    const term = (await post<Terminal>(`/api/v1/sessions/${sid}/terminals`, { cwd: 'sub' })).data;
    expect(term.cwd).toBe(resolve(work as string, 'sub'));
    expect(spawnOptions[0]?.cwd).toBe(resolve(work as string, 'sub'));
  });

  it('gets and closes a terminal by session id', async () => {
    const sid = await createSession(work as string);
    const terminal = (await post<Terminal>(`/api/v1/sessions/${sid}/terminals`, {})).data;

    const got = (await get<Terminal>(`/api/v1/sessions/${sid}/terminals/${terminal.id}`)).data;
    expect(got.id).toBe(terminal.id);

    const closed = await post<{ closed: true }>(
      `/api/v1/sessions/${sid}/terminals/${terminal.id}:close`,
      {},
    );
    expect(closed.code).toBe(0);
    expect(closed.data).toEqual({ closed: true });
    expect(processes[0]?.killed).toBe(true);

    const after = (await get<Terminal>(`/api/v1/sessions/${sid}/terminals/${terminal.id}`)).data;
    expect(after.status).toBe('exited');
  });

  it('bridges terminal attach, output, input, resize and close over WebSocket', async () => {
    const sid = await createSession(work as string);
    const terminal = (await post<Terminal>(`/api/v1/sessions/${sid}/terminals`, {})).data;
    const socket = await openTerminalSocket();
    try {
      await socket.next((frame) => frame.type === 'server_hello');
      socket.ws.send(JSON.stringify({ type: 'client_hello', id: 'hello', payload: { client_id: 'test' } }));
      await socket.next((frame) => frame.type === 'ack' && frame.id === 'hello');

      socket.ws.send(JSON.stringify({
        type: 'terminal_attach',
        id: 'attach',
        payload: { session_id: sid, terminal_id: terminal.id, since_seq: 0 },
      }));
      const attachAck = await socket.next((frame) => frame.type === 'ack' && frame.id === 'attach');
      expect(attachAck.code).toBe(0);
      expect(attachAck.payload).toEqual({ attached: true, replayed: 0 });

      processes[0]?.emitData('hello from pty');
      const output = await socket.next((frame) => frame.type === 'terminal_output');
      expect(output.terminal_id).toBe(terminal.id);
      expect(output.payload).toEqual({ data: 'hello from pty' });

      socket.ws.send(JSON.stringify({
        type: 'terminal_input',
        id: 'input',
        payload: { session_id: sid, terminal_id: terminal.id, data: 'pwd\n' },
      }));
      expect((await socket.next((frame) => frame.type === 'ack' && frame.id === 'input')).code).toBe(0);
      expect(processes[0]?.writes).toEqual(['pwd\n']);

      socket.ws.send(JSON.stringify({
        type: 'terminal_resize',
        id: 'resize',
        payload: { session_id: sid, terminal_id: terminal.id, cols: 120, rows: 40 },
      }));
      expect((await socket.next((frame) => frame.type === 'ack' && frame.id === 'resize')).code).toBe(0);
      expect(processes[0]?.resizes).toEqual([[120, 40]]);

      socket.ws.send(JSON.stringify({
        type: 'terminal_close',
        id: 'close',
        payload: { session_id: sid, terminal_id: terminal.id },
      }));
      const exit = await socket.next((frame) => frame.type === 'terminal_exit');
      expect(exit.terminal_id).toBe(terminal.id);
      expect((await socket.next((frame) => frame.type === 'ack' && frame.id === 'close')).code).toBe(0);
      expect(processes[0]?.killed).toBe(true);
    } finally {
      socket.ws.close();
    }
  });

  it('maps terminal-not-found, cwd-escape and unknown-session to protocol codes', async () => {
    const sid = await createSession(work as string);

    const missing = await get<unknown>(`/api/v1/sessions/${sid}/terminals/term_missing`);
    expect(missing.code).toBe(ErrorCode.TERMINAL_NOT_FOUND);

    const escaping = await post<unknown>(`/api/v1/sessions/${sid}/terminals`, {
      cwd: '../outside',
    });
    expect(escaping.code).toBe(ErrorCode.FS_PATH_ESCAPES_SESSION);

    const noSession = await get<unknown>(`/api/v1/sessions/sess_missing/terminals`);
    expect(noSession.code).toBe(ErrorCode.SESSION_NOT_FOUND);
  });
});
