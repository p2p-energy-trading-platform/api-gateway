import { Type, type Static, type TSchema } from 'typebox';

import { strictObject } from './validation.js';

export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 100;

export const paginationProperties = {
  limit: Type.Optional(
    Type.Integer({ minimum: 1, maximum: MAX_PAGE_LIMIT, default: DEFAULT_PAGE_LIMIT }),
  ),
  cursor: Type.Optional(Type.String({ minLength: 1, maxLength: 512 })),
};

/*
 * Use directly for list endpoints without filters. Endpoints with filters should spread
 * paginationProperties into their own strictObject so unknown query fields are still rejected.
 */
export const paginationQuerySchema = strictObject(paginationProperties);

/*
 * limit is optional for clients, but the validator always fills in the default, so handlers
 * can rely on it being set.
 */
export type PaginationQuery = Static<typeof paginationQuerySchema> & { limit: number };

export function pageResponseSchema<const S extends TSchema>(itemSchema: S) {
  return strictObject({
    items: Type.Array(itemSchema),
    nextCursor: Type.Union([Type.String(), Type.Null()]),
  });
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}
