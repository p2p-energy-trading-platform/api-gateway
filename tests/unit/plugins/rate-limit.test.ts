import { describe, expect, it } from 'vitest';

import { normalizeClientIp } from '../../../src/plugins/rate-limit.js';
import { hashIdentity, rateLimitKey } from '../../../src/transport/redis/keys.js';

describe('normalizeClientIp', () => {
  it.each([
    ['203.0.113.7', '203.0.113.7'],
    ['::ffff:203.0.113.7', '203.0.113.7'],
    ['::FFFF:203.0.113.7', '203.0.113.7'],
    ['2001:db8:1:2::1', '2001:0db8:0001:0002::/64'],
    ['2001:db8:1:2:aaaa:bbbb:cccc:dddd', '2001:0db8:0001:0002::/64'],
    ['2001:DB8:1:2::ffff', '2001:0db8:0001:0002::/64'],
    ['fe80::1%eth0', 'fe80:0000:0000:0000::/64'],
    ['::1', '0000:0000:0000:0000::/64'],
    ['64:ff9b::192.0.2.33', '0064:ff9b:0000:0000::/64'],
  ])('normalizes %s to %s', (input, expected) => {
    expect(normalizeClientIp(input)).toBe(expected);
  });
});

describe('rate-limit keys', () => {
  it('builds a namespaced, versioned key', () => {
    expect(rateLimitKey('production', 'auth-login', 'abc123')).toBe(
      'gridx:production:gateway:rl:v1:auth-login:abc123',
    );
  });

  it('hashes identities so raw IPs never appear in keys', () => {
    const hashed = hashIdentity('secret-value-123', '203.0.113.7');

    expect(hashed).toMatch(/^[0-9a-f]{32}$/);
    expect(hashed).not.toContain('203');
  });

  it('produces the same hash for the same input and secret', () => {
    expect(hashIdentity('secret-a', '203.0.113.7')).toBe(hashIdentity('secret-a', '203.0.113.7'));
  });

  it('produces different hashes for different secrets', () => {
    expect(hashIdentity('secret-a', '203.0.113.7')).not.toBe(
      hashIdentity('secret-b', '203.0.113.7'),
    );
  });
});
