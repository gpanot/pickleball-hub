# HCM Pickleball Hub

Smart pickleball session finder and analytics platform for Ho Chi Minh City. Built on top of Reclub data.

## Features

### For Players (Public)
- Smart session finder with map view and list view
- Filters: time slot, skill level, price, availability, perks
- Sort by cost/hour, fill rate, start time, or price
- "Best value" highlight showing cheapest available session
- Club directory with aggregated stats
- Individual club profiles with schedules and venue maps

### For Organizers (Access Code)
- Fill rate trends over 30 days
- Revenue estimation (daily/weekly)
- Competitive analysis: your pricing vs market average per time slot
- Algorithmic recommendations (underperforming sessions, scheduling gaps)

### For Venue Owners (Access Code)
- Court utilization heatmap (hour-by-hour)
- Dead hours identification
- Club performance breakdown
- Revenue per club
- Opportunity alerts

## Quick Start

### Prerequisites
- Node.js 20+
- PostgreSQL database (local or Railway)
- Python 3.10+ with `psycopg2-binary` (for the ingest script)

### Setup

```bash
cd pickleball-hub
npm install

# Copy env and set your DATABASE_URL
cp .env.example .env
# Edit .env with your PostgreSQL connection string

# Push schema to database
npx prisma db push

# Generate Prisma client
npx prisma generate

# Seed database from CSV (loads hcm_pickleball_today.csv)
npx tsx scripts/seed.ts

# Start dev server
npm run dev
```

Open http://localhost:3000

### Dashboard access codes
Codes are stored in the database and verified server-side. For local development you can create placeholder codes with `npm run db:demo-codes` (requires data in `clubs` and `venues` first).

## Data Pipeline

### Daily Ingest (Python)
```bash
export DATABASE_URL="postgresql://..."
pip install psycopg2-binary
python ingest.py
```

Scrapes all HCM pickleball sessions from Reclub API and upserts into PostgreSQL.

### Seed from CSV (TypeScript)
```bash
npx tsx scripts/seed.ts
```

Loads `hcm_pickleball_today.csv` into the database. Useful for local development.

## Tech Stack
- **Next.js 16** (App Router, Server Components)
- **Tailwind CSS**
- **Prisma** (PostgreSQL ORM)
- **Recharts** (dashboard charts)
- **Leaflet** + OpenStreetMap (maps)
- **Python** (data ingestion)

## Project Structure
```
pickleball-hub/
  src/
    app/            # Next.js pages and API routes
    components/     # Shared UI components
    lib/            # Database client, queries, utilities
    generated/      # Prisma generated client
  prisma/           # Schema and migrations
  scripts/          # Seed and utility scripts
  ingest.py         # Python scraper + DB writer
```
