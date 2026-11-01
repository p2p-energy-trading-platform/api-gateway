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


    //POST: Initiate meter claim
    router.post(

        '/registration/claim',
        {
            schema: initiateMeterClaimSchema,
        },
        initiateMeterClaimHandler,

    );


    //GET: Get registration status
    router.get(

        '/registration/status/:registrationId',
        {
            schema: getRegistrationStatusSchema,
        },
        getRegistrationStatusHandler,

    );


    //POST: validate device association
    router.post(

        '/registration/validate',
        {
            schema: validateDeviceAssociationSchema,
        },
        validateDeviceAssociationHandler,

    );


    //POST: Reverify registration
    router.post(

        '/registration/reverify',
        {
            schema: reverifyRegistrationSchema,
        },
        reverifyRegistrationHandler,

    );

}