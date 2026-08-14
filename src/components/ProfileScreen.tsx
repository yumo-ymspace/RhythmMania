/*
 * RhythmMania - High-Performance Rhythm Game Platform
 * Copyright (C) 2026 Yumo (yumo-ymspace). All rights reserved.
 *
 * This source code is licensed under the PolyForm Perimeter License 1.0.1.
 * You may modify and use this file for non-competing purposes, provided 
 * that open and explicit attribution is maintained.
 *
 * For the full license terms, see the LICENSE file in the root directory
 * from: https://github.com/yumo-ymspace/RhythmMania
 */

import { useEffect, useState, type ReactNode } from 'react';
import { ArrowLeft, ExternalLink, Loader2, Pencil, Search, Trophy, UserRound } from 'lucide-react';
import type { ProfileActivityStatus } from '../types';
import type { AuthUser } from '../utils/authClient';
import { fetchPublicProfile, searchProfiles, type ProfileSearchResult, type ProfileTarget, type ProfileTargetInput } from '../utils/profileClient';

interface ProfileData {
  user: {
    id: string;
    username: string;
    displayName?: string;
    handle?: string | null;
    avatarUrl?: string | null;
  };
  isOwn?: boolean;
  bio?: string;
  socialLinks?: { youtube?: string; twitter?: string; discord?: string; website?: string };
  activityStatus?: ProfileActivityStatus;
  activityMessage?: string;
  stats: {
    totalPlays: number;
    averageAccuracy: number;
    bestGrade: string;
  } | null;
  recent: Array<{
    id: string;
    title: string;
    artist: string;
    difficulty: string;
    accuracy: number;
    grade: string;
    createdAt: string;
  }>;
}

const STATUS_LABELS: Record<ProfileActivityStatus, string> = {
  playing: 'Playing',
  practicing: 'Practicing',
  mapping: 'Mapping',
  away: 'Away',
  offline: 'Offline',
  custom: 'Custom',
};

const SOCIAL_LABELS = [
  ['youtube', 'YouTube'],
  ['twitter', 'Twitter/X'],
  ['discord', 'Discord'],
  ['website', 'Website'],
] as const;

