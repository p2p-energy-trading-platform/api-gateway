import type { FastifyRequest } from 'fastify';

import { AppError } from '../../errors/app-error.js';
import { grpcDeadlinesMs } from '../../transport/grpc/deadlines.js';
import {
  mapInitiateMeterClaimRequest,
  mapInitiateMeterClaimResponse,
  mapGetRegistrationStatusRequest,
  mapGetRegistrationStatusResponse,
  mapValidateDeviceAssociationRequest,
  mapValidateDeviceAssociationResponse,
  mapReverifyRegistrationRequest,
  mapReverifyRegistrationResponse,
} from './mapper.js';
import type {
  InitiateMeterClaimBody,
  RegistrationIdParams,
  ReverifyRegistrationBody,
  ValidateDeviceAssociationBody,
} from './schemas.js';

function currentUserId(request: FastifyRequest): string {
  if (request.principal === null) {
    throw new AppError('UNAUTHENTICATED');
  }
  return request.principal.userId;
}

export async function initiateMeterClaimHandler(
  request: FastifyRequest<{ Body: InitiateMeterClaimBody }>,
) {
  const grpcRequest = mapInitiateMeterClaimRequest({
    user_reference: currentUserId(request),
    meter_id: request.body.meter_id,
  });
  const grpcResponse = await request.server.grpcClients.registration.initiateMeterClaim(
    grpcRequest,
    grpcDeadlinesMs.registrationInitiateMeterClaim,
  );

  return mapInitiateMeterClaimResponse(grpcResponse);
}

export async function getRegistrationStatusHandler(
  request: FastifyRequest<{ Params: RegistrationIdParams }>,
) {
  const grpcRequest = mapGetRegistrationStatusRequest(request.params);
  const grpcResponse = await request.server.grpcClients.registration.getRegistrationStatus(
    grpcRequest,
    grpcDeadlinesMs.registrationGetStatus,
  );

  return mapGetRegistrationStatusResponse(grpcResponse);
}

export async function validateDeviceAssociationHandler(
  request: FastifyRequest<{ Body: ValidateDeviceAssociationBody }>,
) {
  const grpcRequest = mapValidateDeviceAssociationRequest(request.body);
  const grpcResponse = await request.server.grpcClients.registration.validateDeviceAssociation(
    grpcRequest,
    grpcDeadlinesMs.registrationValidateAssociation,
  );

  return mapValidateDeviceAssociationResponse(grpcResponse);
}

export async function reverifyRegistrationHandler(
  request: FastifyRequest<{ Body: ReverifyRegistrationBody }>,
) {
  const grpcRequest = mapReverifyRegistrationRequest({
    registration_id: request.body.registration_id,
    user_reference: currentUserId(request),
    meter_id: request.body.meter_id,
  });
  const grpcResponse = await request.server.grpcClients.registration.reverifyRegistration(
    grpcRequest,
    grpcDeadlinesMs.registrationReverify,
  );

  return mapReverifyRegistrationResponse(grpcResponse);
}