import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FastifyInstance } from 'fastify';

//Import registration handlers here

//Import registration schemas here


export async function registerRegistrationRoutes(app: FastifyInstance): Promise<void> {

    const router = app.withTypeProvider<TypeBoxTypeProvider>();

    //POST: Initiate meter claim

    //GET: Get registration status

    //POST: validate device association

    //POST: Reverfy registration

}