/*
 * RhythmMania - High-Performance Rhythm Game Platform
 * Copyright (C) 2026 Yumo (yumo-ymspace). All rights reserved.
 *
 * This source code is licensed under the PolyForm Perimeter License 1.0.1.
 * For the full license terms, see LICENSE.md in the repository root.
 */

import React from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, BookOpen, FileText, Shield } from 'lucide-react';

interface LegalPageProps {
  onBack: () => void;
}

const LastUpdated = ({ date = '2 August 2026' }: { date?: string }) => (
  <p className="text-xs text-slate-400 font-mono mt-0.5 uppercase tracking-wider">
    Last updated: {date}
  </p>
);

const LegalShell: React.FC<{
  onBack: () => void;
  accent: 'pink' | 'cyan';
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}> = ({ onBack, accent, icon, title, children }) => {
  const isPink = accent === 'pink';
  return (
    <div className="h-screen overflow-y-auto w-full bg-[#050508] text-slate-100 font-sans pb-16 relative">
      <div className={`absolute top-0 left-1/4 w-[500px] h-[500px] ${isPink ? 'bg-pink-500/5' : 'bg-cyan-500/5'} rounded-full blur-[120px] pointer-events-none`} />
      <div className={`absolute bottom-0 right-1/4 w-[600px] h-[600px] ${isPink ? 'bg-purple-500/5' : 'bg-blue-500/5'} rounded-full blur-[150px] pointer-events-none`} />
      <div className="border-b border-white/10 bg-[#08080f]/80 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <button onClick={onBack} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-300 hover:text-white hover:bg-white/10 hover:border-white/20 transition-all cursor-pointer text-xs md:text-sm font-semibold uppercase tracking-wider">
            <ArrowLeft className="w-4 h-4" />
            Back to Game
          </button>
          <div className={`flex items-center gap-2 ${isPink ? 'text-pink-500' : 'text-cyan-500'} font-mono text-xs font-black uppercase tracking-widest`}>
            <BookOpen className="w-4 h-4" />
            Legal Document
          </div>
        </div>
      </div>
      <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="max-w-4xl mx-auto px-4 mt-8 md:mt-12">
        <div className="bg-[#0b0b14] border border-white/10 rounded-2xl p-6 md:p-10 shadow-2xl relative overflow-hidden">
          <div className={`absolute top-0 right-0 w-20 h-20 bg-gradient-to-br from-transparent ${isPink ? 'to-pink-500/10' : 'to-cyan-500/10'} pointer-events-none`} />
          <div className="flex items-center gap-3.5 mb-6 border-b border-white/5 pb-6">
            <div className={`p-3 ${isPink ? 'bg-pink-500/10 border-pink-500/20 text-pink-500' : 'bg-cyan-500/10 border-cyan-500/20 text-cyan-500'} border rounded-xl`}>
              {icon}
            </div>
            <div>
              <h1 className="text-2xl md:text-3.5xl font-black tracking-tight text-white uppercase font-sans">{title}</h1>
              <LastUpdated />
            </div>
          </div>
          <div className="prose prose-invert prose-slate max-w-none text-slate-300 text-sm md:text-base leading-relaxed space-y-6 select-text">
            {children}
          </div>
        </div>
      </motion.div>
    </div>
  );
};

const Section: React.FC<{ number: string; title: string; children: React.ReactNode; accent?: 'pink' | 'cyan' }> = ({ number, title, children, accent = 'pink' }) => (
  <section className="space-y-3">
    <h2 className="text-lg md:text-xl font-bold text-white flex items-center gap-2 uppercase tracking-wide">
      <span className={`${accent === 'pink' ? 'text-pink-500' : 'text-cyan-500'} font-mono text-sm font-black`}>{number}.</span> {title}
    </h2>
    {children}
  </section>
);

const Divider = () => <hr className="border-white/5 my-6" />;

