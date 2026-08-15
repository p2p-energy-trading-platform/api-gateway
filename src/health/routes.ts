import type { FastifyInstance } from 'fastify'

import { getLiveness } from './liveness.js'
import { getReadiness } from './readiness.js'

export async function registerHealthRoutes(
    app: FastifyInstance,
): Promise<void> {
    app.get(
        '/health/live',
        {
            schema: {
                tags: ['health'],
                response: {
                    200: {
                        type: 'object',
                        additionalProperties: false,
                        required: ['status'],
                        properties: {
                            status: {
                                type: 'string',
                                enum: ['ok'],
                            },
                        },
                    },
                },
            },
        },
        async (_request, reply) => {
            return reply.code(200).send(getLiveness())
        },
    )

    app.get(
        '/health/ready',
        {
            schema: {
                tags: ['health'],
                response: {
                    200: {
                        type: 'object',
                        additionalProperties: false,
                        required: ['status'],
                        properties: {
                            status: {
                                type: 'string',
                                enum: ['ready'],
                            },
                        },
                    },

                    503: {
                        type: 'object',
                        additionalProperties: false,
                        required: ['status'],
                        properties: {
                            status: {
                                type: 'string',
                                enum: ['not_ready'],
                            },
                        },
                    },
                },
            },
        },
        async (_request, reply) => {
            const readiness =
                await getReadiness(app)

            if (!readiness.ready) {
                return reply.code(503).send({
                    status: 'not_ready',
                })
            }

            return reply.code(200).send({
                status: 'ready',
            })
        },
    )
}