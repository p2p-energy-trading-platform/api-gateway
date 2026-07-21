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
| [@fastify/jwt](https://github.com/fastify/fastify-jwt) | JWT authentication |
| [@fastify/cors](https://github.com/fastify/fastify-cors) | CORS handling |
| [@fastify/helmet](https://github.com/fastify/fastify-helmet) | Security headers |

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

### Environment Variables

| Variable | Description | Default |
|---|---|---|
| `PORT` | Port the server listens on | `3000` |
| `JWT_SECRET` | Secret key for JWT signing | — |
| `NODE_ENV` | Environment | `development` |

### Running Locally

```bash
# Development (with hot reload)
npx tsx src/main.ts

# Build
npx tsc

# Production
node dist/main.js
```

---

## API Routes

**Base URL:** `http://localhost:3000/api/v1`

### Health Check

```
GET /health
```

### Authentication

| Method | Route | Description |
|---|---|---|
| `POST` | `/auth/register` | Register a new user account |
| `POST` | `/auth/login` | Sign in and receive JWT tokens |
| `POST` | `/auth/refresh` | Refresh an expired access token |
| `POST` | `/auth/logout` | Revoke refresh token and end session |

### Orders

| Method | Route | Description |
|---|---|---|
| `POST` | `/orders` | Place a new buy or sell order |
| `GET` | `/orders` | List all orders for the authenticated user |
| `GET` | `/orders/:orderId` | Get details of a specific order |
| `DELETE` | `/orders/:orderId` | Cancel an open order |

### Trades

| Method | Route | Description |
|---|---|---|
| `GET` | `/trades` | List all completed trades |
| `GET` | `/trades/:tradeId` | Get details of a specific trade |

### Wallet

| Method | Route | Description |
|---|---|---|
| `GET` | `/wallet` | Get wallet balance |
| `GET` | `/wallet/transactions` | Get transaction history |
| `POST` | `/wallet/deposit` | Deposit funds |
| `POST` | `/wallet/withdraw` | Withdraw funds |

### Market Data

| Method | Route | Description |
|---|---|---|
| `GET` | `/market/orderbook` | Get current order book for a delivery slot |
| `GET` | `/market/prices` | Get recent market price history |
| `GET` | `/market/candles` | Get candlestick chart data |

### IoT Devices & Dispatch

| Method | Route | Description |
|---|---|---|
| `GET` | `/devices` | List all connected devices |
| `GET` | `/devices/:deviceId` | Get real-time status of a specific device |
| `POST` | `/devices/dispatch` | Send a dispatch command to an energy asset |

### Notifications

| Method | Route | Description |
|---|---|---|
| `GET` | `/notifications` | Get all notifications |
| `PATCH` | `/notifications/read-all` | Mark all notifications as read |
| `PATCH` | `/notifications/:notificationId/read` | Mark a single notification as read |
| `GET` | `/notifications/preferences` | Get notification preferences |
| `PATCH` | `/notifications/preferences` | Update notification preferences |

### User Profile

| Method | Route | Description |
|---|---|---|
| `GET` | `/users/me` | Get authenticated user's profile |
| `PATCH` | `/users/me` | Update profile information |
| `PATCH` | `/users/me/password` | Update password |
| `GET` | `/users/me/preferences` | Get trading preferences |
| `PATCH` | `/users/me/preferences` | Update trading preferences |

---

## Authentication

All routes except `/auth/register`, `/auth/login`, and `/health` require a valid JWT Bearer token.

```
Authorization: Bearer <access_token>
```

Tokens are issued by the Auth Service using RS256 signing. Access tokens expire after 15 minutes. Use `/auth/refresh` with a valid refresh token to obtain a new access token.

---

## Status

> **Note:** All routes currently return `501 Not Implemented`. Implementation will begin in Weeks 10–13 per the project timeline.

| Route Group | Status |
|---|---|
| Auth | 🔴 Not implemented |
| Orders | 🔴 Not implemented |
| Trades | 🔴 Not implemented |
| Wallet | 🔴 Not implemented |
| Market | 🔴 Not implemented |
| Devices | 🔴 Not implemented |
| Notifications | 🔴 Not implemented |
| Profile | 🔴 Not implemented |

---

## Related Repositories

| Repo | Description |
|---|---|
| [docs](https://github.com/p2p-energy-trading-platform/docs) | Project documentation |
| [iot-simulation](https://github.com/p2p-energy-trading-platform/iot-simulation) | IoT smart meter simulator |
| [gridx-infra](https://github.com/p2p-energy-trading-platform/gridx-infra) | Docker infrastructure |
| [protobuf](https://github.com/p2p-energy-trading-platform/protobuf) | Protobuf contracts & SDK generation |
