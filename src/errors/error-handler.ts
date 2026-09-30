import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { AppError } from './app-error.js';
import { ErrorCodes, errorCodeFromStatus, type ErrorCode } from './codes.js';

export interface ErrorResponseBody {
  error: {
    code: ErrorCode;
    message: string;
    requestId: string;
    timestamp: string;
    details: unknown[];
  };
}

function sendError(
  request: FastifyRequest,
  reply: FastifyReply,
  code: ErrorCode,
  message: string = ErrorCodes[code].message,
  details: unknown[] = [],
): FastifyReply {
  const body: ErrorResponseBody = {
    error: {
      code,
      message,
      requestId: request.id,
      timestamp: new Date().toISOString(),
      details,
    },
  };

  return reply.code(ErrorCodes[code].status).send(body);
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler<FastifyError | AppError>((error, request, reply) => {
    if (error instanceof AppError) {
      if (error.statusCode >= 500) {
        request.log.error({ err: error }, 'Request failed');
      }

      return sendError(request, reply, error.code, error.message, error.details);
    }

    if (error.validation !== undefined) {
      const details = error.validation.map((issue) => ({
        location: error.validationContext ?? 'body',
        path: issue.instancePath,
        message: issue.message ?? 'is invalid',
      }));

      return sendError(request, reply, 'VALIDATION_ERROR', undefined, details);
    }

    const statusCode = error.statusCode ?? 500;

    if (statusCode >= 400 && statusCode < 500) {
      return sendError(request, reply, errorCodeFromStatus(statusCode), error.message);
    }

    request.log.error({ err: error }, 'Unhandled request error');

    return sendError(request, reply, 'INTERNAL_ERROR');
  });

  app.setNotFoundHandler((request, reply) => {
    return sendError(request, reply, 'NOT_FOUND', 'Route not found.');
  });
}
