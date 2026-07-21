# Contributing

## Database migrations

We use **dbmate** to manage migrations. Prisma Client (`@prisma/client`) is still used for all queries — only the migration runner changed from `prisma migrate` to dbmate.

### First-time local setup

1. Install dbmate:
   ```bash
   brew install dbmate
   ```
2. Copy `.env.example` to `.env` and set `DATABASE_URL` for your local Postgres instance:
   ```
   DATABASE_URL="postgresql://YOUR_USER@localhost:5432/pickleball_hub?sslmode=disable"
   ```
   Do **not** use `?schema=public` — dbmate doesn't understand it.
3. Create the local database if it doesn't exist:
   ```bash
   createdb pickleball_hub
   ```
4. Apply all migrations:
   ```bash
   npm run db:migrate
   ```
5. Generate Prisma Client:
   ```bash
   npx prisma generate
   ```

### Adding a migration

1. Create the migration file:
   ```bash
   npm run db:migrate:new -- add_my_feature
   # → db/migrations/YYYYMMDDHHMMSS_add_my_feature.sql
   ```
2. Open the generated file and write your SQL:
   ```sql
   -- migrate:up
   ALTER TABLE foo ADD COLUMN bar TEXT;

   -- migrate:down
   ALTER TABLE foo DROP COLUMN bar;
   ```
3. Update `prisma/schema.prisma` to match.
4. Regenerate Prisma Client:
   ```bash
   npx prisma generate
   ```
5. Apply locally:
   ```bash
   npm run db:migrate
   ```

**Tip — let Prisma generate the SQL diff for you:**
```bash
npx prisma migrate diff \
  --from-url "$DATABASE_URL" \
  --to-schema-datamodel prisma/schema.prisma \
  --script
# Paste the output into your -- migrate:up block
```

### Useful commands

| Command | What it does |
|---|---|
| `npm run db:migrate` | Apply all pending migrations |
| `npm run db:migrate:status` | Show applied and pending migrations |
| `npm run db:migrate:new` | Create a new migration file |
| `npm run db:migrate:down` | Roll back the most recent migration |
| `npm run db:migrate:dump` | Update `db/schema.sql` with current schema |

### What NOT to do

- **Never run `prisma migrate dev`** — Prisma's migration runner is no longer used.
- **Never run `prisma migrate deploy`** — replaced by `dbmate up` in Railway and locally.
- **Never run `prisma db push`** — it applies schema changes without recording a migration, which caused the drift we migrated away from. It has been removed from `package.json`.

### How deploys work

Railway runs `dbmate up` automatically before starting Next.js (see `railway.toml`). No manual step is needed on deploy — just push and dbmate handles it.

### Upgrading dbmate

The Railway deploy pins dbmate at a specific version (`v2.33.0` as of 2026-07-06). To upgrade:
1. Test the new version locally: `brew upgrade dbmate && dbmate status`
2. Update the version string in `railway.toml` under `[build.nixpacksPlan.phases.install]`
3. Deploy and verify
