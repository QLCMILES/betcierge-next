import { createClient } from '@supabase/supabase-js';

// Shared admin gate — the single source of truth for "is this caller an admin".
//
// Verifies the caller's identity from their access token (NEVER from anything
// sent in the request body) and confirms they exist in the admin_users table
// (a table with no client-facing grants or RLS policies — only the service-role
// client below can ever read it). Returns:
//   { user, adminClient }         on success  — reuse adminClient for writes
//   { error: string, status: n }  on failure  — return this straight to the caller
//
// Usage inside a route's POST handler:
//   const gate = await requireAdmin(req);
//   if (gate.error) return NextResponse.json({ error: gate.error }, { status: gate.status });
//   const { user, adminClient } = gate;
export async function requireAdmin(req) {
  const authHeader = req.headers.get('authorization') || '';
  const accessToken = authHeader.replace('Bearer ', '').trim();
  if (!accessToken) {
    return { error: 'Missing session', status: 401 };
  }

  // Step 1 — identity comes from the verified token itself, server-side.
  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
  );
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) {
    return { error: 'Invalid session', status: 401 };
  }

  // Step 2 — a separate service-role client, never contaminated with the
  // user's token (reusing the session client here would subject privileged
  // writes to the user's own RLS instead of bypassing it).
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Step 3 — confirm admin status against admin_users (service-role only).
  const { data: adminRow } = await adminClient
    .from('admin_users')
    .select('role')
    .eq('user_id', user.id)
    .single();
  if (!adminRow) {
    return { error: 'Not authorized', status: 403 };
  }

  return { user, adminClient };
}
