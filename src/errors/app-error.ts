import { ErrorCodes, type ErrorCode } from './codes.js';

export class AppError extends Error {
  public readonly statusCode: number;

  constructor(
    public readonly code: ErrorCode,
    message: string = ErrorCodes[code].message,
    public readonly details: unknown[] = [],
  ) {
    super(message);

    this.name = 'AppError';
    this.statusCode = ErrorCodes[code].status;
  }
}
