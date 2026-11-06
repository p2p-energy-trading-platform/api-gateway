import type { FastifyReply, FastifyRequest } from 'fastify';


//Import registration schemas here

import {
    mapInitiateMeterClaimRequest,
    mapInitiateMeterClaimResponse,
    mapGetRegistrationStatusRequest,
    mapGetRegistrationStatusResponse,
    mapValidateDeviceAssociationRequest,
    mapValidateDeviceAssociationResponse,
    mapReverifyRegistrationRequest,
    mapReverifyRegistrationResponse,
}from './mapper.js';



//POST: Initiate meter claim
export async function initiateMeterClaimHandler(
    request: FastifyRequest,
    reply: FastifyReply,
){

    const body = request.body as {
        user_reference: string;
        meter_id: string;
    };

    //HTTP Request → gRPC Request
    const grpcRequest = mapInitiateMeterClaimRequest(body);

    // Call gRPC client here
    const grpcResponse = await request.server.grpcClients.registration.initiateMeterClaim(grpcRequest);

    // gRPC Response → HTTP Response
    const response = mapInitiateMeterClaimResponse(grpcResponse);

    return reply.code(200).send(response);

}


//GET: Get registration status
export async function getRegistrationStatusHandler(
    request: FastifyRequest,
    reply: FastifyReply,
){

    const params = request.params as {
        registrationId: string;
    };

    // HTTP Request → gRPC Request
    const grpcRequest = mapGetRegistrationStatusRequest(params);

    // Call gRPC client here
    const grpcResponse = await request.server.grpcClients.registration.getRegistrationStatus(grpcRequest);

    // gRPC Response → HTTP Response
    const response = mapGetRegistrationStatusResponse(grpcResponse); 

    return reply.code(200).send(response);

}



//POST: validate device association
export async function validateDeviceAssociationHandler(
    request: FastifyRequest,
    reply: FastifyReply,
){

    const body = request.body as {
        meter_id: string;
    };

    // HTTP Request → gRPC Request
    const grpcRequest = mapValidateDeviceAssociationRequest(body);


    // Call gRPC client here
    const grpcResponse = await request.server.grpcClients.registration.validateDeviceAssociation(grpcRequest);

    // gRPC Response → HTTP Response
    const response = mapValidateDeviceAssociationResponse(grpcResponse);

    return reply.code(200).send(response);

}


//POST: Reverify registration
export async function reverifyRegistrationHandler(
    request: FastifyRequest,
    reply: FastifyReply,
){

    const body = request.body as {
        registration_id: string;
        user_reference: string;
        meter_id: string;
    };

    // HTTP Request → gRPC Request
    const grpcRequest = mapReverifyRegistrationRequest(body);

    // Call gRPC client here
    const grpcResponse = await request.server.grpcClients.registration.reverifyRegistration(grpcRequest);

    // gRPC Response → HTTP Response
    const response = mapReverifyRegistrationResponse(grpcResponse);


    return reply.code(200).send(response);

}