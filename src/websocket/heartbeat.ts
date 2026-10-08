export interface HeartbeatTarget {
  isAlive: boolean;
  ping(): void;
  terminate(): void;
}

/*
  * Checks the heartbeat of each target. If a target is not alive, it is terminated. Otherwise, it is pinged and marked as not alive.
*/
export function checkHeartbeats(targets: Iterable<HeartbeatTarget>): number {
  let terminated = 0;

  for (const target of targets) {
    if (!target.isAlive) {
      target.terminate();
      terminated += 1;
      continue;
    }

    target.isAlive = false;
    target.ping();
  }

  return terminated;
}

export function startHeartbeat(
  getTargets: () => Iterable<HeartbeatTarget>,
  intervalMs: number,
): () => void {
  const timer = setInterval(() => {
    checkHeartbeats(getTargets());
  }, intervalMs);

  // Do not keep the process alive just for heartbeats.
  timer.unref();

  return () => clearInterval(timer);
}
