import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app'

describe('GET /health', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = buildApp()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  it('reports that the API gateway is healthy', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health'
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      success: true,
      data: {
        status: 'ok',
        service: 'gridx-api-gateway'
      }
    })
  })
})
