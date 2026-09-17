-- Drop the unique constraint on reclub_user_id so multiple profiles can link the same Reclub account
DROP INDEX IF EXISTS "player_profiles_reclub_user_id_key";
