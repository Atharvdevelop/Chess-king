-- ====================================================================
-- CHESS KING DATABASE CLEANUP & UNIFICATION SCRIPT
-- Run this script in your Supabase SQL Editor (SQL Editor -> New Query -> Run)
-- ====================================================================

-- 1. Ensure profiles table has all necessary status, last_seen & rating fields
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'online',
ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS rating INTEGER DEFAULT 1200,
ADD COLUMN IF NOT EXISTS bio TEXT DEFAULT '';

-- 2. Migrate any missing user records from legacy 'players' into 'profiles'
INSERT INTO public.profiles (id, username, created_at, last_seen, status, is_banned, rating, bio)
SELECT 
  id, 
  username, 
  created_at, 
  COALESCE(last_seen, NOW()), 
  COALESCE(status, 'online'), 
  COALESCE(is_banned, false), 
  COALESCE(rating, 1200), 
  COALESCE(bio, '')
FROM public.players
ON CONFLICT (id) DO UPDATE 
SET 
  username = EXCLUDED.username,
  rating = COALESCE(profiles.rating, EXCLUDED.rating);

-- 3. Drop dependent views first so we can safely update references
DROP VIEW IF EXISTS public.lobby_players CASCADE;
DROP VIEW IF EXISTS public.currently_playing CASCADE;

-- 4. Update foreign keys in 'games' to point to 'profiles' instead of legacy 'players'
ALTER TABLE public.games DROP CONSTRAINT IF EXISTS games_white_player_id_fkey;
ALTER TABLE public.games DROP CONSTRAINT IF EXISTS games_black_player_id_fkey;

ALTER TABLE public.games
ADD CONSTRAINT games_white_player_id_fkey FOREIGN KEY (white_player_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
ADD CONSTRAINT games_black_player_id_fkey FOREIGN KEY (black_player_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- 5. Drop legacy redundant 'players' table and replace with a unified VIEW
DROP TABLE IF EXISTS public.players CASCADE;

CREATE VIEW public.players AS 
SELECT 
  id,
  username,
  created_at,
  COALESCE(last_seen, NOW()) AS last_seen,
  COALESCE(status, 'online') AS status,
  COALESCE(is_banned, false) AS is_banned,
  COALESCE(rating, 1200) AS rating,
  COALESCE(bio, '') AS bio
FROM public.profiles;

GRANT SELECT ON public.players TO public;

-- 6. Re-create clean views for active lobby players and active matches
CREATE OR REPLACE VIEW public.lobby_players AS
SELECT p.id, p.username, p.created_at, p.last_seen, p.status
FROM public.profiles p
WHERE p.status != 'busy'
  AND p.last_seen > (NOW() - INTERVAL '60 seconds');

GRANT SELECT ON public.lobby_players TO public;

CREATE OR REPLACE VIEW public.currently_playing AS
SELECT g.id AS game_id, g.white_player_username AS white_player, g.black_player_username AS black_player, g.status
FROM public.games g
WHERE g.status = 'active' AND g.black_player_id IS NOT NULL;

GRANT SELECT ON public.currently_playing TO public;

-- 7. Add automated cleanup function for stale matchmaking queue rows
CREATE OR REPLACE FUNCTION clean_stale_matchmaking_queue() 
RETURNS void AS $$
BEGIN
  DELETE FROM public.matchmaking_queue 
  WHERE created_at < NOW() - INTERVAL '2 minutes' 
    AND game_id IS NULL;
END;
$$ LANGUAGE plpgsql;
