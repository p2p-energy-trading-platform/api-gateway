import { createClient, type Client, type Transport } from '@connectrpc/connect'
import { DeviceRegistrationService } from '@p2p-energy-trading-platform/typescript-sdk/gen/gridx/iot/v1/iot_pb';
import { DEFAULT_GRPC_TIMEOUT_MS } from '../deadlines.js';
import { toAppError } from '../errors.js';



export class RegistrationGrpcClient {

    private readonly client: Client<typeof DeviceRegistrationService>;
    private readonly defaultTimeoutMs: number;

    constructor(
        transport: Transport,
        defaultTimeoutMs = DEFAULT_GRPC_TIMEOUT_MS,
    ){

        this.client = createClient(DeviceRegistrationService, transport);
        this.defaultTimeoutMs = defaultTimeoutMs;

    }


    // 1. Initiate meter claim
    async initiateMeterClaim(
        params: Parameters<Client<typeof DeviceRegistrationService>['initiateMeterClaim']>[0],
        timeoutMs = this.defaultTimeoutMs,
    ){

        try {

            return await this.client.initiateMeterClaim(params, { timeoutMs });

        }catch(err) {

            throw toAppError(err);
        
        }

    }


    // 2. Get registration status
    async getRegistrationStatus(
        params: Parameters<Client<typeof DeviceRegistrationService>['getRegistrationStatus']>[0],
        timeoutMs = this.defaultTimeoutMs,
    ){

        try {

            return await this.client.getRegistrationStatus(params, { timeoutMs });
        
        } catch (err) {

            throw toAppError(err);

        }

    }


    // 3. Validate device association
    async validateDeviceAssociation(
        params: Parameters<Client<typeof DeviceRegistrationService>['validateDeviceAssociation']>[0],
        timeoutMs = this.defaultTimeoutMs,
    ) {

        try {

            return await this.client.validateDeviceAssociation(params, { timeoutMs });
        
        } catch (err) {

            throw toAppError(err);

        }

    }


    // 4. Reverify registration
    async reverifyRegistration(
        params: Parameters<Client<typeof DeviceRegistrationService>['reverifyRegistration']>[0],
        timeoutMs = this.defaultTimeoutMs,
    ) {

        try {

            return await this.client.reverifyRegistration(params, { timeoutMs });
        
        } catch (err) {

            throw toAppError(err);

        }
        
    }

}