import cors from '@fastify/cors'
import type { FastifyInstance } from 'fastify'

import type { AppConfig } from '../config/types.js'

export async function registerCors(
  app: FastifyInstance,
  config: AppConfig,
): Promise<void> {
  await app.register(cors, {
    origin: config.cors.origins,

    credentials: false,

    methods: [
      'GET',
      'POST',
      'PUT',
      'PATCH',
      'DELETE',
      'OPTIONS',
    ],
  })
}