import { Type, type Static } from 'typebox';

import { isoDateTimeSchema, strictObject } from '../../common/validation.js';

export const emptyQuerySchema = strictObject({});

/*
 * Amounts are whole minor units (1 credit = 100 units), so plain JSON integers carry them without
 * the rounding risk that makes fractional amounts travel as strings.
 */
export const walletResponseSchema = strictObject({
  walletId: Type.String(),
  userId: Type.String(),
  available: Type.Integer({ minimum: 0 }),
  reserved: Type.Integer({ minimum: 0 }),
  total: Type.Integer({ minimum: 0 }),
  status: Type.Union([Type.Literal('active'), Type.Literal('frozen'), Type.Literal('closed')]),
  updatedAt: isoDateTimeSchema,
});

export type WalletResponse = Static<typeof walletResponseSchema>;
