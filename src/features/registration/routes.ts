import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FastifyInstance } from 'fastify';

import {
    initiateMeterClaimSchema,
    getRegistrationStatusSchema,
    validateDeviceAssociationSchema,
    reverifyRegistrationSchema,
}from './schemas.js'; 

import {
    initiateMeterClaimHandler,
    getRegistrationStatusHandler,
    validateDeviceAssociationHandler,
    reverifyRegistrationHandler,
}from './handler.js';

//Import registration schemas here


export async function registerRegistrationRoutes(app: FastifyInstance): Promise<void> {
  const router = app.withTypeProvider<TypeBoxTypeProvider>();

  router.post(
    '/api/v1/registration/claim',
    {
      config: { rateLimit: 'registration-claim', auth: 'required' },
      schema: initiateMeterClaimSchema,
    },
    initiateMeterClaimHandler,
  );

  router.get(
    '/api/v1/registration/status/:registrationId',
    {
      config: { rateLimit: 'registration-check', auth: 'required' },
      schema: getRegistrationStatusSchema,
    },
    getRegistrationStatusHandler,
  );

  router.post(
    '/api/v1/registration/validate',
    {
      config: { rateLimit: 'registration-check', auth: 'required' },
      schema: validateDeviceAssociationSchema,
    },
    validateDeviceAssociationHandler,
  );

  router.post(
    '/api/v1/registration/reverify',
    {
      config: { rateLimit: 'registration-reverify', auth: 'required' },
      schema: reverifyRegistrationSchema,
    },
    reverifyRegistrationHandler,
  );
}