export default function ProfileScreen({
  profileTarget,
  onBack,
  onEditProfile,
  onOpenProfile,
}: {
  user: AuthUser | null;
  profileTarget: ProfileTarget | null;
  onBack: () => void;
  onEditProfile?: () => void;
  onOpenProfile: (target: ProfileTargetInput) => void;
}) {
  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(Boolean(profileTarget));
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<ProfileSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  useEffect(() => {
    if (!profileTarget) {
      setData(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetchPublicProfile(profileTarget, controller.signal)
      .then(profile => setData(profile as ProfileData))
      .catch(reason => { if (reason instanceof DOMException && reason.name === 'AbortError') return; setError(reason instanceof Error ? reason.message : 'Unable to load profile'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [profileTarget]);

  useEffect(() => {
    if (profileTarget) return;
    const query = search.trim();
    if (query.length < 2) {
      setResults([]);
      setSearching(false);
      setSearchError(null);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearching(true);
      setSearchError(null);
      searchProfiles(query, controller.signal)
        .then(setResults)
        .catch(reason => { if (reason instanceof DOMException && reason.name === 'AbortError') return; setSearchError(reason instanceof Error ? reason.message : 'Search failed'); })
        .finally(() => setSearching(false));
    }, 260);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [profileTarget, search]);

  if (!profileTarget) {
    return <ProfileSearchScreen search={search} setSearch={setSearch} results={results} searching={searching} error={searchError} onBack={onBack} onOpenProfile={onOpenProfile} />;
  }

  if (loading) {
    return <PageShell onBack={onBack}><div className="flex min-h-[50vh] items-center justify-center text-cyan-200"><Loader2 className="h-6 w-6 animate-spin" /></div></PageShell>;
  }

  if (error || !data) {
    return <PageShell onBack={onBack}><div className="mx-auto max-w-lg rounded-3xl border border-rose-300/20 bg-rose-950/20 p-8 text-center"><UserRound className="mx-auto mb-4 h-10 w-10 text-rose-300" /><h1 className="text-2xl font-black text-white">Profile unavailable</h1><p className="mt-2 text-sm text-rose-100/70">{error || 'This player profile could not be found.'}</p></div></PageShell>;
  }

  const displayName = data.user.displayName || data.user.username;
  const socials = data.socialLinks || {};
  const status = data.activityStatus || 'offline';
  const statusText = status === 'custom' && data.activityMessage ? data.activityMessage : STATUS_LABELS[status];

  return (
    <PageShell onBack={onBack}>
      <div className="mx-auto max-w-5xl">
        <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-[#12121b]/95 shadow-2xl shadow-black/30">
          <div className="h-2 bg-gradient-to-r from-cyan-300 via-fuchsia-400 to-amber-300" />
          <header className="relative px-5 pb-7 pt-7 sm:px-9 sm:pt-9">
            <div className="pointer-events-none absolute right-8 top-5 font-mono text-[9px] uppercase tracking-[0.45em] text-white/20">PLAYER // {data.user.id}</div>
            <div className="flex flex-col gap-6 sm:flex-row sm:items-end">
              <Avatar url={data.user.avatarUrl} name={displayName} size="large" />
              <div className="min-w-0 flex-1">
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.35em] text-cyan-300">RhythmMania player</p>
                <h1 className="mt-2 truncate text-4xl font-black tracking-tight text-white sm:text-5xl">{displayName}</h1>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  {data.user.handle && <span className="font-mono text-fuchsia-200">@{data.user.handle}</span>}
                  <span className="inline-flex items-center gap-1.5 text-slate-400"><span className={`h-2 w-2 rounded-full ${status === 'offline' ? 'bg-slate-500' : 'bg-emerald-300 shadow-[0_0_10px_rgba(110,231,183,.7)]'}`} />{statusText}</span>
                </div>
              </div>
              {data.isOwn && onEditProfile && <button onClick={onEditProfile} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 text-xs font-black uppercase tracking-widest text-white transition hover:border-cyan-300/40 hover:bg-cyan-300/10"><Pencil className="h-4 w-4" /> Edit</button>}
            </div>
            {data.bio && <p className="mt-7 max-w-2xl whitespace-pre-wrap text-sm leading-6 text-slate-300">{data.bio}</p>}
            <div className="mt-6 flex flex-wrap gap-2">
              {SOCIAL_LABELS.map(([key, label]) => {
                const value = socials[key];
                if (!value) return null;
                const href = key === 'discord' ? null : value.startsWith('http') ? value : `https://${value}`;
                return href ? <a key={key} href={href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/10 px-3 text-xs font-bold text-slate-300 transition hover:border-fuchsia-300/40 hover:text-white"><ExternalLink className="h-3.5 w-3.5" />{label}</a> : <span key={key} className="inline-flex min-h-10 items-center rounded-xl border border-white/10 px-3 text-xs font-bold text-slate-300">{label}: {value}</span>;
              })}
            </div>
          </header>

          {data.stats && <section className="grid grid-cols-3 border-y border-white/10 bg-black/20"><Summary label="Plays" value={data.stats.totalPlays.toLocaleString()} /><Summary label="Accuracy" value={`${data.stats.averageAccuracy.toFixed(2)}%`} /><Summary label="Best grade" value={data.stats.bestGrade} accent /></section>}

          <section className="px-5 py-7 sm:px-9">
            <div className="mb-4 flex items-center gap-2"><Trophy className="h-4 w-4 text-amber-300" /><h2 className="text-xs font-black uppercase tracking-[0.25em] text-slate-300">Recent plays</h2></div>
            {data.recent.length === 0 ? <p className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-slate-500">No public plays yet.</p> : <div className="divide-y divide-white/10 rounded-2xl border border-white/10 bg-black/15">{data.recent.slice(0, 3).map(run => <div key={run.id} className="flex items-center justify-between gap-4 px-4 py-4"><div className="min-w-0"><p className="truncate text-sm font-bold text-white">{run.artist} <span className="text-slate-500">/</span> {run.title}</p><p className="mt-1 text-xs text-slate-500">{run.difficulty} · {new Date(run.createdAt).toLocaleDateString()}</p></div><div className="shrink-0 text-right"><p className="font-mono text-sm font-bold text-cyan-200">{run.accuracy.toFixed(2)}%</p><p className="mt-1 text-xs font-black text-amber-300">{run.grade}</p></div></div>)}</div>}
          </section>
        </div>
      </div>
    </PageShell>
  );
}

function ProfileSearchScreen({ search, setSearch, results, searching, error, onBack, onOpenProfile }: { search: string; setSearch: (value: string) => void; results: ProfileSearchResult[]; searching: boolean; error: string | null; onBack: () => void; onOpenProfile: (target: ProfileTargetInput) => void }) {
  return <PageShell onBack={onBack}><div className="mx-auto max-w-3xl"><div className="mb-10 text-center"><p className="font-mono text-[10px] font-bold uppercase tracking-[0.4em] text-cyan-300">Player index</p><h1 className="mt-3 text-4xl font-black tracking-tight text-white">Find a player</h1><p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-400">Search by display name, handle, or player ID. Profiles remain public to signed-out visitors.</p></div><div className="relative"><Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" /><input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="Search players..." className="h-14 w-full rounded-2xl border border-white/10 bg-[#12121b] pl-12 pr-12 text-base font-bold text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300/50 focus:ring-4 focus:ring-cyan-300/10" />{searching && <Loader2 className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 animate-spin text-cyan-300" />}</div>{error && <p className="mt-4 rounded-xl border border-rose-300/20 bg-rose-950/20 p-4 text-sm text-rose-200">{error}</p>}{search.length < 2 ? <p className="mt-8 text-center text-xs font-mono uppercase tracking-widest text-slate-600">Type at least two characters</p> : results.length === 0 && !searching ? <p className="mt-8 text-center text-sm text-slate-500">No matching players found.</p> : <div className="mt-5 space-y-2">{results.map(result => <button key={result.id} onClick={() => onOpenProfile(result.id)} className="flex min-h-[4.5rem] w-full items-center gap-4 rounded-2xl border border-white/10 bg-[#12121b] px-4 text-left transition hover:border-fuchsia-300/40 hover:bg-fuchsia-300/5"><Avatar url={result.avatarUrl} name={result.displayName} /><span className="min-w-0 flex-1"><span className="block truncate font-bold text-white">{result.displayName}</span><span className="mt-1 block truncate text-xs font-mono text-fuchsia-200">{result.handle ? `@${result.handle}` : result.id}</span></span><span className="hidden text-xs text-slate-500 sm:block">{result.activityStatus === 'custom' ? result.activityMessage : STATUS_LABELS[result.activityStatus]}</span></button>)}</div>}</div></PageShell>;
}

function PageShell({ children, onBack }: { children: ReactNode; onBack: () => void }) { return <div className="h-full overflow-y-auto bg-[#090910]/95 p-4 text-white md:p-8"><div className="mx-auto mb-6 max-w-5xl"><button onClick={onBack} className="inline-flex min-h-11 items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-500 transition hover:text-white"><ArrowLeft className="h-4 w-4" /> Back</button></div>{children}</div>; }
function Avatar({ url, name, size = 'small' }: { url?: string | null; name: string; size?: 'small' | 'large' }) { const classes = size === 'large' ? 'h-28 w-28 text-4xl' : 'h-12 w-12 text-lg'; return url ? <img src={url} alt="" className={`${classes} shrink-0 rounded-2xl border border-white/15 object-cover`} /> : <div className={`${classes} flex shrink-0 items-center justify-center rounded-2xl border border-fuchsia-300/20 bg-fuchsia-300/10 font-black text-fuchsia-200`}>{name[0]?.toUpperCase() || '?'}</div>; }
function Summary({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) { return <div className="px-3 py-5 text-center sm:px-6"><p className="font-mono text-[9px] font-bold uppercase tracking-[0.25em] text-slate-500">{label}</p><p className={`mt-2 text-xl font-black tabular-nums sm:text-2xl ${accent ? 'text-amber-200' : 'text-cyan-200'}`}>{value}</p></div>; }
