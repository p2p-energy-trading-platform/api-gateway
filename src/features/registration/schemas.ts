import { Type } from '@sinclair/typebox';



//POST: Initiate meter claim
export const initiateMeterClaimSchema = {

    body: Type.Object({
        user_reference: Type.String({ minLength: 1 }),
        meter_id: Type.String({ minLength: 1 }),
    }),

    response:{
        200: Type.Object({
            registration_id: Type.String(),
            status: Type.String(),
            message: Type.String(),
        }),
    },

}; 

//GET: Get registration status
export const getRegistrationStatusSchema = {

    params: Type.Object({
        registrationId: Type.String({ minLength: 1 }),
    }),

    response: {
        200: Type.Object({
            registration_id: Type.String(),
            meter_id: Type.String(),
            approval_status: Type.String(),
        }),
    },

};


//POST: validate device association
export const validateDeviceAssociationSchema = {

    body: Type.Object({
        meter_id: Type.String({ minLength: 1 }),
    }),

    response: {
        200: Type.Object({
            is_registered: Type.Boolean(),
            primary_user_id: Type.String(),
        }),
    },

};


//POST: Reverify registration
export const reverifyRegistrationSchema = {

    body: Type.Object({
        registration_id: Type.String({ minLength: 1 }),
        user_reference: Type.String({ minLength: 1 }),
        meter_id: Type.String({ minLength: 1 }),
    }),

    response: {
        200: Type.Object({
            registration_id: Type.String(),
            meter_id: Type.String(),
            message: Type.String(),
            status: Type.String(),
        }),
    },

};