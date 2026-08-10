-- migrate:up

ALTER TABLE public.app_clubs ADD COLUMN IF NOT EXISTS tagline TEXT;
ALTER TABLE public.app_clubs ADD COLUMN IF NOT EXISTS cover_image_url TEXT;
ALTER TABLE public.app_clubs ADD COLUMN IF NOT EXISTS vibe_tag TEXT;

-- migrate:down

ALTER TABLE public.app_clubs DROP COLUMN IF EXISTS vibe_tag;
ALTER TABLE public.app_clubs DROP COLUMN IF EXISTS cover_image_url;
ALTER TABLE public.app_clubs DROP COLUMN IF EXISTS tagline;
