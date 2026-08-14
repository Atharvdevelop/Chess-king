-- 1. Add is_banned, rating, and bio to profiles and players tables
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'is_banned'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN is_banned boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'rating'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN rating integer DEFAULT 1200;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'bio'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN bio text DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'players' AND column_name = 'is_banned'
  ) THEN
    ALTER TABLE public.players ADD COLUMN is_banned boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'players' AND column_name = 'rating'
  ) THEN
    ALTER TABLE public.players ADD COLUMN rating integer DEFAULT 1200;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'players' AND column_name = 'bio'
  ) THEN
    ALTER TABLE public.players ADD COLUMN bio text DEFAULT '';
  END IF;
END $$;

-- 2. Create reports table for Fair Play & Cheat Incidents
CREATE TABLE IF NOT EXISTS public.reports (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id      uuid REFERENCES public.players(id) ON DELETE CASCADE,
  reporter_name    text NOT NULL,
  reported_id      uuid REFERENCES public.players(id) ON DELETE CASCADE,
  reported_name    text NOT NULL,
  game_id          uuid REFERENCES public.games(id) ON DELETE SET NULL,
  reason           text NOT NULL,
  details          text DEFAULT '',
  status           text NOT NULL DEFAULT 'pending',
  created_at       timestamptz DEFAULT NOW(),
  updated_at       timestamptz DEFAULT NOW()
);

-- RLS for reports table
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'reports' AND policyname = 'Anyone authenticated can create reports'
  ) THEN
    CREATE POLICY "Anyone authenticated can create reports" ON public.reports FOR INSERT TO public WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'reports' AND policyname = 'Reports readable by public'
  ) THEN
    CREATE POLICY "Reports readable by public" ON public.reports FOR SELECT TO public USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'reports' AND policyname = 'Reports updateable by system/admin'
  ) THEN
    CREATE POLICY "Reports updateable by system/admin" ON public.reports FOR UPDATE TO public USING (true);
  END IF;
END $$;

-- 3. Safely drop and recreate lobby_players view
DROP VIEW IF EXISTS public.lobby_players CASCADE;

CREATE VIEW public.lobby_players AS
SELECT p.id, p.username, p.status, p.last_seen, p.created_at, p.rating, p.bio, p.is_banned
FROM public.players p
WHERE (p.is_banned IS FALSE OR p.is_banned IS NULL)
  AND p.status != 'busy'
  AND p.last_seen > (NOW() - INTERVAL '30 seconds');
