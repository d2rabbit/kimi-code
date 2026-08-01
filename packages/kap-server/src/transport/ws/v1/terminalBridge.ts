/**
 * Bridges terminal control frames on `/api/v1/ws` to the Session-scoped
 * terminal service. Terminal output is connection-local and volatile: it is
 * sent directly to the attached socket and never enters the session journal.
 */

import {
  Error2,
  ErrorCodes,
  ISessionTerminalService,
  isError2,
  resumeSessionById,
  type Scope,
} from '@moonshot-ai/agent-core-v2';
import type { TerminalFrame } from '@moonshot-ai/agent-core-v2/os/interface/terminal';

import { ErrorCode } from '../../../protocol/error-codes';
import type { JournalLogger } from './sessionEventJournal';

export interface TerminalBridgeConnection {
  readonly id: string;
  sendTerminalFrame(frame: TerminalFrame): void;
}

export interface TerminalBridgeResult<T> {
  readonly code: number;
  readonly msg: string;
  readonly payload: T;
}

export class TerminalBridge {
  private readonly servicesByConnection = new Map<
    string,
    Map<string, ISessionTerminalService>
  >();

  constructor(
    private readonly core: Scope,
    private readonly logger?: JournalLogger,
  ) {}

  attach(
    connection: TerminalBridgeConnection,
    sessionId: string,
    terminalId: string,
    sinceSeq?: number,
  ): Promise<TerminalBridgeResult<{ attached: true; replayed: number }>> {
    return this.run(async () => {
      const service = await this.resolve(connection, sessionId);
      const result = await service.attach(
        terminalId,
        {
          id: connection.id,
          send: (frame) => connection.sendTerminalFrame(frame),
        },
        { sinceSeq },
      );
      return { attached: true as const, replayed: result.replayed };
    });
  }

  detach(
    connection: TerminalBridgeConnection,
    sessionId: string,
    terminalId: string,
  ): Promise<TerminalBridgeResult<{ detached: true }>> {
    return this.run(async () => {
      const service = await this.resolve(connection, sessionId);
      service.detach(terminalId, connection.id);
      return { detached: true as const };
    });
  }

  input(
    connection: TerminalBridgeConnection,
    sessionId: string,
    terminalId: string,
    data: string,
  ): Promise<TerminalBridgeResult<{ accepted: true }>> {
    return this.run(async () => {
      await (await this.resolve(connection, sessionId)).write(terminalId, data);
      return { accepted: true as const };
    });
  }

  resize(
    connection: TerminalBridgeConnection,
    sessionId: string,
    terminalId: string,
    cols: number,
    rows: number,
  ): Promise<TerminalBridgeResult<{ resized: true }>> {
    return this.run(async () => {
      await (await this.resolve(connection, sessionId)).resize(terminalId, cols, rows);
      return { resized: true as const };
    });
  }

  close(
    connection: TerminalBridgeConnection,
    sessionId: string,
    terminalId: string,
  ): Promise<TerminalBridgeResult<{ closed: true }>> {
    return this.run(async () => {
      const service = await this.resolve(connection, sessionId);
      await service.close(terminalId);
      service.detach(terminalId, connection.id);
      return { closed: true as const };
    });
  }

  detachConnection(connection: TerminalBridgeConnection): void {
    const services = this.servicesByConnection.get(connection.id);
    if (services === undefined) return;
    for (const service of services.values()) {
      service.detachAllForSink(connection.id);
    }
    this.servicesByConnection.delete(connection.id);
  }

  private async resolve(
    connection: TerminalBridgeConnection,
    sessionId: string,
  ): Promise<ISessionTerminalService> {
    const remembered = this.servicesByConnection.get(connection.id)?.get(sessionId);
    if (remembered !== undefined) return remembered;

    const session = await resumeSessionById(this.core.accessor, sessionId);
    if (session === undefined) {
      throw new Error2(ErrorCodes.SESSION_NOT_FOUND, `session ${sessionId} does not exist`);
    }
    const service = session.accessor.get(ISessionTerminalService);
    let services = this.servicesByConnection.get(connection.id);
    if (services === undefined) {
      services = new Map();
      this.servicesByConnection.set(connection.id, services);
    }
    services.set(sessionId, service);
    return service;
  }

  private async run<T>(operation: () => Promise<T>): Promise<TerminalBridgeResult<T>> {
    try {
      return { code: ErrorCode.SUCCESS, msg: 'success', payload: await operation() };
    } catch (error) {
      if (isError2(error)) {
        if (error.code === ErrorCodes.SESSION_NOT_FOUND) {
          return { code: ErrorCode.SESSION_NOT_FOUND, msg: error.message, payload: {} as T };
        }
        if (error.code === ErrorCodes.TERMINAL_NOT_FOUND) {
          return { code: ErrorCode.TERMINAL_NOT_FOUND, msg: error.message, payload: {} as T };
        }
      }
      this.logger?.warn({ err: String(error) }, 'terminal websocket control failed');
      return { code: ErrorCode.INTERNAL_ERROR, msg: 'internal error', payload: {} as T };
    }
  }
}