export const TermsOfServicePage: React.FC<LegalPageProps> = ({ onBack }) => (
  <LegalShell onBack={onBack} accent="pink" icon={<FileText className="w-6 h-6 md:w-7 md:h-7" />} title="Terms of Service">
    <Section number="01" title="Agreement and service scope">
      <p>These Terms govern your use of RhythmMania, a browser-based rhythm game and its optional account, profile, catalog, and replay features. By using the service, you agree to these Terms. If you do not agree, do not use RhythmMania.</p>
      <p>RhythmMania is provided by the project operator identified in the copyright and repository notices. These Terms do not replace rights that cannot be excluded under the law where you live.</p>
    </Section>
    <Divider />
    <Section number="02" title="Eligibility and accounts">
      <p>You may use local gameplay without an account. Google Sign-In is required for cloud catalog access, public profiles, and replay uploads. You must provide accurate information, keep access to your Google account secure, and not use another person&apos;s account.</p>
      <p>RhythmMania is intended only for people who are at least 18 years old. Minors may not access or use the service, including local gameplay and connected features, even with parental permission. We may suspend access or remove data that violates these Terms or creates a security, legal, or operational risk.</p>
    </Section>
    <Divider />
    <Section number="03" title="Local gameplay and cloud features">
      <p>Settings, imported maps, packages, favorites, and local play history are stored in your browser. They are not automatically sent to RhythmMania. Clearing browser storage, using private browsing, or changing browsers can remove or make that data unavailable.</p>
      <p>Signed-in users can browse the bundled and eligible osu!mania catalog, download catalog maps, edit a public profile, choose or upload an avatar, and upload eligible replays. Only supported, verified chart revisions can receive an online replay upload.</p>
      <p>Uploaded replays contain score and performance data, selected modifiers and settings, and input replay frames. Eligible non-failed, non-autoplay replays may appear in public rankings, replay listings, and public profile statistics. Local-only, failed, autoplay, and unsupported runs are not eligible for online upload.</p>
    </Section>
    <Divider />
    <Section number="04" title="Content and intellectual property">
      <p>RhythmMania software and original site materials are protected by applicable intellectual-property laws. The source repository is separately governed by the PolyForm Perimeter License 1.0.1; that license controls permissions to copy, modify, and distribute the code.</p>
      <p>Beatmaps, music, artwork, videos, trademarks, and links supplied by catalog sources or third parties may belong to their respective owners. You are responsible for having the rights needed to import, store, or use material locally. RhythmMania does not grant a license to third-party content.</p>
      <p>Text, profile details, social links, avatars, and replay data that you submit must be lawful, accurate, and non-infringing. You grant RhythmMania the limited permission needed to host, process, display, and back up that material to provide the features you request.</p>
    </Section>
    <Divider />
    <Section number="05" title="Acceptable use">
      <p>You must not cheat, falsify replay data, manipulate rankings, scrape or overload the service, bypass access controls, probe or damage systems, distribute malware, impersonate another person, infringe rights, or use the service for unlawful harassment or abuse. Automated access is permitted only where expressly authorized.</p>
      <p>We may remove content, invalidate scores, limit features, or suspend accounts when necessary to enforce these rules, protect users, or comply with law.</p>
    </Section>
    <Divider />
    <Section number="06" title="Third-party services and availability">
      <p>Sign-in is provided through Google. Cloud catalog downloads may be retrieved from external osu! ecosystem or mirror services. Those providers have their own terms and privacy practices, and RhythmMania does not control their availability or processing.</p>
      <p>The service, catalog, and stored data may change, be interrupted, or be unavailable. RhythmMania is provided on an “as is” and “as available” basis to the maximum extent permitted by law. We do not guarantee uninterrupted operation, error-free gameplay, preservation of local browser data, or continued availability of third-party material.</p>
    </Section>
    <Divider />
    <Section number="07" title="Liability and changes">
      <p>To the maximum extent permitted by law, RhythmMania and its contributors are not liable for indirect, incidental, special, consequential, or data-loss damages arising from use of the service. Nothing here limits liability that cannot legally be limited.</p>
      <p>We may update these Terms when the service or law changes. The “Last updated” date identifies the current version. Continued use after an update means you accept the revised Terms where that effect is permitted by law.</p>
    </Section>
    <Divider />
    <Section number="08" title="Contact">
      <p>Questions about these Terms, account data, or rights requests may be sent to <strong>privacy@rhythm-mania.com</strong>. Copyright concerns may be sent to <strong>copyright@rhythm-mania.com</strong> with enough detail for us to identify the material and contact you.</p>
    </Section>
  </LegalShell>
);

