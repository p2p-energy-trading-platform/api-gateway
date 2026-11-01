import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FastifyInstance } from 'fastify';

import {
    initiateMeterClaimHandler,
    getRegistrationStatusHandler,
    validateDeviceAssociationHandler,
    reverifyRegistrationHandler,
}from './handler.js';

//Import registration schemas here


export async function registerRegistrationRoutes(app: FastifyInstance): Promise<void> {

    const router = app.withTypeProvider<TypeBoxTypeProvider>();

    //POST: Initiate meter claim
    router.post(
        '/registration/claim',
        initiateMeterClaimHandler,
    );

    //GET: Get registration status
    router.get(
        '/registration/status/',
        getRegistrationStatusHandler,
    );

    //POST: validate device association
    router.post(
        '/registration/validate',
        validateDeviceAssociationHandler,
    );

    //POST: Reverify registration
    router.post(
        '/registration/reverify',
        reverifyRegistrationHandler,
    );

}