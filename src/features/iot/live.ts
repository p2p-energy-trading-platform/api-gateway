import { Code, ConnectError } from '@connectrpc/connect';
import type { StreamHouseLiveResponse } from '@p2p-energy-trading-platform/typescript-sdk/gen/gridx/iot/v1/iot_pb';

import { AppError } from '../../errors/app-error.js';
import { grpcDeadlinesMs } from '../../transport/grpc/deadlines.js';
import type { WebsocketUser } from '../../websocket/connection.js';
import type { TopicProvider } from '../../websocket/topics.js';
import { mapMeterReading, mapMeterStatusUpdate } from './mapper.js';

export const IOT_HOUSE_TOPIC_PREFIX = 'iot.house.';

// The same house ID rule as the REST routes.
const HOUSE_ID_PATTERN = /^[A-Za-z0-9._:-]{1,100}$/;

/** What the feed needs from the IoT gRPC client. */
export interface LiveIotClient {
  getHouse(params: { houseId: string; ownerUserId: string }, timeoutMs?: number): Promise<unknown>;
  streamHouseLive(
    params: { houseId: string; ownerUserId: string },
    options: { signal: AbortSignal; timeoutMs: number },
  ): AsyncIterable<StreamHouseLiveResponse>;
}

export interface LiveFeedOptions {
  /** Each upstream stream ends after this long and is reopened at once. */
  streamTimeoutMs: number;
  /** An unwatched house's stream stays open this long in case someone comes back. */
  idleGraceMs: number;
  minBackoffMs?: number;
  maxBackoffMs?: number;
  random?: () => number;
}

type Log = Pick<Console, 'warn' | 'info' | 'error' | 'debug'>;

interface LiveFeedDeps {
  client: LiveIotClient;
  publish: (key: string, event: string, payload: unknown) => number;
  log: Log;
  options: LiveFeedOptions;
}

interface Upstream {
  controller: AbortController;
  idleTimer: ReturnType<typeof setTimeout> | undefined;
}

/*
 * The iot.house.<houseId> WebSocket topic. Ownership is checked with the IoT service when a user
 * subscribes. Each gateway instance opens one StreamHouseLive stream per house its clients watch,
 * shared by all of them, and forwards its events. The stream carries no user identity.
 *
 * Events: "reading" (same shape as the latest-reading REST response), "status"
 * ({ meterStatus, lastHeartbeatAt? }) and "stream-state" ({ state: "interrupted" | "live" }).
 */
export class IotLiveFeed implements TopicProvider {
  private readonly upstreams = new Map<string, Upstream>();
  private readonly client: LiveIotClient;
  private readonly publish: LiveFeedDeps['publish'];
  private readonly log: Log;
  private readonly options: Required<LiveFeedOptions>;
  private closed = false;

  constructor(deps: LiveFeedDeps) {
    this.client = deps.client;
    this.publish = deps.publish;
    this.log = deps.log;
    this.options = {
      minBackoffMs: 1_000,
      maxBackoffMs: 30_000,
      random: Math.random,
      ...deps.options,
    };
  }

  matches(topic: string): boolean {
    return topic.startsWith(IOT_HOUSE_TOPIC_PREFIX);
  }

  /*
   * An unknown house and someone else's house get the same answer (null, TOPIC_NOT_ALLOWED), so
   * users cannot probe which IDs exist. If the check cannot run, it rejects (TOPIC_UNAVAILABLE).
   */
  async authorize(topic: string, user: WebsocketUser): Promise<string | null> {
    const houseId = topic.slice(IOT_HOUSE_TOPIC_PREFIX.length);

    if (!HOUSE_ID_PATTERN.test(houseId)) {
      return null;
    }

    try {
      await this.client.getHouse(
        { houseId, ownerUserId: user.userId },
        grpcDeadlinesMs.iotGetHouse,
      );
    } catch (error) {
      if (
        error instanceof AppError &&
        (error.code === 'NOT_FOUND' || error.code === 'VALIDATION_ERROR')
      ) {
        return null;
      }
      throw error;
    }

    return topic;
  }

