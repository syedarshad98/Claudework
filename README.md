# OpsCommand — Manufacturing Intelligence Dashboard

A full-stack manufacturing operations dashboard for C-suite executives.

## Stack

| Layer    | Tech                              |
|----------|-----------------------------------|
| Frontend | Vanilla HTML/CSS/JS + Fetch API   |
| Backend  | Node.js + Express                 |
| Database | SQLite via `better-sqlite3`       |
| Realtime | Server-Sent Events (SSE)          |

## Project Structure

```
manufacturing-dashboard/
├── backend/
│   ├── db/
│   │   ├── schema.sql        # Table definitions
│   │   ├── seed.js           # Populates DB with realistic data
│   │   └── database.js       # SQLite connection
│   ├── routes/
│   │   ├── kpi.js            # GET /api/kpi
│   │   ├── production.js     # GET /api/production/hourly
│   │   ├── machines.js       # GET /api/machines
│   │   ├── workorders.js     # GET /api/workorders
│   │   ├── inventory.js      # GET /api/inventory
│   │   ├── quality.js        # GET /api/quality
│   │   └── alerts.js         # GET /api/alerts  +  GET /api/alerts/stream (SSE)
│   ├── server.js             # Express app
│   └── package.json
├── frontend/
│   ├── index.html
│   ├── css/styles.css
│   └── js/dashboard.js
└── README.md
```

## Quick Start

```bash
cd backend
npm install
npm run seed      # Creates manufacturing.db and populates it
npm start         # Server starts at http://localhost:3000
```

Open **http://localhost:3000** — the frontend is served as static files by Express.

For development with auto-reload:
```bash
npm run dev
```

## API Endpoints

| Method | Endpoint                 | Description                          |
|--------|--------------------------|--------------------------------------|
| GET    | `/api/kpi`               | All KPI card values                  |
| GET    | `/api/production/hourly` | Today + yesterday hourly output      |
| GET    | `/api/machines`          | All 12 machines with status + uptime |
| GET    | `/api/workorders`        | Work orders with progress + status   |
| GET    | `/api/inventory`         | Inventory levels with alert flags    |
| GET    | `/api/quality`           | Defect breakdown + pass rate         |
| GET    | `/api/alerts`            | All active alerts (initial load)     |
| GET    | `/api/alerts/stream`     | SSE stream — pushes a new alert ~12s |

## Updating Data

Edit `backend/db/manufacturing.db` directly with any SQLite client, or modify
`backend/db/seed.js` and re-run `npm run seed` to reset to fresh values.
