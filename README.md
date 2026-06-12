# Wheelchair Service — R1 Super App

Wheelchair assistance request management for **Ahmedabad Junction**.
Part of the R1 Super App platform.

---

## Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
# Edit .env with your PostgreSQL credentials and JWT secret
```

### 3. Create the database
```sql
CREATE DATABASE r1_wheelchair_db;
```

### 4. Run migrations
```bash
npm run migrate
```

### 5. Start the server
```bash
# Development (with auto-reload)
npm run dev

# Production
npm start
```

Server runs on **http://localhost:4003**

| Path | Description |
|------|-------------|
| `GET /health` | Health check |
| `GET /docs` | Swagger UI |

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `4003` | HTTP port |
| `NODE_ENV` | `development` | Environment |
| `DB_HOST` | `localhost` | PostgreSQL host |
| `DB_PORT` | `5432` | PostgreSQL port |
| `DB_NAME` | `r1_wheelchair_db` | Database name |
| `DB_USER` | `postgres` | DB username |
| `DB_PASSWORD` | `postgres` | DB password |
| `JWT_SECRET` | — | **Required.** Shared with auth service |
| `JWT_ISSUER` | `r1-auth-service` | JWT issuer claim |
| `LOG_LEVEL` | `info` | winston log level |

---

## API Reference

All endpoints require a valid JWT in the `Authorization: Bearer <token>` header.

### Passenger Endpoints (`TOURIST` role)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/wheelchair/request` | Create a new wheelchair request |
| `GET` | `/api/wheelchair/my-requests` | View your own requests |
| `GET` | `/api/wheelchair/:id` | View a specific request |
| `PATCH` | `/api/wheelchair/:id/cancel` | Cancel a PENDING request |

**Create request body** (all fields optional):
```json
{
  "passenger_name":       "Ravi Mehta",
  "passenger_phone":      "+919876543210",
  "station_code":         "ADI",
  "platform_number":      "3",
  "pickup_location":      "Main Entrance Gate",
  "destination_location": "Platform 3",
  "accessibility_notes":  "Manual wheelchair, needs ramp access"
}
```

---

### Attendant Endpoints (`WHEELCHAIR_ATTENDANT` role)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/wheelchair/open-requests` | View all PENDING requests |
| `PATCH` | `/api/wheelchair/:id/accept` | Accept a request |
| `PATCH` | `/api/wheelchair/:id/status` | Update status |
| `PATCH` | `/api/wheelchair/:id/complete` | Mark as completed |
| `GET` | `/api/wheelchair/:id` | View any request |

**Update status body:**
```json
{
  "status": "IN_PROGRESS",
  "note":   "En route to pickup location"
}
```

---

### Admin / Staff Endpoints (`ADMIN` or `STATION_STAFF` role)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/wheelchair/all` | View all requests |

---

## Request Lifecycle

```
PENDING ──► ACCEPTED ──► IN_PROGRESS ──► COMPLETED
   │
   └──► CANCELLED  (passenger only, PENDING requests only)
```

| Transition | Who |
|-----------|-----|
| `PENDING → ACCEPTED` | Attendant (accept endpoint) |
| `ACCEPTED → IN_PROGRESS` | Attendant (status endpoint) |
| `IN_PROGRESS → COMPLETED` | Attendant (complete endpoint) |
| `PENDING → CANCELLED` | Passenger (cancel endpoint) |

Invalid transitions return `409 Conflict` with a descriptive message.

---

## Running Tests

```bash
npm test
```

Tests use mocked PostgreSQL — no live database needed.

```bash
# With coverage report
npm test -- --coverage
```

---

## Project Structure

```
wheelchair-service/
├── package.json
├── .env.example
├── README.md
├── jest.config.js
├── migrations/
│   ├── 001_create_wheelchair_requests.sql
│   ├── 002_create_wheelchair_request_audit.sql
│   └── run_migrations.js
├── tests/
│   └── wheelchair.test.js
└── src/
    ├── app.js                          # Express app setup, Swagger, routes
    ├── server.js                       # Entry point, DB check, graceful shutdown
    ├── config/
    │   ├── env.js                      # Environment config
    │   └── db.js                       # pg Pool instance
    ├── controllers/
    │   └── wheelchair.controller.js    # Thin HTTP handlers
    ├── middleware/
    │   ├── auth.middleware.js          # JWT verification
    │   ├── role.middleware.js          # Role-based access control
    │   ├── validate.middleware.js      # Zod schema validation
    │   └── error.middleware.js         # Global error + 404 handler
    ├── models/
    │   └── wheelchair.model.js         # Raw SQL queries
    ├── routes/
    │   └── wheelchair.routes.js        # Route definitions + Swagger JSDoc
    ├── services/
    │   ├── wheelchair.service.js       # Business logic, orchestration
    │   └── wheelchair-status.service.js # State machine rules
    ├── utils/
    │   ├── constants.js                # Statuses, roles, transitions
    │   ├── logger.js                   # Winston logger
    │   └── response.js                 # Standardised JSON responses
    └── validators/
        └── wheelchair.schemas.js       # Zod schemas
```

---

## Demo Postman Flow

1. **Get a token** from the auth service for a `TOURIST` user
2. `POST /api/wheelchair/request` — create a request
3. Copy the `id` from the response
4. Switch to an `WHEELCHAIR_ATTENDANT` token
5. `GET /api/wheelchair/open-requests` — see the new request
6. `PATCH /api/wheelchair/{id}/accept` — accept it
7. `PATCH /api/wheelchair/{id}/status` `{ "status": "IN_PROGRESS" }`
8. `PATCH /api/wheelchair/{id}/complete`
9. Switch back to the `TOURIST` token
10. `GET /api/wheelchair/my-requests` — see the completed request

---

## Notes

- **No Kafka, no Redis** — this is a clean, demo-friendly MVP
- Audit log writes are fire-and-forget (a failed audit will not break the request)
- If `passenger_name` is not provided in the request body, the name from the JWT is used
- Swagger docs are available at `/docs` with try-it-out support
