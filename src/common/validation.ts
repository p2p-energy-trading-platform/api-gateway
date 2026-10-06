import { Ajv, type Options } from 'ajv';
import addFormats from 'ajv-formats';
import type { FastifySchema, FastifySchemaCompiler } from 'fastify';
import { Type, type Static, type TProperties } from 'typebox';

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
 *
 * Schemas are written with TypeBox: each one is plain JSON Schema for Ajv, and Static<> derives
 * the matching TypeScript type, so request and response shapes are defined once.
 */
export const uuidSchema = Type.String({ format: 'uuid' });

export const emailSchema = Type.String({ format: 'email', maxLength: 254 });

export const isoDateTimeSchema = Type.String({ format: 'date-time' });

/*
 * Decimal amounts (energy, prices) are sent as strings to avoid floating-point rounding.
 */
export const nonNegativeDecimalSchema = Type.String({
  pattern: '^(0|[1-9][0-9]*)(\\.[0-9]+)?$',
  maxLength: 32,
});

/*
 * An object that rejects unknown fields. Properties are required unless wrapped in
 * Type.Optional().
 */
export function strictObject<P extends TProperties>(properties: P) {
  return Type.Object(properties, { additionalProperties: false });
}

export const idParamsSchema = strictObject({ id: uuidSchema });

export type IdParams = Static<typeof idParamsSchema>;
