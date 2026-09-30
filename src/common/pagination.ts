import { strictObject } from './validation.js';

export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 100;

export const paginationProperties = {
  limit: { type: 'integer', minimum: 1, maximum: MAX_PAGE_LIMIT, default: DEFAULT_PAGE_LIMIT },
  cursor: { type: 'string', minLength: 1, maxLength: 512 },
} as const;

/*
 * Use directly for list endpoints without filters. Endpoints with filters should spread
 * paginationProperties into their own strictObject so unknown query fields are still rejected.
 */
export const paginationQuerySchema = strictObject(paginationProperties);

export interface PaginationQuery {
  limit: number;
  cursor?: string;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export function pageResponseSchema<const S extends Record<string, unknown>>(itemSchema: S) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['items', 'nextCursor'],
    properties: {
      items: { type: 'array', items: itemSchema },
      nextCursor: { type: ['string', 'null'] },
    },
  } as const;
}
