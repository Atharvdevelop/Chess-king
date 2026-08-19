// Ambient declaration so VS Code's Node/React TS server recognizes Deno globals
declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
  serve(handler: (req: Request) => Promise<Response>): void;
};

// @ts-ignore - URL import resolved by Deno/Supabase at runtime
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-admin-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface ProfileRow {
  id: string;
  username: string;
  created_at: string;
  is_banned?: boolean;
  rating?: number;
  bio?: string;
}

interface AuthUserRow {
  id: string;
  email?: string;
  created_at: string;
  last_sign_in_at?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const expectedSecret = Deno.env.get('CHESS_KING_ADMIN_SECRET') ?? 'change-me';

  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: 'Server misconfiguration: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing.' }, 500);
  }

  const adminSecret = req.headers.get('x-admin-secret');
  if (!adminSecret || adminSecret !== expectedSecret) {
    return json({ error: 'Unauthorized — wrong admin secret' }, 401);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const { action } = body;

  // 1. LIST USERS
  if (action === 'list_users') {
    const { data: authData, error: authErr } = await adminClient.auth.admin.listUsers({ perPage: 500 });
    if (authErr) return json({ error: authErr.message }, 500);

    const { data: profiles, error: profErr } = await adminClient
      .from('profiles')
      .select('id, username, created_at, is_banned, rating, bio');
    if (profErr) return json({ error: profErr.message }, 500);

    const profileMap = new Map((profiles as ProfileRow[] ?? []).map((p: ProfileRow) => [p.id, p]));

    const users = ((authData.users as AuthUserRow[]) ?? []).map((u: AuthUserRow) => {
      const p = profileMap.get(u.id);
      return {
        id: u.id,
        email: u.email ?? '—',
        username: p?.username ?? '—',
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at ?? null,
        is_banned: p?.is_banned ?? false,
        rating: p?.rating ?? 1200,
        bio: p?.bio ?? '',
      };
    });
    return json({ users });
  }

  // 2. PLATFORM OVERVIEW STATS
  if (action === 'get_platform_stats') {
    const { count: totalUsers } = await adminClient.from('profiles').select('*', { count: 'exact', head: true });
    const { count: onlinePlayers } = await adminClient.from('profiles').select('*', { count: 'exact', head: true }).gt('last_seen', new Date(Date.now() - 30000).toISOString());
    const { count: totalGames } = await adminClient.from('games').select('*', { count: 'exact', head: true });
    const { count: activeGames } = await adminClient.from('games').select('*', { count: 'exact', head: true }).eq('status', 'active');
    const { count: bannedCount } = await adminClient.from('profiles').select('*', { count: 'exact', head: true }).eq('is_banned', true);
    const { count: pendingReports } = await adminClient.from('reports').select('*', { count: 'exact', head: true }).eq('status', 'pending');

    return json({
      stats: {
        totalUsers: totalUsers ?? 0,
        onlinePlayers: onlinePlayers ?? 0,
        totalGames: totalGames ?? 0,
        activeGames: activeGames ?? 0,
        bannedCount: bannedCount ?? 0,
        pendingReports: pendingReports ?? 0,
      }
    });
  }

  // 3. USER DETAILS (Stats & Match History)
  if (action === 'get_user_details') {
    const { userId } = body;
    if (!userId) return json({ error: 'userId is required' }, 400);

    const { data: profile, error: profErr } = await adminClient.from('profiles').select('*').eq('id', userId).maybeSingle();
    if (profErr) return json({ error: profErr.message }, 500);

    // Fetch recent matches (last 50)
    const { data: games, error: gamesErr } = await adminClient
      .from('games')
      .select('*')
      .or(`white_player_id.eq.${userId},black_player_id.eq.${userId}`)
      .order('created_at', { ascending: false })
      .limit(50);
    if (gamesErr) return json({ error: gamesErr.message }, 500);

    const matchHistory = (games || []).map((g: any) => {
      const isWhite = g.white_player_id === userId;
      const opponentName = isWhite ? (g.black_player_username || 'Opponent') : (g.white_player_username || 'Opponent');
      let result = 'PLAYING';
      if (g.status === 'finished') {
        if (g.winner === 'draw') result = 'DRAW';
        else if ((g.winner === 'white' && isWhite) || (g.winner === 'black' && !isWhite)) result = 'WIN';
        else result = 'LOSS';
      }
      return {
        id: g.id,
        opponent: opponentName,
        color: isWhite ? 'white' : 'black',
        result,
        time_format: g.time_format || '10+0',
        created_at: g.created_at,
        status: g.status,
      };
    });

    // Query lifetime finished games for accurate lifetime stats
    const { data: allFinishedGames, error: allGamesErr } = await adminClient
      .from('games')
      .select('white_player_id, black_player_id, winner')
      .or(`white_player_id.eq.${userId},black_player_id.eq.${userId}`)
      .eq('status', 'finished');

    let wins = 0;
    let losses = 0;
    let draws = 0;

    if (!allGamesErr && allFinishedGames) {
      for (const g of allFinishedGames) {
        const isWhite = g.white_player_id === userId;
        if (g.winner === 'draw') draws++;
        else if ((g.winner === 'white' && isWhite) || (g.winner === 'black' && !isWhite)) wins++;
        else if (g.winner) losses++;
      }
    } else {
      wins = matchHistory.filter((m: any) => m.result === 'WIN').length;
      losses = matchHistory.filter((m: any) => m.result === 'LOSS').length;
      draws = matchHistory.filter((m: any) => m.result === 'DRAW').length;
    }

    const totalFinished = wins + losses + draws;
    const winRate = totalFinished > 0 ? Math.round((wins / totalFinished) * 100) : 0;
    const totalGames = allFinishedGames ? allFinishedGames.length : (games?.length ?? 0);

    return json({
      profile,
      stats: {
        totalGames,
        wins,
        losses,
        draws,
        winRate,
      },
      matches: matchHistory,
    });
  }

  // 4. BAN PLAYER
  if (action === 'ban_user') {
    const { userId } = body;
    if (!userId) return json({ error: 'userId is required' }, 400);

    // Update Auth User Ban
    const { error: authErr } = await adminClient.auth.admin.updateUserById(userId, { ban_duration: '876000h' });
    if (authErr) return json({ error: authErr.message }, 500);

    // Update Profiles table
    const { error: profErr } = await adminClient.from('profiles').update({ is_banned: true, status: 'banned' }).eq('id', userId);
    if (profErr) return json({ error: profErr.message }, 500);

    return json({ success: true, message: 'User has been banned.' });
  }

  // 5. UNBAN PLAYER
  if (action === 'unban_user') {
    const { userId } = body;
    if (!userId) return json({ error: 'userId is required' }, 400);

    // Remove Auth User Ban
    const { error: authErr } = await adminClient.auth.admin.updateUserById(userId, { ban_duration: 'none' });
    if (authErr) return json({ error: authErr.message }, 500);

    // Update Profiles table (do not force status to 'online')
    const { error: profErr } = await adminClient.from('profiles').update({ is_banned: false, status: 'offline' }).eq('id', userId);
    if (profErr) return json({ error: profErr.message }, 500);

    return json({ success: true, message: 'User has been unbanned.' });
  }

  // 6. DELETE USER
  if (action === 'delete_user') {
    const { userId } = body;
    if (!userId) return json({ error: 'userId is required' }, 400);

    const { error: profErr } = await adminClient.from('profiles').delete().eq('id', userId);
    if (profErr) return json({ error: profErr.message }, 500);

    const { error: authErr } = await adminClient.auth.admin.deleteUser(userId);
    if (authErr) return json({ error: authErr.message }, 500);

    return json({ success: true, message: 'User deleted successfully.' });
  }

  // 7. CHANGE PASSWORD
  if (action === 'change_password') {
    const { userId, newPassword } = body;
    if (!userId || !newPassword) return json({ error: 'userId and newPassword are required' }, 400);
    if (newPassword.length < 6) return json({ error: 'Password must be at least 6 characters' }, 400);

    const { data, error } = await adminClient.auth.admin.updateUserById(userId, { password: newPassword });
    if (error) return json({ error: error.message }, 500);
    return json({ success: true, userId: data.user.id });
  }

  // 8. UPDATE RATING / STATS / BIO
  if (action === 'update_user_stats') {
    const { userId, rating, bio } = body;
    if (!userId) return json({ error: 'userId is required' }, 400);

    const updates: any = {};
    if (rating !== undefined) updates.rating = rating;
    if (bio !== undefined) updates.bio = bio;

    const { error: profErr } = await adminClient.from('profiles').update(updates).eq('id', userId);
    if (profErr) return json({ error: profErr.message }, 500);

    return json({ success: true, message: 'Player details updated.' });
  }

  // 9. LIVE GAMES
  if (action === 'get_live_games') {
    const { data: games, error: gamesErr } = await adminClient
      .from('games')
      .select('*')
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (gamesErr) return json({ error: gamesErr.message }, 500);
    return json({ games: games || [] });
  }

  // 10. FAIR PLAY REPORTS
  if (action === 'get_reports') {
    const { data: reports, error: repErr } = await adminClient
      .from('reports')
      .select('*')
      .order('created_at', { ascending: false });

    if (repErr) return json({ error: repErr.message }, 500);
    return json({ reports: reports || [] });
  }

  if (action === 'update_report') {
    const { reportId, status } = body;
    if (!reportId || !status) return json({ error: 'reportId and status are required' }, 400);

    const { error: repErr } = await adminClient.from('reports').update({ status }).eq('id', reportId);
    if (repErr) return json({ error: repErr.message }, 500);

    return json({ success: true, message: `Report marked as ${status}.` });
  }

  // 11. FORCE END / ABORT GAME
  if (action === 'force_end_game') {
    const { gameId, outcome } = body; // outcome: '1-0', '0-1', '1/2-1/2', 'abort'
    if (!gameId || !outcome) return json({ error: 'gameId and outcome are required' }, 400);

    let status = 'finished';
    let winner: string | null = 'draw';

    if (outcome === '1-0') {
      status = 'finished';
      winner = 'white';
    } else if (outcome === '0-1') {
      status = 'finished';
      winner = 'black';
    } else if (outcome === '1/2-1/2') {
      status = 'finished';
      winner = 'draw';
    } else if (outcome === 'abort') {
      status = 'abandoned';
      winner = 'draw';
    }

    const { data: game, error: gameErr } = await adminClient.from('games').select('white_player_id, black_player_id').eq('id', gameId).single();
    if (gameErr) return json({ error: gameErr.message }, 500);

    const { error: updateErr } = await adminClient.from('games').update({ status, winner }).eq('id', gameId);
    if (updateErr) return json({ error: updateErr.message }, 500);

    if (game) {
      const playerIds = [game.white_player_id, game.black_player_id].filter(Boolean);
      if (playerIds.length > 0) {
        await adminClient.from('profiles').update({ status: 'online' }).in('id', playerIds);
      }
    }

    return json({ success: true, message: `Game set to outcome ${outcome}.` });
  }

  return json({ error: `Unknown action: ${action}` }, 400);
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