export const PrivacyPolicyPage: React.FC<LegalPageProps> = ({ onBack }) => (
  <LegalShell onBack={onBack} accent="cyan" icon={<Shield className="w-6 h-6 md:w-7 md:h-7" />} title="Privacy Policy">
    <Section number="01" title="What this policy covers" accent="cyan">
      <p>This policy explains what RhythmMania processes when you use local gameplay, sign in, use the cloud catalog, publish a profile, or upload a replay. RhythmMania is designed to work offline first. We do not sell personal information or use it for behavioral advertising.</p>
      <p>The policy covers the RhythmMania website and its related API endpoints. It does not cover Google, osu!, external download mirrors, or other third-party services.</p>
    </Section>
    <Divider />
    <Section number="02" title="Information stored in your browser" accent="cyan">
      <ul className="list-disc list-inside pl-4 space-y-2">
        <li><strong>Local storage:</strong> settings, key bindings, offsets, favorites, selected maps, history, and other UI preferences.</li>
        <li><strong>IndexedDB:</strong> imported beatmaps and retained package/media data used for local play.</li>
        <li><strong>Temporary data:</strong> audio, video, replay, and object URLs used during a session.</li>
      </ul>
      <p>This data is controlled by your browser, not routinely readable by our backend. You can remove it through the game&apos;s available controls or your browser&apos;s site-data settings. Removing it may delete local maps and history.</p>
    </Section>
    <Divider />
    <Section number="03" title="Information processed for accounts" accent="cyan">
      <p>When you sign in with Google, Google sends us the account identifier and profile fields needed for authentication, including your email address, name, and profile image when available. We store a RhythmMania user ID, username, email, Google identifier, and avatar URL.</p>
      <p>We create a server-side session and set an HTTP-only, SameSite session cookie named <code>rm_session_token</code>. Sessions are currently issued for up to 30 days. A short-lived HTTP-only OAuth state cookie is used to protect the sign-in flow and expires after 10 minutes.</p>
    </Section>
    <Divider />
    <Section number="04" title="Profiles, avatars, and replays" accent="cyan">
      <p>You may choose to publish a display name, handle, biography, social links, activity status, and activity message. Public profile pages expose profile information, avatar, non-private identity fields, aggregate statistics, and recent non-failed replay results. Your email is shown only on your own profile response.</p>
      <p>If you upload an avatar, we store the JPEG, PNG, or WebP image you provide, up to 2 MB, so it can be served from your profile. Preset avatar selection stores a reference to a bundled image.</p>
      <p>An uploaded replay may include its record ID, chart identity and checksum, score, accuracy, combo, grade, failed state, score state, replay frames, recorded settings, and modifiers. We use this data for validation, leaderboards, replay viewing, and profile statistics. Replay uploads are associated with your account and are retained until deleted or no longer needed for those purposes.</p>
    </Section>
    <Divider />
    <Section number="05" title="Catalog and technical processing" accent="cyan">
      <p>Signed-in catalog searches and downloads are processed through the RhythmMania API. Search requests may include your account ID for access control and rate limiting. Catalog services may receive requests needed to find or retrieve a map; their own privacy policies apply.</p>
      <p>Like most web services, our hosting, database, and security infrastructure may process request metadata such as IP address, timestamps, user agent, and error logs. We use this information for authentication, abuse prevention, troubleshooting, and service operation. We do not use it to build an advertising profile.</p>
    </Section>
    <Divider />
    <Section number="06" title="Sharing and retention" accent="cyan">
      <p>We share information only as needed to operate the service: with Google for OAuth sign-in, with hosting/database providers that process data on our behalf, and with external catalog or download services when you request those features. We may disclose information where required by law or to protect the service, users, or rights of others.</p>
      <p>Account records, profiles, avatars, sessions, and uploaded replays are stored on server infrastructure. Sessions expire after their stated lifetime. Other account data is kept while the account or feature is active, or longer where needed for security, legal, dispute, or leaderboard-integrity purposes. Local browser data follows your browser&apos;s retention rules.</p>
    </Section>
    <Divider />
    <Section number="07" title="Your choices and rights" accent="cyan">
      <p>You can play locally without signing in, decline optional cloud features, edit your profile, log out, and delete local browser data. You may request access, correction, deletion, or restriction of server-held personal data by emailing <strong>privacy@rhythm-mania.com</strong>. We may need to verify the request and may retain limited information where law or legitimate security and integrity needs require it.</p>
      <p>Depending on where you live, you may also have the right to object to or limit processing and to complain to a data-protection authority. We do not use automated decision-making to make decisions with legal or similarly significant effects.</p>
    </Section>
    <Divider />
    <Section number="08" title="Children, security, and updates" accent="cyan">
      <p>RhythmMania is not directed to, and may not be used by, anyone under 18. We do not knowingly collect personal information from minors. If we learn that a minor has used the service or provided personal information, we will take reasonable steps to restrict access and delete the information, subject to legal and security requirements. A parent or guardian may contact us at <strong>privacy@rhythm-mania.com</strong> about suspected minor data.</p>
      <p>We use reasonable technical and organizational measures, including HTTPS deployment where configured, secure OAuth state validation, HTTP-only session cookies, access controls, and server-side validation. No internet service can guarantee absolute security.</p>
      <p>We may update this policy as the product or legal requirements change. The current version and its “Last updated” date are posted on this page.</p>
    </Section>
    <Divider />
    <Section number="09" title="Contact" accent="cyan">
      <p>For privacy questions or rights requests, contact <strong>privacy@rhythm-mania.com</strong>.</p>
    </Section>
  </LegalShell>
);
