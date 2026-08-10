-- migrate:up

ALTER TABLE public.app_clubs ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE public.app_clubs ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE public.app_clubs ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

CREATE INDEX IF NOT EXISTS app_clubs_lat_lng_idx ON public.app_clubs (latitude, longitude);

-- migrate:down

DROP INDEX IF EXISTS app_clubs_lat_lng_idx;
ALTER TABLE public.app_clubs DROP COLUMN IF EXISTS longitude;
ALTER TABLE public.app_clubs DROP COLUMN IF EXISTS latitude;
ALTER TABLE public.app_clubs DROP COLUMN IF EXISTS city;
