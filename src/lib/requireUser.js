import { createClient } from '@supabase/supabase-js';

// Shared "must be logged in" gate — the sibling of requireAdmin.
//
// Verifies the caller's identity from their access token (NEVER from anything
// sent in the request body) and returns the real authenticated user. Use this
// on routes where any logged-in user may act, but only ever AS THEMSELVES —
// so the server never trusts a user id / email supplied by the client.
// Returns:
//   { user }                       on success
//   { error: string, status: n }   on failure — return this straight to the caller
//
// Usage inside a route's POST handler:
//   const auth = await requireUser(req);
//   if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
//   const { user } = auth;   // use user.id / user.email, ignore the body's copies
export async function requireUser(req) {
  const authHeader = req.headers.get('authorization') || '';
  const accessToken = authHeader.replace('Bearer ', '').trim();
  if (!accessToken) {
    return { error: 'Missing session', status: 401 };
  }

  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
  );
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) {
    return { error: 'Invalid session', status: 401 };
  }

  return { user };
}