  onActive(key: string): void {
    const existing = this.upstreams.get(key);

    if (existing !== undefined) {
      // Someone came back within the grace period: keep the stream.
      clearTimeout(existing.idleTimer);
      existing.idleTimer = undefined;
      return;
    }

    if (this.closed) {
      return;
    }

    const upstream: Upstream = { controller: new AbortController(), idleTimer: undefined };

    this.upstreams.set(key, upstream);
    void this.run(key, upstream.controller.signal);
  }

  onIdle(key: string): void {
    const upstream = this.upstreams.get(key);

    if (upstream === undefined) {
      return;
    }

    clearTimeout(upstream.idleTimer);
    upstream.idleTimer = setTimeout(() => this.stop(key), this.options.idleGraceMs);
    upstream.idleTimer.unref();
  }

  /** Stops every upstream stream; call when the gateway shuts down. */
  close(): void {
    this.closed = true;

    for (const key of this.upstreams.keys()) {
      this.stop(key);
    }
  }

  /** Exponential backoff with ±20% jitter, capped at the maximum. */
  backoffMs(attempt: number): number {
    const base = Math.min(this.options.maxBackoffMs, this.options.minBackoffMs * 2 ** attempt);
    const jittered = base * (0.8 + 0.4 * this.options.random());

    return Math.round(Math.min(this.options.maxBackoffMs, jittered));
  }

  private stop(key: string): void {
    const upstream = this.upstreams.get(key);

    if (upstream !== undefined) {
      clearTimeout(upstream.idleTimer);
      upstream.controller.abort();
      this.upstreams.delete(key);
    }
  }

  private async run(key: string, signal: AbortSignal): Promise<void> {
    const houseId = key.slice(IOT_HOUSE_TOPIC_PREFIX.length);
    let failures = 0;
    let interrupted = false;

    while (!signal.aborted) {
      // A stream that delivered something ended at the end of its life and is reopened at once.
      // One that ended before sending anything failed (for example a slow database) and backs
      // off, so a struggling IoT service is not hit in a tight loop.
      let received = false;

      try {
        // An empty owner: this stream is shared, and ownership was checked per subscriber.
        const stream = this.client.streamHouseLive(
          { houseId, ownerUserId: '' },
          { signal, timeoutMs: this.options.streamTimeoutMs },
        );

        for await (const message of stream) {
          received = true;
          if (interrupted) {
            interrupted = false;
            this.publish(key, 'stream-state', { state: 'live' });
          }
          failures = 0;
          this.forward(key, message);
        }

        if (received) {
          continue; // ended normally: reopen at once
        }
        throw new Error('IoT live stream ended before sending anything');
      } catch (error) {
        if (signal.aborted) {
          return;
        }

        if (received && error instanceof ConnectError && error.code === Code.DeadlineExceeded) {
          continue; // the normal end of a stream's life: reopen at once
        }

        this.log.warn({ err: error, houseId }, 'IoT live stream interrupted');

        if (!interrupted) {
          interrupted = true;
          this.publish(key, 'stream-state', { state: 'interrupted' });
        }

        await sleep(this.backoffMs(failures), signal);
        failures += 1;
      }
    }
  }

  private forward(key: string, message: StreamHouseLiveResponse): void {
    try {
      switch (message.event.case) {
        case 'reading':
          this.publish(key, 'reading', mapMeterReading(message.event.value));
          break;
        case 'status':
          this.publish(key, 'status', mapMeterStatusUpdate(message.event.value));
          break;
        default:
          this.log.warn({ key }, 'IoT live stream sent an empty event');
      }
    } catch (error) {
      this.log.warn({ err: error, key }, 'IoT live event could not be mapped');
    }
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms);

    function done() {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    }

    signal.addEventListener('abort', done, { once: true });
  });
}
