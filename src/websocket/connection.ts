import { CloseCode, type WebsocketLimits } from '../policies/websocket.js';

export interface WebsocketUser {
  userId: string;
  role: string | undefined;
}

export interface ConnectionSocket {
  readonly readyState: number;
  readonly bufferedAmount: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  ping(): void;
  terminate(): void;
}

const OPEN = 1;

/*
 * How long a connection may stay open before it must reauthenticate: the maximum age with ±10%
 * jitter, so connections opened together (for example after a deploy) do not all reconnect at once.
 */
export function connectionLifetimeMs(maxAgeMs: number, random: () => number = Math.random): number {
  return Math.round(maxAgeMs * (0.9 + 0.2 * random()));
}

export class ClientConnection {
  isAlive = true;
  invalidMessages = 0;
  readonly topics = new Map<string, string>();
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    readonly id: string,
    readonly user: WebsocketUser,
    private readonly socket: ConnectionSocket,
    private readonly limits: Pick<WebsocketLimits, 'maxBufferedBytes'>,
  ) {}

  get isOpen(): boolean {
    return this.socket.readyState === OPEN;
  }

  /*
   * Runs tasks for this connection one at a time, in arrival order, so replies keep the order of
   * the messages even when a check is slow. A failed task does not stop the ones after it.
   */
  enqueue<T>(task: () => Promise<T> | T): Promise<T> {
    const run = this.queue.then(task);

    this.queue = run.catch(() => {});

    return run;
  }

  /*
   * Sends a message unless the connection is closed. A client that cannot keep up (too much
   * unsent data waiting) is disconnected instead, so its queue cannot grow without limit.
   */
  send(message: object): boolean {
    if (!this.isOpen) {
      return false;
    }

    if (this.socket.bufferedAmount > this.limits.maxBufferedBytes) {
      this.close(CloseCode.POLICY_VIOLATION, 'Slow consumer');

      return false;
    }

    this.socket.send(JSON.stringify(message));

    return true;
  }

  close(code: number, reason: string): void {
    this.socket.close(code, reason);
  }

  ping(): void {
    this.socket.ping();
  }

  terminate(): void {
    this.socket.terminate();
  }
}
