'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const ADMIN_EMAIL = 'qlcmiles@gmail.com';

export default function AdminDashboard() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('users');
  const [users, setUsers] = useState([]);
  const [picks, setPicks] = useState([]);
  const [stats, setStats] = useState(null);
  const [notifMsg, setNotifMsg] = useState('');
  const [notifTarget, setNotifTarget] = useState('all');
  const [notifChannel, setNotifChannel] = useState('both');
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
      if (session?.user?.email === ADMIN_EMAIL) {
        loadUsers();
        loadPicks();
        loadStats();
      }
    });
  }, []);

  const loadUsers = async () => {
    const { data } = await supabase
      .from('user_profiles')
      .select('*')
      .order('created_at', { ascending: false });
    if (data) setUsers(data);
  };

  const loadPicks = async () => {
    const { data } = await supabase
      .from('daily_picks')
      .select('*')
      .order('date', { ascending: false })
      .limit(30);
    if (data) setPicks(data);
  };

  const loadStats = async () => {
    const { count: userCount } = await supabase.from('user_profiles').select('*', { count: 'exact', head: true });
    const { count: betCount } = await supabase.from('user_bets').select('*', { count: 'exact', head: true });
    const { count: pendingCount } = await supabase.from('user_bets').select('*', { count: 'exact', head: true }).eq('result', 'Pending');
    setStats({ userCount, betCount, pendingCount });
  };

  const updateUserTier = async (userId, tier) => {
    await supabase.from('user_profiles').update({ subscription_tier: tier }).eq('user_id', userId);
    loadUsers();
    setFeedback(`Updated tier to ${tier}`);
    setTimeout(() => setFeedback(''), 3000);
  };

  const updatePickResult = async (pickId, result) => {
    await supabase.from('daily_picks').update({ result }).eq('id', pickId);
    loadPicks();
    setFeedback(`Pick marked as ${result}`);
    setTimeout(() => setFeedback(''), 3000);
  };

  const massVoidPick = async (pick) => {
    if (!confirm(`Void "${pick.pick}" for ALL users?`)) return;
    await supabase.from('user_bets')
      .update({ result: 'Void' })
      .eq('game_date', pick.date)
      .ilike('pick', `%${pick.pick}%`);
    await supabase.from('daily_picks').update({ result: 'Void' }).eq('id', pick.id);
    loadPicks();
    setFeedback(`Voided "${pick.pick}" for all users`);
    setTimeout(() => setFeedback(''), 3000);
  };

  const sendNotification = async () => {
    if (!notifMsg.trim()) return;
    setSending(true);
    try {
      const res = await fetch('/api/admin/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: notifMsg, target: notifTarget, channel: notifChannel })
      });
      const data = await res.json();
      setFeedback(`Sent to ${data.sent} users`);
      setNotifMsg('');
    } catch(e) {
      setFeedback('Error sending notification');
    }
    setSending(false);
    setTimeout(() => setFeedback(''), 4000);
  };

  if (loading) return <div style={S.loading}>Loading...</div>;
  if (!session || session.user.email !== ADMIN_EMAIL) {
    return <div style={S.loading}>Access denied.</div>;
  }

  const tabs = ['users', 'picks', 'notifications', 'analytics'];

  return (
    <div style={S.wrap}>
      <div style={S.header}>
        <div style={S.logo}>BETCIERGE ADMIN</div>
        <div style={{ color: '#555', fontSize: 12 }}>{session.user.email}</div>
      </div>
      {feedback && <div style={S.feedback}>{feedback}</div>}
      <div style={S.tabRow}>
        {tabs.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ ...S.tabBtn, ...(tab === t ? S.tabActive : {}) }}>
            {t.toUpperCase()}
          </button>
        ))}
      </div>

      {/* USERS TAB */}
      {tab === 'users' && (
        <div>
          <div style={S.sectionTitle}>Users ({users.length})</div>
          {users.map(u => (
            <div key={u.user_id} style={S.card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={S.name}>{u.name}</div>
                  <div style={S.sub}>Bankroll: ${u.bankroll} · Goal: ${u.goal}</div>
                  <div style={S.sub}>Tier: <span style={{ color: '#f5a623' }}>{u.subscription_tier || 'lookout'}</span></div>
                  {u.phone && <div style={S.sub}>📱 {u.phone} {u.sms_opt_in ? '✅' : '❌'}</div>}
                </div>
                <select
                  value={u.subscription_tier || 'lookout'}
                  onChange={e => updateUserTier(u.user_id, e.target.value)}
                  style={S.select}
                >
                  {['lookout', 'team', 'edge', 'capital'].map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* PICKS TAB */}
      {tab === 'picks' && (
        <div>
          <div style={S.sectionTitle}>Recent Picks</div>
          {picks.map(p => (
            <div key={p.id} style={S.card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ color: '#888', fontSize: 11, marginBottom: 2 }}>{p.date} · {p.sport}</div>
                  <div style={S.name}>{p.pick}</div>
                  <div style={S.sub}>{p.game} · {p.odds} · {p.units}u</div>
                  <div style={{ marginTop: 4 }}>
                    <span style={{ ...S.badge, background: p.result === 'Win' ? '#0a2e0a' : p.result === 'Loss' ? '#2e0a0a' : p.result === 'Void' ? '#1a0a2e' : '#1a1a1a', color: p.result === 'Win' ? '#2ecc71' : p.result === 'Loss' ? '#e74c3c' : p.result === 'Void' ? '#9b59b6' : '#888' }}>
                      {p.result || 'PENDING'}
                    </span>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {['Win', 'Loss', 'Push', 'Void', 'Pending'].map(r => (
                    <button key={r} onClick={() => updatePickResult(p.id, r)} style={{ ...S.smallBtn, background: p.result === r ? '#f5a623' : '#1a1a2e', color: p.result === r ? '#000' : '#888' }}>{r}</button>
                  ))}
                  <button onClick={() => massVoidPick(p)} style={{ ...S.smallBtn, background: '#2e0a2e', color: '#e74c3c', marginTop: 4 }}>VOID ALL USERS</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* NOTIFICATIONS TAB */}
      {tab === 'notifications' && (
        <div>
          <div style={S.sectionTitle}>Send Notification</div>
          <div style={S.card}>
            <textarea
              value={notifMsg}
              onChange={e => setNotifMsg(e.target.value)}
              placeholder="Write your message..."
              style={S.textarea}
            />
            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={S.label}>Target</div>
                <select value={notifTarget} onChange={e => setNotifTarget(e.target.value)} style={S.select}>
                  <option value="all">All Users</option>
                  <option value="team">Team+ Only</option>
                  <option value="trial">Trial Users</option>
                  <option value="free">Free Users</option>
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <div style={S.label}>Channel</div>
                <select value={notifChannel} onChange={e => setNotifChannel(e.target.value)} style={S.select}>
                  <option value="both">In-App + SMS</option>
                  <option value="inapp">In-App Only</option>
                  <option value="sms">SMS Only</option>
                </select>
              </div>
            </div>
            <button onClick={sendNotification} disabled={sending} style={S.sendBtn}>
              {sending ? 'Sending...' : 'Send Notification'}
            </button>
          </div>
        </div>
      )}

      {/* ANALYTICS TAB */}
      {tab === 'analytics' && stats && (
        <div>
          <div style={S.sectionTitle}>Analytics</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
            {[
              { label: 'Total Users', value: stats.userCount },
              { label: 'Total Bets Logged', value: stats.betCount },
              { label: 'Pending Bets', value: stats.pendingCount },
            ].map(s => (
              <div key={s.label} style={S.statCard}>
                <div style={{ fontSize: 28, fontWeight: 800, color: '#f5a623' }}>{s.value}</div>
                <div style={{ fontSize: 11, color: '#555', marginTop: 4 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const S = {
  wrap: { background: '#0a0a0f', minHeight: '100vh', padding: 20, fontFamily: 'Outfit, sans-serif', color: '#fff' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, paddingBottom: 16, borderBottom: '1px solid #1e1e2e' },
  logo: { fontSize: 18, fontWeight: 800, color: '#f5a623', letterSpacing: 2 },
  loading: { background: '#0a0a0f', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontFamily: 'Outfit, sans-serif' },
  feedback: { background: '#0a2e0a', border: '1px solid #2ecc71', color: '#2ecc71', padding: '10px 16px', borderRadius: 8, marginBottom: 16, fontSize: 13 },
  tabRow: { display: 'flex', gap: 8, marginBottom: 24 },
  tabBtn: { background: '#111118', border: '1px solid #1e1e2e', color: '#555', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700 },
  tabActive: { background: '#f5a623', color: '#000', border: '1px solid #f5a623' },
  sectionTitle: { fontSize: 14, fontWeight: 700, color: '#888', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 },
  card: { background: '#111118', border: '1px solid #1e1e2e', borderRadius: 12, padding: 16, marginBottom: 10 },
  statCard: { background: '#111118', border: '1px solid #1e1e2e', borderRadius: 12, padding: 16, textAlign: 'center' },
  name: { fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 4 },
  sub: { fontSize: 12, color: '#555', marginBottom: 2 },
  badge: { fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4 },
  select: { background: '#0a0a0f', border: '1px solid #1e1e2e', color: '#fff', padding: '6px 10px', borderRadius: 8, fontSize: 12, cursor: 'pointer' },
  smallBtn: { fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 4, border: 'none', cursor: 'pointer' },
  textarea: { width: '100%', background: '#0a0a0f', border: '1px solid #1e1e2e', color: '#fff', padding: 12, borderRadius: 8, fontSize: 13, minHeight: 100, resize: 'vertical', boxSizing: 'border-box' },
  label: { fontSize: 11, color: '#555', marginBottom: 6, textTransform: 'uppercase' },
  sendBtn: { width: '100%', background: '#f5a623', color: '#000', border: 'none', padding: '12px', borderRadius: 10, fontSize: 14, fontWeight: 800, cursor: 'pointer', marginTop: 16 },
};
