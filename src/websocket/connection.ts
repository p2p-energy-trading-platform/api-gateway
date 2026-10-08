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

export class ClientConnection {
  isAlive = true;
  invalidMessages = 0;
  readonly topics = new Map<string, string>();

  constructor(
    readonly id: string,
    readonly user: WebsocketUser,
    private readonly socket: ConnectionSocket,
    private readonly limits: Pick<WebsocketLimits, 'maxBufferedBytes'>,
  ) {}

  /*
   * Sends a message unless the connection is closed. A client that cannot keep up (too much
   * unsent data waiting) is disconnected instead, so its queue cannot grow without limit.
   */
  send(message: object): boolean {
    if (this.socket.readyState !== OPEN) {
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
