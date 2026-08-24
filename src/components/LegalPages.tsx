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

import React from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, BookOpen, FileText, Shield, Mail, ExternalLink } from 'lucide-react';

interface LegalPageProps {
  onBack: () => void;
}

const LastUpdated = ({ date = '24 August 2026' }: { date?: string }) => (
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

const Section: React.FC<{ id?: string; number: string; title: string; children: React.ReactNode; accent?: 'pink' | 'cyan' }> = ({ id, number, title, children, accent = 'pink' }) => (
  <section id={id} className="space-y-3 pt-2 scroll-mt-20">
    <h2 className="text-lg md:text-xl font-bold text-white flex items-center gap-2 uppercase tracking-wide">
      <span className={`${accent === 'pink' ? 'text-pink-500' : 'text-cyan-500'} font-mono text-sm font-black`}>{number}.</span> {title}
    </h2>
    {children}
  </section>
);

const Divider = () => <hr className="border-white/5 my-6" />;

export const TermsOfServicePage: React.FC<LegalPageProps> = ({ onBack }) => (
  <LegalShell onBack={onBack} accent="pink" icon={<FileText className="w-6 h-6 md:w-7 md:h-7" />} title="Terms of Service">
    <div className="bg-pink-950/30 border border-pink-500/20 rounded-xl p-4 md:p-5 space-y-3">
      <p className="text-slate-200">
        These Terms of Service (&ldquo;Terms&rdquo;) constitute a legally binding agreement between you and <strong className="text-white">YMSpace INC.</strong> (&ldquo;we&rdquo;, &ldquo;us&rdquo;, or &ldquo;our&rdquo;), governing your access to and use of the <strong className="text-white">RhythmMania</strong> website (<a href="https://rhythm-mania.com" className="text-pink-400 underline hover:text-pink-300">rhythm-mania.com</a>), applications, precision mania-style rhythm game, and associated cloud features (collectively, the &ldquo;Services&rdquo;).
      </p>
      <p className="text-slate-300 text-sm">
        <strong className="text-white">Please read these Terms carefully.</strong> By accessing or using any part of the Services, you agree to be bound by these Terms. If you do not agree with all of these Terms, you are expressly prohibited from using the Services and must discontinue use immediately.
      </p>
    </div>

    <Divider />

    {/* TABLE OF CONTENTS */}
    <div className="bg-[#0e0e18] border border-white/5 rounded-xl p-4 md:p-5 space-y-3">
      <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono text-pink-400">Terms of Service &mdash; Table of Contents</h3>
      <ol className="grid grid-cols-1 sm:grid-cols-2 gap-y-1.5 gap-x-4 text-xs md:text-sm font-mono list-decimal list-inside text-slate-300">
        <li><a href="#tos-1" className="hover:text-pink-300 transition-colors">AGREEMENT & SERVICE SCOPE</a></li>
        <li><a href="#tos-2" className="hover:text-pink-300 transition-colors">ELIGIBILITY & AGE REQUIREMENTS</a></li>
        <li><a href="#tos-3" className="hover:text-pink-300 transition-colors">USER ACCOUNTS & AUTHENTICATION</a></li>
        <li><a href="#tos-4" className="hover:text-pink-300 transition-colors">LOCAL GAMEPLAY & CLOUD FEATURES</a></li>
        <li><a href="#tos-5" className="hover:text-pink-300 transition-colors">INTELLECTUAL PROPERTY & CODE LICENSE</a></li>
        <li><a href="#tos-6" className="hover:text-pink-300 transition-colors">THIRD-PARTY BEATMAPS & CONTENT</a></li>
        <li><a href="#tos-7" className="hover:text-pink-300 transition-colors">USER-SUBMITTED DATA & REPLAYS</a></li>
        <li><a href="#tos-8" className="hover:text-pink-300 transition-colors">ACCEPTABLE USE & ANTI-CHEAT POLICY</a></li>
        <li><a href="#tos-9" className="hover:text-pink-300 transition-colors">THIRD-PARTY SERVICES & INTEGRATIONS</a></li>
        <li><a href="#tos-10" className="hover:text-pink-300 transition-colors">DISCLAIMERS & &ldquo;AS IS&rdquo; OPERATION</a></li>
        <li><a href="#tos-11" className="hover:text-pink-300 transition-colors">LIMITATION OF LIABILITY</a></li>
        <li><a href="#tos-12" className="hover:text-pink-300 transition-colors">INDEMNIFICATION</a></li>
        <li><a href="#tos-13" className="hover:text-pink-300 transition-colors">TERMINATION & ACCOUNT CLOSURE</a></li>
        <li><a href="#tos-14" className="hover:text-pink-300 transition-colors">GOVERNING LAW & JURISDICTION</a></li>
        <li><a href="#tos-15" className="hover:text-pink-300 transition-colors">CHANGES TO THESE TERMS</a></li>
        <li><a href="#tos-16" className="hover:text-pink-300 transition-colors">CONTACT INFORMATION</a></li>
      </ol>
    </div>

    <Divider />

    <Section id="tos-1" number="01" title="Agreement and service scope">
      <p>RhythmMania is a high-performance, precision mania-style web rhythm game designed to run locally in the browser with optional cloud connectivity for public player profiles, cloud catalog discovery, authoritative replay verification, and online leaderboards.</p>
      <p>These Terms govern all access to and use of RhythmMania provided by YMSpace INC. These Terms do not replace or limit mandatory consumer protection rights that cannot be lawfully excluded under the applicable laws of your country of residence.</p>
    </Section>

    <Divider />

    <Section id="tos-2" number="02" title="Eligibility and age requirements">
      <p>RhythmMania is strictly intended for individuals who are at least <strong className="text-white">18 years of age</strong> or the legal age of majority in your jurisdiction. Minors under 18 years old may not access or use the Services, including offline gameplay and connected online features, even with parental consent.</p>
      <p>By accessing or using the Services, you represent and warrant that you meet this age requirement. If we discover that a user is under 18, we will immediately deactivate their account, invalidate associated leaderboard records, and delete their personal data.</p>
    </Section>

    <Divider />

    <Section id="tos-3" number="03" title="User accounts and authentication">
      <p>You may enjoy local, offline gameplay without creating an account. Connecting with a Google account is required to participate in public leaderboards, publish profile information, upload verified replays, and access cloud catalog features.</p>
      <p>When authenticating via Google Sign-In, you agree to: (a) provide accurate information; (b) maintain the security of your Google account credentials; (c) never access the account of another user without authorization; and (d) promptly notify us if you discover any unauthorized use of your account.</p>
    </Section>

    <Divider />

    <Section id="tos-4" number="04" title="Local gameplay and cloud features">
      <p>RhythmMania operates on an offline-first architecture. All imported beatmap charts, audio files, video backgrounds, key bindings, volume balances, scroll speeds, visual/audio calibration offsets, and local play history records are stored directly inside your browser storage (IndexedDB and LocalStorage).</p>
      <p>We do not automatically back up or sync local browser files. Clearing your browser site data, resetting cookies, switching browsers, or using incognito mode will permanently delete your locally stored beatmaps and play history records. You are solely responsible for retaining backup copies of any custom beatmap packages you import.</p>
    </Section>

    <Divider />

    <Section id="tos-5" number="05" title="Intellectual property and code license">
      <p>The RhythmMania website, software platform, original graphics, UI design, sound effects, brand assets, and logos are the intellectual property of YMSpace INC. and are protected by international copyright, trademark, and intellectual property laws.</p>
      <p>The source code of the RhythmMania platform is separately released under the <strong className="text-white">PolyForm Perimeter License 1.0.1</strong> by yumo-ymspace. That license specifies the precise legal permissions and restrictions regarding copying, modifying, and distributing the source code for non-competing purposes with mandatory attribution to yumo-ymspace.</p>
    </Section>

    <Divider />

    <Section id="tos-6" number="06" title="Third-party beatmaps and content">
      <p>Beatmaps, songs, audio files, background artwork, music videos, and hitsounds imported into the game or discovered via external catalog mirrors belong to their respective artists, composers, and mappers. RhythmMania does not own or claim ownership of third-party musical compositions or audio-visual materials.</p>
      <p>You are solely responsible for ensuring that you possess all necessary rights, permissions, or legal exceptions to download, import, store, and play third-party content locally. If you are a copyright owner and believe that content accessible through our services infringes your intellectual property, please contact us immediately at <a href="mailto:ymspace.official@gmail.com" className="text-pink-400 underline">ymspace.official@gmail.com</a>.</p>
    </Section>

    <Divider />

    <Section id="tos-7" number="07" title="User-submitted data and replays">
      <p>When you submit public profile details (display names, handles, bios, social links, custom avatars) or upload verified gameplay replays (scores, accuracy, combo, judgement counts, and timestamped lane input frames), you grant RhythmMania a worldwide, royalty-free, non-exclusive license to store, process, display, simulate, and distribute that data for the purposes of operating leaderboards, community spectator viewing, and profile showcases.</p>
      <p>You represent and warrant that any content you submit does not infringe the rights of any third party, is not unlawful or defamatory, and complies with these Terms.</p>
    </Section>

    <Divider />

    <Section id="tos-8" number="08" title="Acceptable use and anti-cheat policy">
      <p>We are dedicated to maintaining a fair, secure, and competitive rhythm gaming environment. You agree that you will not, under any circumstances:</p>
      <ul className="list-disc list-inside pl-2 space-y-1.5 text-slate-300">
        <li><strong>Cheat or Manipulate Gameplay:</strong> Use macros, automated bots, playback speed modifiers, memory tampering tools, or modified clients to generate artificial inputs, bypass judgement windows, or falsify replay data.</li>
        <li><strong>Manipulate Rankings:</strong> Exploit bugs or glitches to artificially inflate scores, boost leaderboard rankings, or disrupt competitive leaderboards.</li>
        <li><strong>Interfere with Infrastructure:</strong> Scrape, overload, or launch Denial of Service (DDoS) attacks against our servers, or probe for system vulnerabilities.</li>
        <li><strong>Abuse or Impersonate:</strong> Harass, threaten, or impersonate other players, or submit obscene, offensive, or infringing profile avatars and bios.</li>
      </ul>
      <p>Violating our Anti-Cheat and Acceptable Use policy will result in immediate disqualification, deletion of scores and replays, and permanent account termination without prior notice.</p>
    </Section>

    <Divider />

    <Section id="tos-9" number="09" title="Third-party services and integrations">
      <p>RhythmMania offers optional integrations with third-party platforms, such as Google Sign-In and the osu! API v2 for catalog search. These third parties operate independently under their own terms and privacy policies.</p>
      <p>We do not control and are not responsible for the availability, uptime, accuracy, or content provided by external third-party services or download mirrors. Your use of third-party features is at your own discretion and risk.</p>
    </Section>

    <Divider />

    <Section id="tos-10" number="10" title="Disclaimers and &ldquo;as is&rdquo; operation">
      <p>The Services are provided on an <strong className="text-white">&ldquo;AS IS&rdquo;</strong> and <strong className="text-white">&ldquo;AS AVAILABLE&rdquo;</strong> basis without warranties of any kind, whether express, implied, statutory, or otherwise, including but not limited to implied warranties of merchantability, fitness for a particular purpose, and non-infringement.</p>
      <p>We do not warrant that: (a) the Services will be uninterrupted, secure, or error-free; (b) defects or bugs will be immediately corrected; (c) gameplay timing, audio synchronization, or visual rendering will be completely uninterrupted on every device; or (d) locally stored browser data will remain permanent.</p>
    </Section>

    <Divider />

    <Section id="tos-11" number="11" title="Limitation of liability">
      <p>To the maximum extent permitted by applicable law, in no event shall YMSpace INC., its contributors, or affiliates be liable for any indirect, incidental, special, consequential, or punitive damages, including loss of data, loss of goodwill, device malfunction, or gameplay interruption, arising out of or in connection with your access to or use of (or inability to use) the Services.</p>
    </Section>

    <Divider />

    <Section id="tos-12" number="12" title="Indemnification">
      <p>You agree to defend, indemnify, and hold harmless YMSpace INC. and its contributors from and against any claims, liabilities, damages, losses, and expenses (including reasonable legal fees) arising out of or in any way connected with: (a) your breach of these Terms; (b) your violation of any third-party intellectual property or privacy right; or (c) any content or replays you submit to the platform.</p>
    </Section>

    <Divider />

    <Section id="tos-13" number="13" title="Termination and account closure">
      <p>You may stop using the Services at any time and may request the deletion of your account and personal data by emailing us. We reserve the right, without prior notice or liability, to suspend or terminate your account and access to the Services if you breach these Terms, violate fair-play policies, or pose a security risk to the community.</p>
    </Section>

    <Divider />

    <Section id="tos-14" number="14" title="Governing law and jurisdiction">
      <p>These Terms shall be governed by and construed in accordance with the laws of <strong className="text-white">Singapore</strong>, without regard to its conflict of law principles. Any dispute arising out of or related to these Terms or the Services shall be submitted to the exclusive jurisdiction of the competent courts of Singapore.</p>
    </Section>

    <Divider />

    <Section id="tos-15" number="15" title="Changes to these Terms">
      <p>We reserve the right to revise or update these Terms at any time. When updates are made, we will revise the &ldquo;Last updated&rdquo; date at the top of this page. Your continued access to or use of the Services after revised Terms become effective constitutes your acceptance of the new Terms.</p>
    </Section>

    <Divider />

    <Section id="tos-16" number="16" title="Contact information">
      <p>If you have any questions, comments, or legal notices concerning these Terms of Service, please contact us at:</p>
      <div className="bg-[#0e0e18] border border-white/10 rounded-xl p-4 text-xs md:text-sm font-mono space-y-1 text-slate-300">
        <p className="font-bold text-white">YMSpace INC.</p>
        <p>Singapore</p>
        <p className="flex items-center gap-2 text-pink-400 mt-2">
          <Mail className="w-4 h-4" />
          <a href="mailto:ymspace.official@gmail.com" className="underline">ymspace.official@gmail.com</a>
        </p>
      </div>
    </Section>
  </LegalShell>
);

export const PrivacyPolicyPage: React.FC<LegalPageProps> = ({ onBack }) => (
  <LegalShell onBack={onBack} accent="cyan" icon={<Shield className="w-6 h-6 md:w-7 md:h-7" />} title="Privacy Policy">
    <div className="bg-cyan-950/30 border border-cyan-500/20 rounded-xl p-4 md:p-5 space-y-3">
      <p className="text-slate-200">
        This Privacy Notice describes how and why we might access, collect, store, use, and/or share (&ldquo;process&rdquo;) your personal information when you use our services (&ldquo;Services&rdquo;), including when you:
      </p>
      <ul className="list-disc list-inside space-y-1 text-slate-300 text-sm">
        <li>Visit our website at <strong className="text-white">rhythm-mania.com</strong> or any website of ours that links to this Privacy Notice</li>
        <li>Download and use our application (Rhythm Mania), or any other application of ours that links to this Privacy Notice</li>
        <li>Use RhythmMania &mdash; a precision mania-style rhythm game that runs entirely in the browser</li>
        <li>Engage with us in other related ways, including any customer support, marketing, or events</li>
      </ul>
      <p className="text-slate-300 text-sm">
        <strong className="text-white">Questions or concerns?</strong> Reading this Privacy Notice will help you understand your privacy rights and choices. We are responsible for making decisions about how your personal information is processed. If you do not agree with our policies and practices, please do not use our Services. If you still have any questions or concerns, please contact us at <a href="mailto:ymspace.official@gmail.com" className="text-cyan-400 underline hover:text-cyan-300 font-mono">ymspace.official@gmail.com</a>.
      </p>
    </div>

    <Divider />

    {/* SUMMARY OF KEY POINTS */}
    <div className="space-y-4">
      <h2 className="text-lg md:text-xl font-bold text-white uppercase tracking-wide flex items-center gap-2">
        <span className="text-cyan-400 font-mono text-sm font-black">&#9670;</span> Summary of Key Points
      </h2>
      <p className="text-slate-300 text-sm">
        This summary provides key points from our Privacy Notice. You can find more details about any of these topics by navigating to the corresponding section below.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs md:text-sm">
        <div className="bg-white/[0.02] border border-white/5 rounded-lg p-3 space-y-1">
          <strong className="text-white block font-semibold">What personal information do we process?</strong>
          <span className="text-slate-400">When you use our Services, we process information depending on how you interact with us, your choices, and features used (e.g. Google profile data, user profile details, avatars, and gameplay scores).</span>
        </div>
        <div className="bg-white/[0.02] border border-white/5 rounded-lg p-3 space-y-1">
          <strong className="text-white block font-semibold">Do we process sensitive personal information?</strong>
          <span className="text-slate-400">We do not process sensitive personal information (such as racial/ethnic origin, religious beliefs, or health data).</span>
        </div>
        <div className="bg-white/[0.02] border border-white/5 rounded-lg p-3 space-y-1">
          <strong className="text-white block font-semibold">Do we collect information from third parties?</strong>
          <span className="text-slate-400">We do not collect third-party personal data, except basic profile fields authorized by you during Google OAuth sign-in.</span>
        </div>
        <div className="bg-white/[0.02] border border-white/5 rounded-lg p-3 space-y-1">
          <strong className="text-white block font-semibold">How do we process your information?</strong>
          <span className="text-slate-400">To provide, improve, and administer our Services, authenticate accounts, verify replay scores, prevent security fraud, and comply with law.</span>
        </div>
        <div className="bg-white/[0.02] border border-white/5 rounded-lg p-3 space-y-1">
          <strong className="text-white block font-semibold">When and with whom do we share information?</strong>
          <span className="text-slate-400">We do not sell personal data. Data is shared only with core hosting/cloud infrastructure providers and in business transfer scenarios.</span>
        </div>
        <div className="bg-white/[0.02] border border-white/5 rounded-lg p-3 space-y-1">
          <strong className="text-white block font-semibold">How do we keep your information safe?</strong>
          <span className="text-slate-400">We implement reasonable organizational and technical safeguards. However, no internet transmission can be guaranteed 100% secure.</span>
        </div>
        <div className="bg-white/[0.02] border border-white/5 rounded-lg p-3 space-y-1">
          <strong className="text-white block font-semibold">What are your privacy rights?</strong>
          <span className="text-slate-400">Depending on your location (EEA, UK, Switzerland, Canada, US, Australia), you have rights to access, correct, export, or delete your personal data.</span>
        </div>
        <div className="bg-white/[0.02] border border-white/5 rounded-lg p-3 space-y-1">
          <strong className="text-white block font-semibold">How do you exercise your rights?</strong>
          <span className="text-slate-400">You can manage profile data in-game or contact us directly at <a href="mailto:ymspace.official@gmail.com" className="text-cyan-400 underline">ymspace.official@gmail.com</a>.</span>
        </div>
      </div>
    </div>

    <Divider />

    {/* TABLE OF CONTENTS */}
    <div className="bg-[#0e0e18] border border-white/5 rounded-xl p-4 md:p-5 space-y-3">
      <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono text-cyan-400">Table of Contents</h3>
      <ol className="grid grid-cols-1 sm:grid-cols-2 gap-y-1.5 gap-x-4 text-xs md:text-sm font-mono list-decimal list-inside text-slate-300">
        <li><a href="#sec-1" className="hover:text-cyan-300 transition-colors">WHAT INFORMATION DO WE COLLECT?</a></li>
        <li><a href="#sec-2" className="hover:text-cyan-300 transition-colors">HOW DO WE PROCESS YOUR INFORMATION?</a></li>
        <li><a href="#sec-3" className="hover:text-cyan-300 transition-colors">WHAT LEGAL BASES DO WE RELY ON?</a></li>
        <li><a href="#sec-4" className="hover:text-cyan-300 transition-colors">WHEN AND WITH WHOM DO WE SHARE INFORMATION?</a></li>
        <li><a href="#sec-5" className="hover:text-cyan-300 transition-colors">COOKIES AND TRACKING TECHNOLOGIES</a></li>
        <li><a href="#sec-6" className="hover:text-cyan-300 transition-colors">HOW DO WE HANDLE SOCIAL LOGINS?</a></li>
        <li><a href="#sec-7" className="hover:text-cyan-300 transition-colors">HOW LONG DO WE KEEP YOUR INFORMATION?</a></li>
        <li><a href="#sec-8" className="hover:text-cyan-300 transition-colors">HOW DO WE KEEP YOUR INFORMATION SAFE?</a></li>
        <li><a href="#sec-9" className="hover:text-cyan-300 transition-colors">DO WE COLLECT INFORMATION FROM MINORS?</a></li>
        <li><a href="#sec-10" className="hover:text-cyan-300 transition-colors">WHAT ARE YOUR PRIVACY RIGHTS?</a></li>
        <li><a href="#sec-11" className="hover:text-cyan-300 transition-colors">CONTROLS FOR DO-NOT-TRACK FEATURES</a></li>
        <li><a href="#sec-12" className="hover:text-cyan-300 transition-colors">UNITED STATES RESIDENTS PRIVACY RIGHTS</a></li>
        <li><a href="#sec-13" className="hover:text-cyan-300 transition-colors">OTHER REGIONAL PRIVACY RIGHTS</a></li>
        <li><a href="#sec-14" className="hover:text-cyan-300 transition-colors">DO WE MAKE UPDATES TO THIS NOTICE?</a></li>
        <li><a href="#sec-15" className="hover:text-cyan-300 transition-colors">HOW CAN YOU CONTACT US ABOUT THIS NOTICE?</a></li>
        <li><a href="#sec-16" className="hover:text-cyan-300 transition-colors">REVIEW, UPDATE, OR DELETE COLLECTED DATA</a></li>
      </ol>
    </div>

    <Divider />

    {/* SECTION 1 */}
    <Section id="sec-1" number="01" title="What information do we collect?" accent="cyan">
      <div className="space-y-4">
        <div>
          <h3 className="text-white font-semibold text-sm md:text-base">Personal information you disclose to us</h3>
          <p className="text-slate-400 text-xs italic mb-2"><strong>In Short:</strong> We collect personal information that you provide to us.</p>
          <p>We collect personal information that you voluntarily provide to us when you register on the Services, express an interest in obtaining information about us or our products and Services, participate in activities on the Services, or otherwise contact us.</p>
          <p>The personal information we collect depends on the context of your interactions with us and the Services, the choices you make, and the features you use. This may include:</p>
          <ul className="list-disc list-inside pl-2 space-y-1 text-slate-300">
            <li><strong>Names and Usernames:</strong> Display names, profile handles, and account names.</li>
            <li><strong>Email Addresses:</strong> Primary email provided through Google Sign-In (kept private).</li>
            <li><strong>Authentication & Profile Data:</strong> User avatars, profile biographies, social media links, activity status, and uploaded gameplay score/replay records.</li>
          </ul>
        </div>

        <div>
          <h3 className="text-white font-semibold text-sm md:text-base">Sensitive Information</h3>
          <p>We do not process sensitive information (such as racial or ethnic origins, sexual orientation, genetic data, or religious beliefs).</p>
        </div>

        <div>
          <h3 className="text-white font-semibold text-sm md:text-base">Social Media & Google Login Data</h3>
          <p>Our Services offer you the ability to register and log in using your Google account. When you do so, we collect authentication identifiers and profile details as described in Section 6.</p>
        </div>

        <div>
          <h3 className="text-white font-semibold text-sm md:text-base">Application & Device Data</h3>
          <p>When you access our application, we may automatically collect technical diagnostic information including browser type, operating system, version information, system configuration, hardware model, network identifiers, and Internet Protocol (IP) address. This information is needed to maintain security, troubleshoot performance, and prevent automated abuse.</p>
        </div>

        <div className="bg-white/[0.02] border border-white/5 rounded-lg p-3">
          <h3 className="text-white font-semibold text-sm">Google API Limited Use Disclosure</h3>
          <p className="text-xs text-slate-300 mt-1">
            Our use of information received from Google APIs adheres to the <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer" className="text-cyan-400 underline inline-flex items-center gap-1">Google API Services User Data Policy <ExternalLink className="w-3 h-3" /></a>, including the <a href="https://developers.google.com/terms/api-services-user-data-policy#limited-use" target="_blank" rel="noopener noreferrer" className="text-cyan-400 underline">Limited Use requirements</a>.
          </p>
        </div>
      </div>
    </Section>

    <Divider />

    {/* SECTION 2 */}
    <Section id="sec-2" number="02" title="How do we process your information?" accent="cyan">
      <p className="text-slate-400 text-xs italic"><strong>In Short:</strong> We process your information to provide, improve, and administer our Services, communicate with you, for security and fraud prevention, and to comply with law.</p>
      <p>We process your personal information for a variety of reasons depending on how you interact with our Services, including:</p>
      <ul className="list-disc list-inside pl-2 space-y-1.5 text-slate-300">
        <li><strong>To facilitate account creation and authentication:</strong> Managing your sign-in session and maintaining your account.</li>
        <li><strong>To deliver and facilitate delivery of services:</strong> Storing your public profile, rendering score rankings on leaderboards, and verifying competitive replay submissions.</li>
        <li><strong>To protect security and vital interests:</strong> Preventing cheating, mitigating DDoS or API abuse, and securing the platform against unauthorized access.</li>
      </ul>
    </Section>

    <Divider />

    {/* SECTION 3 */}
    <Section id="sec-3" number="03" title="What legal bases do we rely on to process your personal information?" accent="cyan">
      <p className="text-slate-400 text-xs italic"><strong>In Short:</strong> We only process your personal information when we believe it is necessary and have a valid legal reason (legal basis) under applicable law.</p>
      
      <h3 className="text-white font-semibold text-sm md:text-base mt-3">European Union & United Kingdom (GDPR / UK GDPR)</h3>
      <p>If you are located in the EU or UK, we rely on the following legal bases:</p>
      <ul className="list-disc list-inside pl-2 space-y-1 text-slate-300">
        <li><strong>Consent:</strong> Where you have granted explicit permission for specific features. You may withdraw consent at any time.</li>
        <li><strong>Performance of a Contract:</strong> To provide you with requested gameplay, profile, and replay services under our Terms of Service.</li>
        <li><strong>Legal Obligations:</strong> To comply with legal requirements, regulatory requests, or litigation duties.</li>
        <li><strong>Vital & Legitimate Interests:</strong> To maintain game security, protect users from fraud, and ensure leaderboard integrity.</li>
      </ul>

      <h3 className="text-white font-semibold text-sm md:text-base mt-3">Canada</h3>
      <p>We may process your information based on express or implied consent under applicable Canadian privacy laws (including PIPEDA). In certain exceptional circumstances permitted by law (such as fraud investigations, legal subpoenas, or witness statements), data may be processed without explicit consent.</p>
    </Section>

    <Divider />

    {/* SECTION 4 */}
    <Section id="sec-4" number="04" title="When and with whom do we share your personal information?" accent="cyan">
      <p className="text-slate-400 text-xs italic"><strong>In Short:</strong> We do not sell personal information. We share data only in specific operational or business transfer situations.</p>
      <ul className="list-disc list-inside pl-2 space-y-1.5 text-slate-300">
        <li><strong>Service Providers:</strong> We may share data with cloud infrastructure, hosting, and database providers that perform technical processing on our behalf under strict confidentiality agreements.</li>
        <li><strong>Business Transfers:</strong> We may share or transfer information in connection with, or during negotiations of, any merger, sale of assets, financing, or acquisition of our operations.</li>
      </ul>
    </Section>

    <Divider />

    {/* SECTION 5 */}
    <Section id="sec-5" number="05" title="Do we use cookies and other tracking technologies?" accent="cyan">
      <p className="text-slate-400 text-xs italic"><strong>In Short:</strong> We use essential cookies and browser storage to maintain sessions, prevent security vulnerabilities, and save game settings.</p>
      <p>We use essential cookies (e.g. <code>rm_session_token</code>, <code>rm_csrf_token</code>, and OAuth state cookies) and browser storage (<code>localStorage</code> and <code>IndexedDB</code>) to keep you signed in, protect against CSRF attacks, save custom keybindings and offsets, and store downloaded beatmaps.</p>
      <p>We do not use third-party behavioral advertising cookies or marketing tracking pixels. You can control or remove cookies through your browser settings.</p>
    </Section>

    <Divider />

    {/* SECTION 6 */}
    <Section id="sec-6" number="06" title="How do we handle your social logins?" accent="cyan">
      <p className="text-slate-400 text-xs italic"><strong>In Short:</strong> If you choose to log in with Google, we receive basic identity information from Google.</p>
      <p>When you authenticate via Google Sign-In, Google provides us with your account identifier (Subject ID), email address, display name, and avatar URL. We use this information solely to establish your RhythmMania account and authenticate your sessions.</p>
    </Section>

    <Divider />

    {/* SECTION 7 */}
    <Section id="sec-7" number="07" title="How long do we keep your information?" accent="cyan">
      <p className="text-slate-400 text-xs italic"><strong>In Short:</strong> We keep your information for as long as necessary to fulfill the purposes outlined in this notice, unless otherwise required by law.</p>
      <p>We retain your account records, profile details, avatars, and submitted replays for as long as your account remains active. Server sessions expire after 30 days. When there is no ongoing legitimate need to process your personal data, we will delete or anonymize it.</p>
    </Section>

    <Divider />

    {/* SECTION 8 */}
    <Section id="sec-8" number="08" title="How do we keep your information safe?" accent="cyan">
      <p className="text-slate-400 text-xs italic"><strong>In Short:</strong> We aim to protect your personal information through a system of organizational and technical security measures.</p>
      <p>We have implemented appropriate technical security measures including HTTPS transmission, signed CSRF double-submit tokens, HTTP-only session cookies, and input sanitization. However, no internet transmission or electronic storage technology is 100% secure, and we cannot guarantee absolute immunity from unauthorized access.</p>
    </Section>

    <Divider />

    {/* SECTION 9 */}
    <Section id="sec-9" number="09" title="Do we collect information from minors?" accent="cyan">
      <p className="text-slate-400 text-xs italic"><strong>In Short:</strong> We do not knowingly collect data from or market to individuals under 18 years of age.</p>
      <p>RhythmMania is intended only for users who are at least 18 years old. By using the Services, you represent that you are at least 18. If we learn that personal data from a minor has been collected, we will deactivate the account and take reasonable measures to promptly delete the information from our databases. If you become aware of any minor data, contact us at <a href="mailto:ymspace.official@gmail.com" className="text-cyan-400 underline">ymspace.official@gmail.com</a>.</p>
    </Section>

    <Divider />

    {/* SECTION 10 */}
    <Section id="sec-10" number="10" title="What are your privacy rights?" accent="cyan">
      <p className="text-slate-400 text-xs italic"><strong>In Short:</strong> In many regions, you have rights that allow you greater access to and control over your personal information.</p>
      <p>Depending on your region (such as the EEA, UK, Switzerland, and Canada), you may have the right to (i) request access and obtain a copy of your personal information; (ii) request rectification or erasure; (iii) restrict or object to the processing of your data; and (iv) data portability. We do not make decisions with legal effects based solely on automated processing.</p>
      
      <div className="bg-white/[0.02] border border-white/5 rounded-lg p-3 mt-3 text-xs md:text-sm space-y-2">
        <strong className="text-white block font-semibold">UK & European Supervisory Authorities</strong>
        <p>If you are located in the UK and are unsatisfied with our handling of your data, you have the right to lodge a complaint with the UK Information Commissioner&apos;s Office (ICO):</p>
        <ul className="list-disc list-inside text-slate-300 space-y-0.5">
          <li><strong>Website:</strong> <a href="https://ico.org.uk/make-a-complaint" target="_blank" rel="noopener noreferrer" className="text-cyan-400 underline">ico.org.uk/make-a-complaint</a></li>
          <li><strong>Helpline:</strong> 0303 123 1113</li>
          <li><strong>Address:</strong> Information Commissioner&apos;s Office, Wycliffe House, Water Lane, Wilmslow, Cheshire, SK9 5AF</li>
        </ul>
      </div>
    </Section>

    <Divider />

    {/* SECTION 11 */}
    <Section id="sec-11" number="11" title="Controls for Do-Not-Track features" accent="cyan">
      <p>Most web browsers include a Do-Not-Track (&ldquo;DNT&rdquo;) feature or setting you can activate to signal your privacy preference. Because there is currently no uniform industry standard for recognizing or implementing DNT signals, our system does not currently respond to automated DNT browser signals.</p>
    </Section>

    <Divider />

    {/* SECTION 12 */}
    <Section id="sec-12" number="12" title="Do United States residents have specific privacy rights?" accent="cyan">
      <p className="text-slate-400 text-xs italic"><strong>In Short:</strong> Residents of certain US states (e.g. California, Colorado, Connecticut, Virginia, Texas, and others) have specific rights regarding personal information.</p>
      
      <h3 className="text-white font-semibold text-sm md:text-base mt-2">Categories of Personal Information Collected (Past 12 Months)</h3>
      <div className="overflow-x-auto my-3">
        <table className="min-w-full text-xs text-left border border-white/10 rounded-lg overflow-hidden">
          <thead className="bg-white/5 text-slate-200 uppercase font-mono">
            <tr>
              <th className="py-2 px-3 border-b border-white/10">Category</th>
              <th className="py-2 px-3 border-b border-white/10">Examples</th>
              <th className="py-2 px-3 border-b border-white/10">Collected</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 text-slate-300">
            <tr>
              <td className="py-2 px-3 font-semibold text-white">A. Identifiers</td>
              <td className="py-2 px-3">Real name, alias, unique personal identifier, IP address, email address, account ID</td>
              <td className="py-2 px-3 text-cyan-400 font-bold">YES</td>
            </tr>
            <tr>
              <td className="py-2 px-3 font-semibold text-white">B. California Customer Records</td>
              <td className="py-2 px-3">Name, contact information, authentication details</td>
              <td className="py-2 px-3 text-cyan-400 font-bold">YES</td>
            </tr>
            <tr>
              <td className="py-2 px-3 font-semibold text-white">C. Protected Classifications</td>
              <td className="py-2 px-3">Gender, race, religion, sexual orientation, marital status</td>
              <td className="py-2 px-3 text-slate-500">NO</td>
            </tr>
            <tr>
              <td className="py-2 px-3 font-semibold text-white">D. Commercial Information</td>
              <td className="py-2 px-3">Purchase history, financial transactions, payment details</td>
              <td className="py-2 px-3 text-slate-500">NO</td>
            </tr>
            <tr>
              <td className="py-2 px-3 font-semibold text-white">E. Biometric Information</td>
              <td className="py-2 px-3">Fingerprints, voiceprints, facial geometry</td>
              <td className="py-2 px-3 text-slate-500">NO</td>
            </tr>
            <tr>
              <td className="py-2 px-3 font-semibold text-white">F. Internet / Network Activity</td>
              <td className="py-2 px-3">Browsing history across third-party sites, consumer behavioral tracking</td>
              <td className="py-2 px-3 text-slate-500">NO</td>
            </tr>
            <tr>
              <td className="py-2 px-3 font-semibold text-white">G. Geolocation Data</td>
              <td className="py-2 px-3">Precise physical location coordinates</td>
              <td className="py-2 px-3 text-slate-500">NO</td>
            </tr>
            <tr>
              <td className="py-2 px-3 font-semibold text-white">H. Sensory Data</td>
              <td className="py-2 px-3">Audio recordings, video surveillance</td>
              <td className="py-2 px-3 text-slate-500">NO</td>
            </tr>
            <tr>
              <td className="py-2 px-3 font-semibold text-white">I. Professional Information</td>
              <td className="py-2 px-3">Employment history, job applications</td>
              <td className="py-2 px-3 text-slate-500">NO</td>
            </tr>
            <tr>
              <td className="py-2 px-3 font-semibold text-white">J. Education Information</td>
              <td className="py-2 px-3">Student records, directory information</td>
              <td className="py-2 px-3 text-slate-500">NO</td>
            </tr>
            <tr>
              <td className="py-2 px-3 font-semibold text-white">K. Inferences & Profiling</td>
              <td className="py-2 px-3">Behavioral profile generation, consumer scores</td>
              <td className="py-2 px-3 text-slate-500">NO</td>
            </tr>
            <tr>
              <td className="py-2 px-3 font-semibold text-white">L. Sensitive Personal Information</td>
              <td className="py-2 px-3">Government IDs, financial account pins, health data</td>
              <td className="py-2 px-3 text-slate-500">NO</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p>We have not sold or shared any personal information to third parties for a commercial purpose in the preceding twelve (12) months, and will not do so in the future.</p>
      
      <h3 className="text-white font-semibold text-sm md:text-base mt-3">California &ldquo;Shine the Light&rdquo; Law</h3>
      <p>Under California Civil Code Section 1798.83 (&ldquo;Shine the Light&rdquo;), California residents are entitled to request information concerning categories of personal information disclosed to third parties for direct marketing. We do not disclose personal information to third parties for direct marketing purposes.</p>
    </Section>

    <Divider />

    {/* SECTION 13 */}
    <Section id="sec-13" number="13" title="Do other regions have specific privacy rights?" accent="cyan">
      <h3 className="text-white font-semibold text-sm md:text-base">Australia</h3>
      <p>We process personal data under the conditions set by Australia&apos;s Privacy Act 1988 (including the Australian Privacy Principles). If you believe we are unlawfully processing your personal information, you have the right to lodge a complaint with the <a href="https://www.oaic.gov.au/privacy/privacy-complaints/lodge-a-privacy-complaint-with-us" target="_blank" rel="noopener noreferrer" className="text-cyan-400 underline inline-flex items-center gap-1">Office of the Australian Information Commissioner (OAIC) <ExternalLink className="w-3 h-3" /></a>.</p>
    </Section>

    <Divider />

    {/* SECTION 14 */}
    <Section id="sec-14" number="14" title="Do we make updates to this notice?" accent="cyan">
      <p>We may update this Privacy Notice from time to time to stay compliant with relevant laws. The updated version will be indicated by the &ldquo;Last updated&rdquo; date at the top of this document. We encourage you to review this notice periodically.</p>
    </Section>

    <Divider />

    {/* SECTION 15 */}
    <Section id="sec-15" number="15" title="How can you contact us about this notice?" accent="cyan">
      <p>If you have questions, comments, or rights requests regarding this notice, you may contact us at:</p>
      <div className="bg-[#0e0e18] border border-white/10 rounded-xl p-4 text-xs md:text-sm font-mono space-y-1 text-slate-300">
        <p className="font-bold text-white">YMSpace INC.</p>
        <p>Singapore</p>
        <p className="flex items-center gap-2 text-cyan-400 mt-2">
          <Mail className="w-4 h-4" />
          <a href="mailto:ymspace.official@gmail.com" className="underline">ymspace.official@gmail.com</a>
        </p>
      </div>
    </Section>

    <Divider />

    {/* SECTION 16 */}
    <Section id="sec-16" number="16" title="How can you review, update, or delete the data we collect from you?" accent="cyan">
      <p>Based on applicable laws in your jurisdiction, you may have the right to request access to the personal information we maintain, correct inaccuracies, or request the deletion of your account and personal data.</p>
      <p>To submit a data access, correction, or deletion request, you may edit your profile directly in the game settings or contact us by email at <a href="mailto:ymspace.official@gmail.com" className="text-cyan-400 underline font-mono">ymspace.official@gmail.com</a>. We will respond to and act upon your request in accordance with applicable data protection laws.</p>
    </Section>
  </LegalShell>
);
