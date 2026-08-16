# GridX API Gateway

The Fastify API Gateway for the GridX P2P Energy Trading Platform. This service acts as the single entry point for all client requests from the web dashboard and mobile app, routing them to the appropriate microservices.

---

## Overview

```text
Client (Web / Mobile)
        │
        ▼
Fastify API Gateway  ← This service
        │
        ├── Auth Service
        ├── Order Management Service
        ├── Trade Service
        ├── Wallet Service
        ├── Market Ticker Service
        ├── IoT Ingest & Dispatch Service
        ├── Notification Service
        └── User / Profile Service
```

---

## Tech Stack

| Tool | Purpose |
|---|---|
| [Fastify](https://fastify.dev/) | HTTP framework |
| [TypeScript](https://www.typescriptlang.org/) | Language |

---

## Project Structure

```text
api-gateway/
├── src/
│   ├── app.ts
│   ├── main.ts
│   │
│   ├── config/
│   │   ├── env.ts
│   │   ├── schema.ts
│   │   └── types.ts
│   │
│   ├── plugins/
│   │   ├── authentication.ts
│   │   ├── authorization.ts
│   │   ├── cors.ts
│   │   ├── grpc.ts
│   │   ├── kafka.ts
│   │   ├── observability.ts
│   │   ├── rate-limit.ts
│   │   ├── redis.ts
│   │   ├── security.ts
│   │   └── websocket.ts
│   │
│   ├── transport/
│   │   ├── grpc/
│   │   │   ├── credentials.ts
│   │   │   ├── deadlines.ts
│   │   │   ├── metadata.ts
│   │   │   ├── errors.ts
│   │   │   └── clients/
│   │   │       ├── auth.client.ts
│   │   │       ├── order.client.ts
│   │   │       ├── trade.client.ts
│   │   │       ├── wallet.client.ts
│   │   │       ├── market.client.ts
│   │   │       ├── device.client.ts
│   │   │       └── notification.client.ts
│   │   ├── kafka/
│   │   │   ├── consumer.ts
│   │   │   ├── topics.ts
│   │   │   ├── schemas.ts
│   │   │   └── event-router.ts
│   │   └── redis/
│   │       ├── client.ts
│   │       ├── keys.ts
│   │       └── scripts/
│   │           └── rate-limit.lua
│   │
│   ├── features/
│   │   ├── auth/
│   │   │   ├── routes.ts
│   │   │   ├── schemas.ts
│   │   │   ├── handler.ts
│   │   │   └── mapper.ts
│   │   ├── users/
│   │   │   ├── routes.ts
│   │   │   ├── schemas.ts
│   │   │   ├── handler.ts
│   │   │   └── mapper.ts
│   │   ├── orders/
│   │   │   ├── routes.ts
│   │   │   ├── schemas.ts
│   │   │   ├── handler.ts
│   │   │   └── mapper.ts
│   │   ├── trades/
│   │   ├── wallet/
│   │   ├── market/
│   │   ├── devices/
│   │   ├── notifications/
│   │   └── dashboard/
│   │
│   ├── websocket/
│   │   ├── connection.ts
│   │   ├── protocol.ts
│   │   ├── schemas.ts
│   │   ├── subscriptions.ts
│   │   ├── authorization.ts
│   │   ├── heartbeat.ts
│   │   └── event-delivery.ts
│   │
│   ├── policies/
│   │   ├── route-auth.ts
│   │   ├── permissions.ts
│   │   ├── rate-limits.ts
│   │   ├── idempotency.ts
│   │   └── timeouts.ts
│   │
│   ├── errors/
│   │   ├── app-error.ts
│   │   ├── codes.ts
│   │   ├── error-handler.ts
│   │   └── grpc-to-http.ts
│   │
│   ├── observability/
│   │   ├── logging.ts
│   │   ├── metrics.ts
│   │   ├── tracing.ts
│   │   └── redaction.ts
│   │
│   ├── health/
│   │   ├── routes.ts
│   │   ├── liveness.ts
│   │   └── readiness.ts
│   │
│   ├── common/
│   │   ├── request-context.ts
│   │   ├── pagination.ts
│   │   ├── validation.ts
│   │   └── types.ts
│   │
│   └── types/
│       ├── fastify.d.ts
│       ├── authentication.ts
│       └── websocket.ts
│
├── test/
│   ├── unit/
│   ├── integration/
│   ├── contract/
│   ├── security/
│   ├── load/
│   ├── fixtures/
│   ├── helpers/
│   └── setup.ts
│
├── scripts/
│   ├── check-config.ts
│   └── generate-openapi.ts
│
├── docs/  # Unsure if necessary
│   ├── openapi/
│   ├── websocket-protocol.md
│   └── runbooks/
│
├── Dockerfile
├── docker-compose.yml
├── .env.example
├── eslint.config.js
├── package.json
├── tsconfig.json
└── README.md
```

---

## Getting Started

### Prerequisites

- Node.js 24
- npm

### Installation

API Gateway is bootstrapped to gridx-workspace docker-compose.root.yml.

```bash
# Install dependencies
npm ci

# Copy environment variables
cp .env.example .env
```

### Running Locally (without docker and infra load)

```bash
# Development (with hot reload)
npm run dev

# Build
npm run build

# Production build (local)
npm run start
```

### Running inside infra container

Switch to `gridx-workspace` folder

In arch & Fedora:

```bash
go-task up
```

In Other Operating systems:

```bash
task up
```
