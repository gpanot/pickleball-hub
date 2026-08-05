-- RenameBaseCapacityToMinCapacity
-- Renames base_capacity → min_capacity to reflect the new UX model:
-- "Capacity" (capacity_ceiling) = the ceiling / full point (what triggers waitlist).
-- "Min start" (min_capacity)    = the opening tier max_players is initialised to.
-- max_players always equals the *current* tier so players see n/<current_tier>.

ALTER TABLE "club_sessions"
  RENAME COLUMN "base_capacity" TO "min_capacity";
