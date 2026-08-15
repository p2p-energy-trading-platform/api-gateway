import type { FastifyInstance } from 'fastify'

export async function getReadiness(
    app: FastifyInstance,
): Promise<{
    ready: boolean
    dependencies: {
        redis: 'up' | 'down'
    }
}> {
    try {
        const result = await app.redis.ping()

        const redisReady = result === 'PONG'

        return {
            ready: redisReady,
            dependencies: {
                redis: redisReady ? 'up' : 'down',
            },
        }
    } catch {
        return {
            ready: false,
            dependencies: {
                redis: 'down',
            },
        }
    }
}