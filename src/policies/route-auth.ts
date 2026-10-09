/*
 * How a route treats access tokens, chosen with `config: { auth: '<policy>' }`.
 *
 * - required: a valid token is needed, otherwise 401 (the default, so new routes are protected)
 * - optional: a valid token is used if present; a missing token is allowed, an invalid one is not
 * - public:   tokens are ignored (health checks, register, login)
 */
export type RouteAuthPolicy = 'required' | 'optional' | 'public';

export const DEFAULT_ROUTE_AUTH_POLICY: RouteAuthPolicy = 'required';
