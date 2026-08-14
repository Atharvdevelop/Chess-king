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

  let body: { action: string; userId?: string; newPassword?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  if (body.action === 'list_users') {
    const { data, error } = await adminClient.auth.admin.listUsers({ perPage: 200 });
    if (error) return json({ error: error.message }, 500);

    const { data: profiles } = await adminClient.from('profiles').select('id, username, created_at');
    const profileMap = new Map((profiles as ProfileRow[] ?? []).map((p: ProfileRow) => [p.id, p]));

    const users = ((data.users as AuthUserRow[]) ?? []).map((u: AuthUserRow) => ({
      id: u.id,
      email: u.email ?? '—',
      username: profileMap.get(u.id)?.username ?? '—',
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at ?? null,
    }));
    return json({ users });
  }

  if (body.action === 'change_password') {
    const { userId, newPassword } = body;
    if (!userId || !newPassword) return json({ error: 'userId and newPassword are required' }, 400);
    if (newPassword.length < 6) return json({ error: 'Password must be at least 6 characters' }, 400);

    const { data, error } = await adminClient.auth.admin.updateUserById(userId, { password: newPassword });
    if (error) return json({ error: error.message }, 500);
    return json({ success: true, userId: data.user.id });
  }

  return json({ error: `Unknown action: ${body.action}` }, 400);
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

