import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { buildApp } from '../../src/app.js';
import { paginationQuerySchema, type PaginationQuery } from '../../src/common/pagination.js';
import {
  emailSchema,
  idParamsSchema,
  nonNegativeDecimalSchema,
  strictObject,
  type IdParams,
} from '../../src/common/validation.js';
import { testConfig } from '../helpers/test-config.js';

const VALID_ID = '3f1c2b7e-8a4d-4c1e-9b2a-6d5e4f3a2b1c';

describe('request validation', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp({
      config: testConfig,
      registerInfrastructure: false,
    });

    // Test-only routes using the shared schemas.
    app.post(
      '/test/orders',
      {
        schema: {
          body: strictObject(
            {
              email: emailSchema,
              quantity: { type: 'integer', minimum: 1 },
              price: nonNegativeDecimalSchema,
            },
            ['email', 'quantity', 'price'],
          ),
        },
      },
      async (request) => request.body,
    );

    app.get<{ Params: IdParams }>(
      '/test/items/:id',
      { schema: { params: idParamsSchema } },
      async (request) => ({ id: request.params.id }),
    );

    app.get<{ Querystring: PaginationQuery }>(
      '/test/items',
      { schema: { querystring: paginationQuerySchema } },
      async (request) => request.query,
    );
  });

  afterEach(async () => {
    await app.close();
  });

  function postOrder(payload: Record<string, unknown>) {
    return app.inject({ method: 'POST', url: '/test/orders', payload });
  }

  const validOrder = { email: 'user@example.com', quantity: 5, price: '0.25' };

  describe('body', () => {
    it('accepts a valid body', async () => {
      const response = await postOrder(validOrder);

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(validOrder);
    });

    it('rejects a missing required field', async () => {
      const response = await postOrder({ email: 'user@example.com', price: '1' });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
      expect(response.json().error.details).toEqual([
        expect.objectContaining({ location: 'body' }),
      ]);
    });

    it('rejects unknown fields instead of dropping them', async () => {
      const response = await postOrder({ ...validOrder, isAdmin: true });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
    });

    it('does not coerce string numbers in the body', async () => {
      const response = await postOrder({ ...validOrder, quantity: '5' });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.details).toEqual([
        expect.objectContaining({ location: 'body', path: '/quantity' }),
      ]);
    });

    it('rejects an invalid email format', async () => {
      const response = await postOrder({ ...validOrder, email: 'not-an-email' });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.details).toEqual([
        expect.objectContaining({ path: '/email' }),
      ]);
    });

    it.each(['-1', '1.', '.5', '01', 'abc'])('rejects invalid decimal %s', async (price) => {
      const response = await postOrder({ ...validOrder, price });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('params', () => {
    it('accepts a valid UUID', async () => {
      const response = await app.inject({ method: 'GET', url: `/test/items/${VALID_ID}` });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ id: VALID_ID });
    });

    it('rejects an invalid UUID with location params', async () => {
      const response = await app.inject({ method: 'GET', url: '/test/items/123' });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.details).toEqual([
        expect.objectContaining({ location: 'params', path: '/id' }),
      ]);
    });
  });

  describe('pagination', () => {
    it('applies the default limit', async () => {
      const response = await app.inject({ method: 'GET', url: '/test/items' });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ limit: 20 });
    });

    it('coerces the limit query string to a number', async () => {
      const response = await app.inject({ method: 'GET', url: '/test/items?limit=50&cursor=abc' });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ limit: 50, cursor: 'abc' });
    });

    it.each(['0', '101', 'ten'])('rejects limit=%s with location querystring', async (limit) => {
      const response = await app.inject({ method: 'GET', url: `/test/items?limit=${limit}` });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.details).toEqual([
        expect.objectContaining({ location: 'querystring', path: '/limit' }),
      ]);
    });

    it('rejects unknown query parameters', async () => {
      const response = await app.inject({ method: 'GET', url: '/test/items?sort=asc' });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
    });
  });
});
