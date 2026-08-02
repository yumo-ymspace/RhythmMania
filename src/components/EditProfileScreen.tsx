import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { ArrowLeft, Check, Loader2, Upload } from 'lucide-react';
import type { ProfileActivityStatus, ProfileEditData, ProfileSocialLinks } from '../types';
import {
  checkHandleAvailability,
  cropToSquareDataUrl,
  fetchMyProfile,
  selectPresetAvatar,
  updateMyProfile,
  uploadAvatar,
} from '../utils/profileClient';

const PRESETS = ['preset_01', 'preset_02', 'preset_03', 'preset_04', 'preset_05', 'preset_06', 'preset_07', 'preset_08'];
const MAX_BIO = 500;
const MAX_DISPLAY_NAME = 32;
const HANDLE_RE = /^[a-z][a-z0-9_]{2,19}$/;
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

export default function EditProfileScreen({
  onDone,
  onBack,
}: {
  onDone: () => void;
  onBack: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarSource, setAvatarSource] = useState<ProfileEditData['avatarSource']>(null);
  const [displayName, setDisplayName] = useState('');
  const [handle, setHandle] = useState('');
  const [handleStatus, setHandleStatus] = useState<'idle' | 'checking' | 'ok' | 'taken' | 'reserved' | 'invalid'>('idle');
  const [bio, setBio] = useState('');
  const [socialLinks, setSocialLinks] = useState<ProfileSocialLinks>({});
  const [activityStatus, setActivityStatus] = useState<ProfileActivityStatus>('offline');
  const [activityMessage, setActivityMessage] = useState('');
  const [dirty, setDirty] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const handleDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [initial, setInitial] = useState<string>('');

  useEffect(() => {
    let active = true;
    fetchMyProfile()
      .then((data) => {
        if (!active) return;
        setAvatarUrl(data.user.avatarUrl || null);
        setAvatarSource(data.profile.avatarSource);
        setDisplayName(data.profile.displayName);
        setHandle(data.profile.handle);
        setBio(data.profile.bio);
        setSocialLinks(data.profile.socialLinks || {});
        setActivityStatus(data.profile.activityStatus || 'offline');
        setActivityMessage(data.profile.activityMessage || '');
        setInitial(JSON.stringify({
          displayName: data.profile.displayName,
          handle: data.profile.handle,
          bio: data.profile.bio,
          socialLinks: data.profile.socialLinks || {},
          activityStatus: data.profile.activityStatus || 'offline',
          activityMessage: data.profile.activityMessage || '',
        }));
        setHandleStatus(data.profile.handle ? 'ok' : 'idle');
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load profile'))
      .finally(() => setLoading(false));
    return () => { active = false; };
  }, []);

  // Track unsaved changes
  useEffect(() => {
    const current = JSON.stringify({ displayName, handle, bio, socialLinks, activityStatus, activityMessage });
    setDirty(current !== initial);
  }, [displayName, handle, bio, socialLinks, activityStatus, activityMessage, initial]);

  // Debounced handle availability check
  useEffect(() => {
    if (handleDebounceRef.current) clearTimeout(handleDebounceRef.current);
    if (!handle) { setHandleStatus('idle'); return; }
    if (!HANDLE_RE.test(handle)) { setHandleStatus('invalid'); return; }
    setHandleStatus('checking');
    handleDebounceRef.current = setTimeout(() => {
      checkHandleAvailability(handle)
        .then((r) => setHandleStatus(r.available ? 'ok' : r.reason === 'reserved' ? 'reserved' : 'taken'))
        .catch(() => setHandleStatus('idle'));
    }, 400);
    return () => { if (handleDebounceRef.current) clearTimeout(handleDebounceRef.current); };
  }, [handle]);

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_AVATAR_BYTES) { setError('Image exceeds 2 MB limit'); return; }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setError('Only JPEG, PNG, or WebP allowed'); return; }
    setUploadingAvatar(true);
    setError(null);
    try {
      const dataUrl = await cropToSquareDataUrl(file, 256);
      const url = await uploadAvatar(dataUrl);
      setAvatarUrl(url);
      setAvatarSource('uploaded');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Avatar upload failed');
    } finally {
      setUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handlePresetClick = async (presetId: string) => {
    setUploadingAvatar(true);
    setError(null);
    try {
      const url = await selectPresetAvatar(presetId);
      setAvatarUrl(url);
      setAvatarSource('preset');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Preset selection failed');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const canSave =
    !saving &&
    displayName.trim().length > 0 &&
    displayName.length <= MAX_DISPLAY_NAME &&
    HANDLE_RE.test(handle) &&
    handleStatus === 'ok' &&
    bio.length <= MAX_BIO;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      await updateMyProfile({
        displayName: displayName.trim(),
        handle,
        bio,
        socialLinks,
        activityStatus,
        activityMessage,
      });
      onDone();
    } catch (e) {
      if (e instanceof Error && e.message === 'HANDLE_TAKEN') {
        setHandleStatus('taken');
        setError('That handle is already taken');
      } else {
        setError(e instanceof Error ? e.message : 'Failed to save profile');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleBackClick = () => {
    if (dirty && !saving) {
      if (!window.confirm('Discard unsaved changes?')) return;
    }
    onBack();
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-950/85 text-slate-400">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-slate-950/85 p-4 text-white md:p-8">
      <div className="mx-auto max-w-3xl">
        <button
          onClick={handleBackClick}
          className="mb-6 flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-400 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        <h1 className="mb-8 text-3xl font-black">Edit Profile</h1>

        {error && (
          <div className="mb-6 rounded-xl border border-red-500/30 bg-red-950/30 p-4 text-sm text-red-200">{error}</div>
        )}

        {/* Avatar */}
        <section className="mb-8 rounded-2xl border border-white/10 bg-white/5 p-5">
          <h2 className="mb-4 font-black uppercase tracking-widest">Avatar</h2>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border-2 border-pink-400/60 bg-pink-500/20">
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="text-2xl font-black text-pink-300">{(displayName || '?')[0]?.toUpperCase()}</span>
              )}
            </div>
            <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={handleFileChange} className="hidden" />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingAvatar}
              className="flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-xs font-black uppercase tracking-widest hover:bg-white/20 disabled:opacity-50"
            >
              {uploadingAvatar ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Upload
            </button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p}
                onClick={() => handlePresetClick(p)}
                disabled={uploadingAvatar}
                className={`h-12 w-12 overflow-hidden rounded-lg border-2 ${avatarSource === 'preset' && avatarUrl?.includes(p) ? 'border-cyan-400' : 'border-white/10'}`}
              >
                <img src={`/avatars/${p}.png`} alt={p} className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        </section>

        {/* Identity */}
        <section className="mb-8 rounded-2xl border border-white/10 bg-white/5 p-5">
          <h2 className="mb-4 font-black uppercase tracking-widest">Identity</h2>
          <label className="mb-1 block text-[10px] font-mono uppercase tracking-widest text-slate-500">Display name</label>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value.slice(0, MAX_DISPLAY_NAME))}
            className="mb-4 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-cyan-500"
            placeholder="Your public name"
            maxLength={MAX_DISPLAY_NAME}
          />
          <label className="mb-1 block text-[10px] font-mono uppercase tracking-widest text-slate-500">
            Handle <span className="text-slate-600">/profile/&lt;handle&gt;</span>
          </label>
          <input
            value={handle}
            onChange={(e) => setHandle(e.target.value.toLowerCase().slice(0, 20))}
            className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-cyan-500"
            placeholder="3-20 chars, a-z0-9_"
            maxLength={20}
          />
          <HandleStatus status={handleStatus} />
        </section>

        {/* Bio */}
        <section className="mb-8 rounded-2xl border border-white/10 bg-white/5 p-5">
          <h2 className="mb-4 font-black uppercase tracking-widest">Bio</h2>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value.slice(0, MAX_BIO))}
            className="h-28 w-full resize-none rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-cyan-500"
            placeholder="Tell other players about yourself"
            maxLength={MAX_BIO}
          />
          <p className="mt-1 text-right text-[10px] text-slate-500">{bio.length}/{MAX_BIO}</p>
        </section>

        <section className="mb-8 rounded-2xl border border-white/10 bg-white/5 p-5">
          <h2 className="mb-4 font-black uppercase tracking-widest">Player status</h2>
          <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
            <select
              value={activityStatus}
              onChange={(e) => setActivityStatus(e.target.value as ProfileActivityStatus)}
              className="rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-cyan-500"
            >
              <option value="playing">Playing</option>
              <option value="practicing">Practicing</option>
              <option value="mapping">Mapping</option>
              <option value="away">Away</option>
              <option value="offline">Offline</option>
              <option value="custom">Custom</option>
            </select>
            <input
              value={activityMessage}
              onChange={(e) => setActivityMessage(e.target.value.slice(0, 80))}
              disabled={activityStatus !== 'custom'}
              maxLength={80}
              placeholder="Optional short status message"
              className="rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-cyan-500 disabled:cursor-not-allowed disabled:opacity-40"
            />
          </div>
          <p className="mt-2 text-xs text-slate-500">Shown beneath your handle on your public profile.</p>
        </section>

        {/* Social links */}
        <section className="mb-8 rounded-2xl border border-white/10 bg-white/5 p-5">
          <h2 className="mb-4 font-black uppercase tracking-widest">Social Links</h2>
          {(['youtube', 'twitter', 'discord', 'website'] as const).map((key) => (
            <div key={key} className="mb-3">
              <label className="mb-1 block text-[10px] font-mono uppercase tracking-widest text-slate-500">{key}</label>
              <input
                value={socialLinks[key] || ''}
                onChange={(e) => setSocialLinks({ ...socialLinks, [key]: e.target.value.slice(0, 256) })}
                className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-cyan-500"
                placeholder={key === 'discord' ? 'username' : 'https://...'}
              />
            </div>
          ))}
        </section>

        {/* Save bar */}
        <div className="sticky bottom-0 flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/90 p-4 backdrop-blur">
          <span className={`text-xs font-mono uppercase tracking-widest ${dirty ? 'text-amber-300' : 'text-slate-600'}`}>
            {dirty ? 'Unsaved changes' : 'All changes saved'}
          </span>
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="flex items-center gap-2 rounded-xl bg-cyan-500 px-6 py-2 text-xs font-black uppercase tracking-widest text-slate-950 hover:bg-cyan-400 disabled:opacity-40"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function HandleStatus({ status }: { status: 'idle' | 'checking' | 'ok' | 'taken' | 'reserved' | 'invalid' }) {
  if (status === 'idle') return null;
  const map = {
    checking: { text: 'Checking...', color: 'text-slate-400' },
    ok: { text: 'Available', color: 'text-green-400' },
    taken: { text: 'Already taken', color: 'text-red-400' },
    reserved: { text: 'Reserved word', color: 'text-amber-400' },
    invalid: { text: '3-20 chars, a-z0-9_, starting with a letter', color: 'text-red-400' },
  } as const;
  const s = map[status];
  return <p className={`mt-1 text-xs font-mono ${s.color}`}>{s.text}</p>;
}
