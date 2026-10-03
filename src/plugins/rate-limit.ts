import { isIP } from 'node:net';

import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';

import type { AppConfig } from '../config/types.js';
import { AppError } from '../errors/app-error.js';
import {
  DEFAULT_RATE_LIMIT_POLICY,
  rateLimitPolicies,
  type RateLimitPolicyName,
} from '../policies/rate-limits.js';
import { hashIdentity, rateLimitKey } from '../transport/redis/keys.js';
import { consumeRateLimit } from '../transport/redis/rate-limit.js';

declare module 'fastify' {
  interface FastifyContextConfig {
    rateLimit?: RateLimitPolicyName | false;
  }
}

export interface RateLimitPluginOptions {
  config: AppConfig;
}

function expandIpv6(address: string): string[] {
  let ip = address;

  // An embedded IPv4 tail (e.g. 64:ff9b::1.2.3.4) becomes two hex groups.
  const ipv4Tail = ip.match(/(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ipv4Tail) {
    const [a, b, c, d] = ipv4Tail.slice(1).map(Number) as [number, number, number, number];
    ip =
      ip.slice(0, ipv4Tail.index) + `${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }

  const [head = '', tail] = ip.split('::');
  const headGroups = head ? head.split(':') : [];
  const tailGroups = tail ? tail.split(':') : [];
  const zeroGroups = tail === undefined ? 0 : 8 - headGroups.length - tailGroups.length;

  return [...headGroups, ...Array<string>(zeroGroups).fill('0'), ...tailGroups].map((group) =>
    group.padStart(4, '0').toLowerCase(),
  );
}

/*
 * IPv4 addresses are used as-is. IPv6 clients usually control a whole /64 block, so they are
 * grouped by their /64 prefix; otherwise one client could rotate addresses to avoid limits.
 */
export function normalizeClientIp(ip: string): string {
  const address = ip.split('%')[0] ?? ip;

  const mappedIpv4 = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (mappedIpv4?.[1] !== undefined) {
    return mappedIpv4[1];
  }

  if (isIP(address) !== 6) {
    return address;
  }

  return `${expandIpv6(address).slice(0, 4).join(':')}::/64`;
}

const rateLimitPlugin: FastifyPluginAsync<RateLimitPluginOptions> = async (app, options) => {
  const { config } = options;

  app.addHook('onRequest', async (request, reply) => {
    const policyName = request.routeOptions.config.rateLimit ?? DEFAULT_RATE_LIMIT_POLICY;

    if (policyName === false) {
      return;
    }

    const policy = rateLimitPolicies[policyName];
    const identity = hashIdentity(config.rateLimit.hashSecret, normalizeClientIp(request.ip));
    const key = rateLimitKey(config.nodeEnv, policyName, identity);

    let result;

    try {
      result = await consumeRateLimit(app.redis, key, policy);
    } catch (error) {
      // Fail closed: without Redis the limit cannot be enforced, so the request is refused.
      request.log.error({ err: error }, 'Rate limit check failed');

      throw new AppError('UPSTREAM_UNAVAILABLE');
    }

    reply.header('ratelimit-limit', policy.limit);
    reply.header('ratelimit-remaining', result.remaining);
    reply.header('ratelimit-reset', Math.ceil(result.resetMs / 1000));

    if (!result.allowed) {
      reply.header('retry-after', Math.ceil(result.retryAfterMs / 1000));

      throw new AppError('RATE_LIMITED');
    }
  });
};

export default fp(rateLimitPlugin, {
  name: 'rate-limit',
  dependencies: ['redis'],
});
