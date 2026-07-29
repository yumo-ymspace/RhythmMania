import { useEffect, useState } from 'react';
import { ArrowLeft, BarChart3, Trophy, UserRound } from 'lucide-react';
import { AuthUser } from '../utils/authClient';

interface ProfileUser {
  id: string;
  username: string;
  email?: string | null;
  avatarUrl?: string | null;
  role?: string;
}

interface ProfileData {
  user: ProfileUser;
  isOwn?: boolean;
  stats: {
    totalPlays: number;
    totalScore: number;
    averageAccuracy: number;
    bestGrade: string;
    grades: Record<string, number>;
    keyCounts: Array<{ keyCount: number; plays: number }>;
    mods: Array<{ mod: string; plays: number }>;
  };
  recent: Array<{
    id: string;
    title: string;
    artist: string;
    difficulty: string;
    score: number;
    accuracy: number;
    grade: string;
    createdAt: string;
  }>;
}

export default function ProfileScreen({
  user,
  profileId,
  onBack,
}: {
  user: AuthUser | null;
  profileId: string | null;
  onBack: () => void;
}) {
  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const resolvedId = profileId ?? user?.id ?? null;

  useEffect(() => {
    if (!resolvedId) {
      setLoading(false);
      setData(null);
      setError(null);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    fetch(`/api/profile/get?userId=${encodeURIComponent(String(resolvedId))}`, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    })
      .then(async response => {
        const payload = await response.json();
        if (!response.ok || !payload.success) throw new Error(payload.error || 'Unable to load profile');
        return payload.data as ProfileData;
      })
      .then(profile => {
        if (active) setData(profile);
      })
      .catch(reason => {
        if (active) setError(reason instanceof Error ? reason.message : 'Unable to load profile');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [resolvedId]);

  if (!resolvedId) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-950/80 p-6">
        <div className="max-w-md rounded-3xl border border-white/10 bg-black/40 p-8 text-center">
          <UserRound className="mx-auto mb-4 h-10 w-10 text-pink-400" />
          <h1 className="text-xl font-black text-white">Sign in to view your profile</h1>
          <p className="mt-2 text-sm text-slate-400">Online statistics are available after signing in with Google.</p>
          <button onClick={onBack} className="mt-6 rounded-xl bg-white/10 px-5 py-2 text-xs font-black uppercase tracking-widest text-white">Back</button>
        </div>
      </div>
    );
  }

  const displayUser = data?.user;

  return (
    <div className="h-full overflow-y-auto bg-slate-950/85 p-4 text-white md:p-8">
      <div className="mx-auto max-w-5xl">
        <button onClick={onBack} className="mb-6 flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-400 hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <header className="mb-8 flex items-center gap-4">
          {displayUser?.avatarUrl ? (
            <img src={displayUser.avatarUrl} alt="" className="h-16 w-16 rounded-full border-2 border-pink-400/60" />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-pink-500/20 text-2xl font-black text-pink-300">
              {(displayUser?.username || '?')[0]?.toUpperCase()}
            </div>
          )}
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-pink-400">Player profile</p>
            <h1 className="text-3xl font-black">{displayUser?.username || (loading ? 'Loading...' : 'Unknown')}</h1>
            {displayUser && (
              <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-slate-500">ID {displayUser.id}</p>
            )}
          </div>
        </header>

        {loading && <p className="text-sm text-slate-400">Loading statistics...</p>}
        {error && <p className="rounded-xl border border-red-500/30 bg-red-950/30 p-4 text-sm text-red-200">{error}</p>}
        {data && (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {[
                ['Plays', data.stats.totalPlays.toLocaleString()],
                ['Average accuracy', `${data.stats.averageAccuracy.toFixed(2)}%`],
                ['Best grade', data.stats.bestGrade],
                ['Total score', data.stats.totalScore.toLocaleString()],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-[10px] font-mono uppercase tracking-widest text-slate-500">{label}</p>
                  <p className="mt-2 text-xl font-black text-cyan-200">{value}</p>
                </div>
              ))}
            </div>
            <div className="mt-6 grid gap-6 md:grid-cols-2">
              <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <h2 className="flex items-center gap-2 font-black uppercase tracking-widest"><Trophy className="h-4 w-4 text-amber-300" /> Grades</h2>
                <div className="mt-4 flex gap-3">
                  {Object.entries(data.stats.grades).map(([grade, count]) => (
                    <div key={grade} className="flex-1 rounded-xl bg-black/20 p-3 text-center">
                      <p className="text-lg font-black text-amber-200">{grade}</p>
                      <p className="text-xs text-slate-400">{count} runs</p>
                    </div>
                  ))}
                </div>
              </section>
              <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <h2 className="flex items-center gap-2 font-black uppercase tracking-widest"><BarChart3 className="h-4 w-4 text-cyan-300" /> Play breakdown</h2>
                <div className="mt-4 flex flex-wrap gap-2">
                  {data.stats.keyCounts.map(item => (
                    <span key={item.keyCount} className="rounded-lg bg-cyan-400/10 px-3 py-2 text-xs font-bold text-cyan-200">
                      {item.keyCount || '?'}K · {item.plays}
                    </span>
                  ))}
                  {data.stats.mods.map(item => (
                    <span key={item.mod} className="rounded-lg bg-purple-400/10 px-3 py-2 text-xs font-bold text-purple-200">
                      {item.mod} · {item.plays}
                    </span>
                  ))}
                </div>
              </section>
            </div>
            <section className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
              <h2 className="font-black uppercase tracking-widest">Recent online plays</h2>
              <div className="mt-3 divide-y divide-white/10">
                {data.recent.map(run => (
                  <div key={run.id} className="flex items-center justify-between gap-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold">{run.artist} - {run.title}</p>
                      <p className="text-xs text-slate-500">{run.difficulty}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-sm font-bold text-cyan-200">{run.accuracy.toFixed(2)}% · {run.grade}</p>
                      <p className="text-[10px] text-slate-500">{new Date(run.createdAt).toLocaleDateString()}</p>
                    </div>
                  </div>
                ))}
              </div>
              {data.recent.length === 0 && <p className="py-4 text-sm text-slate-500">No uploaded plays yet.</p>}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
