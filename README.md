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
│   ├── routes/
│   │   └── v1/
│   │       ├── auth.ts           # Authentication routes
│   │       ├── orders.ts         # Order management routes
│   │       ├── trades.ts         # Trade history routes
│   │       ├── wallet.ts         # Wallet & transaction routes
│   │       ├── market.ts         # Market data routes
│   │       ├── devices.ts        # IoT device & dispatch routes
│   │       ├── notifications.ts  # Notification routes
│   │       └── profile.ts        # User profile routes
│   ├── plugins/                  # Fastify plugins
│   ├── config/                   # Configuration
│   ├── types/                    # TypeScript types
│   ├── app.ts                    # App setup & route registration
│   └── main.ts                   # Entry point
├── .env.example
├── package.json
└── tsconfig.json
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Installation

```bash
# Clone the repo
git clone https://github.com/p2p-energy-trading-platform/api-gateway.git
cd api-gateway

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env
```

### Running Locally

```bash
# Development (with hot reload)
npx tsx src/main.ts

# Build
npx tsc

# Production
node dist/main.js
```
