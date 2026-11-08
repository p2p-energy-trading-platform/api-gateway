// 1) POST: Initiate meter claim
// HTTP Request → gRPC Request
export function mapInitiateMeterClaimRequest(body: { user_reference: string; meter_id: string }) {
  return {
    userReference: body.user_reference,
    meterId: body.meter_id,
  };
}

// gRPC Response → HTTP Response
export function mapInitiateMeterClaimResponse(response: {
  registrationId: string;
  status: string;
  message: string;
}) {
  return {
    registration_id: response.registrationId,
    status: response.status,
    message: response.message,
  };
}

// 2) GET: Get registration status
// HTTP Request → gRPC Request
export function mapGetRegistrationStatusRequest(params: { registrationId: string }) {
  return {
    registrationId: params.registrationId,
  };
}

// gRPC Response → HTTP Response
export function mapGetRegistrationStatusResponse(response: {
  registrationId: string;
  meterId: string;
  approvalStatus: string;
}) {
  return {
    registration_id: response.registrationId,
    meter_id: response.meterId,
    approval_status: response.approvalStatus,
  };
}

// 3) POST: validate device association
// HTTP Request → gRPC Request
export function mapValidateDeviceAssociationRequest(body: { meter_id: string }) {
  return {
    meterId: body.meter_id,
  };
}

// gRPC Response → HTTP Response
export function mapValidateDeviceAssociationResponse(response: {
  isRegistered: boolean;
  primaryUserId: string;
}) {
  return {
    is_registered: response.isRegistered,
    primary_user_id: response.primaryUserId,
  };
}

// 4) POST: Reverify registration
// HTTP Request → gRPC Request
export function mapReverifyRegistrationRequest(body: {
  registration_id: string;
  user_reference: string;
  meter_id: string;
}) {
  return {
    registrationId: body.registration_id,
    userReference: body.user_reference,
    meterId: body.meter_id,
  };
}

// gRPC Response → HTTP Response
export function mapReverifyRegistrationResponse(response: {
  registrationId: string;
  meterId: string;
  message: string;
  status: string;
}) {
  return {
    registration_id: response.registrationId,
    meter_id: response.meterId,
    message: response.message,
    status: response.status,
  };
}
