import type {
    FastifyInstance,
} from 'fastify'

import { AppError } from './app-error.js'

export function registerErrorHandler(
    app: FastifyInstance,
): void {
    app.setErrorHandler(
        (error, request, reply) => {
            if (error instanceof AppError) {
                return reply
                    .code(error.statusCode)
                    .send({
                        error: {
                            code: error.code,
                            message: error.message,
                            requestId: request.id,
                            details: error.details,
                        },
                    })
            }

            request.log.error(
                { err: error },
                'Unhandled request error',
            )

            return reply
                .code(500)
                .send({
                    error: {
                        code: 'INTERNAL_ERROR',
                        message:
                            'An unexpected error occurred.',
                        requestId: request.id,
                        details: [],
                    },
                })
        },
    )
}