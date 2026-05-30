/*
  # Fix: Create missing views and add status column

  The GameLobby component queries two views that were never created:
    - lobby_players   (used by getLobbyPlayers)
    - currently_playing  (used by getActiveMatches)

  Also adds the `status` column to the players table that the app code
  expects but the original migration never included.
*/

-- ── 1. Add missing columns to players ──────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'players' AND column_name = 'status'
  ) THEN
    ALTER TABLE players ADD COLUMN status text NOT NULL DEFAULT 'online';
  END IF;
END $$;

-- ── 2. lobby_players view ───────────────────────────────────────────────────
-- Returns players who are:
--   • seen in the last 30 seconds (actively heartbeating)
--   • not marked as 'busy' (already in a game)
-- The GameLobby filters out the current user client-side via .neq('id', profileId)

CREATE OR REPLACE VIEW public.lobby_players AS
SELECT
  p.id,
  p.username,
  p.created_at,
  p.last_seen,
  p.status
FROM public.players p
WHERE
  p.status    != 'busy'
  AND p.last_seen > (NOW() - INTERVAL '30 seconds');

-- Everyone can read the lobby (RLS is on the underlying table)
GRANT SELECT ON public.lobby_players TO public;

-- ── 3. currently_playing view ───────────────────────────────────────────────
-- Returns all active games with both player usernames resolved.

CREATE OR REPLACE VIEW public.currently_playing AS
SELECT
  g.id                    AS game_id,
  g.white_player_username AS white_player,
  g.black_player_username AS black_player,
  g.status
FROM public.games g
WHERE g.status = 'active'
  AND g.black_player_id IS NOT NULL;

GRANT SELECT ON public.currently_playing TO public;

-- ── 4. Ensure heartbeat interval is realistic ───────────────────────────────
-- The React app calls updateHeartbeat every 10 s.
-- The view above uses a 30 s window — wide enough for 2 missed beats.
-- If you want a longer "online" window, change the INTERVAL above.
-- The HTML pages in /pages also call upsert with status='online' on load,
-- which also refreshes last_seen, so hybrid users are covered.
