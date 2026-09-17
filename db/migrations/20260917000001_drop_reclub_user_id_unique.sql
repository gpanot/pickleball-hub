-- migrate:up

DROP INDEX IF EXISTS player_profiles_reclub_user_id_key;

-- migrate:down

CREATE UNIQUE INDEX IF NOT EXISTS player_profiles_reclub_user_id_key ON public.player_profiles(reclub_user_id);
