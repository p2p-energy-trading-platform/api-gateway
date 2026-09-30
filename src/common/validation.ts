import { Ajv, type Options } from 'ajv';
import addFormats from 'ajv-formats';
import type { FastifySchema, FastifySchemaCompiler } from 'fastify';

/*
 * Validator settings
 *
 * - removeAdditional: false  -> unknown fields are rejected (with additionalProperties: false),
 *                               not silently dropped.
 * - coerceTypes              -> only for querystring, params, and headers, which always arrive
 *                               as strings. Bodies must send the correct JSON types.
 * - allErrors: false         -> Fastify's default. Collecting every error allows a DoS with
 *                               large payloads, so only the first error is reported.
 */
const baseOptions: Options = {
  useDefaults: true,
  removeAdditional: false,
  allErrors: false,
};

function createAjv(options: Options): Ajv {
  const ajv = new Ajv({ ...baseOptions, ...options });

  addFormats.default(ajv);

  return ajv;
}

const bodyAjv = createAjv({ coerceTypes: false });
const stringInputAjv = createAjv({ coerceTypes: 'array' });

export const validatorCompiler: FastifySchemaCompiler<FastifySchema> = ({ schema, httpPart }) => {
  const ajv = httpPart === 'body' ? bodyAjv : stringInputAjv;

  return ajv.compile(schema);
};

/*
 * Shared schema fragments
 */
export const uuidSchema = { type: 'string', format: 'uuid' } as const;

export const emailSchema = { type: 'string', format: 'email', maxLength: 254 } as const;

export const isoDateTimeSchema = { type: 'string', format: 'date-time' } as const;

/*
 * Decimal amounts (energy, prices) are sent as strings to avoid floating-point rounding.
 */
export const nonNegativeDecimalSchema = {
  type: 'string',
  pattern: '^(0|[1-9][0-9]*)(\\.[0-9]+)?$',
  maxLength: 32,
} as const;

export function strictObject<const P extends Record<string, unknown>>(
  properties: P,
  required: readonly (keyof P & string)[] = [],
) {
  return {
    type: 'object',
    additionalProperties: false,
    required,
    properties,
  } as const;
}

export const idParamsSchema = strictObject({ id: uuidSchema }, ['id']);

export interface IdParams {
  id: string;
}
