import { Type, type Static } from 'typebox';

import { strictObject } from '../../common/validation.js';

const meterIdSchema = Type.String({ minLength: 1, maxLength: 100 });
const registrationIdSchema = Type.String({ minLength: 1, maxLength: 100 });

export const initiateMeterClaimSchema = {
  body: strictObject({
    meter_id: meterIdSchema,
  }),
  response: {
    200: strictObject({
      registration_id: Type.String(),
      status: Type.String(),
      message: Type.String(),
    }),
  },
};

export const getRegistrationStatusSchema = {
  params: strictObject({
    registrationId: registrationIdSchema,
  }),
  response: {
    200: strictObject({
      registration_id: Type.String(),
      meter_id: Type.String(),
      approval_status: Type.String(),
    }),
  },
};

export const validateDeviceAssociationSchema = {
  body: strictObject({
    meter_id: meterIdSchema,
  }),
  response: {
    200: strictObject({
      is_registered: Type.Boolean(),
      primary_user_id: Type.String(),
    }),
  },
};

export const reverifyRegistrationSchema = {
  body: strictObject({
    registration_id: registrationIdSchema,
    meter_id: meterIdSchema,
  }),
  response: {
    200: strictObject({
      registration_id: Type.String(),
      meter_id: Type.String(),
      message: Type.String(),
      status: Type.String(),
    }),
  },
};

export type InitiateMeterClaimBody = Static<typeof initiateMeterClaimSchema.body>;
export type RegistrationIdParams = Static<typeof getRegistrationStatusSchema.params>;
export type ValidateDeviceAssociationBody = Static<typeof validateDeviceAssociationSchema.body>;
export type ReverifyRegistrationBody = Static<typeof reverifyRegistrationSchema.body>;