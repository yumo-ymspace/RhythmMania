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
import { Shield, ArrowLeft, FileText, CheckCircle, Lock, BookOpen } from 'lucide-react';

interface LegalPageProps {
  onBack: () => void;
}

export const TermsOfServicePage: React.FC<LegalPageProps> = ({ onBack }) => {
  return (
    <div className="h-screen overflow-y-auto w-full bg-[#050508] text-slate-100 font-sans pb-16 relative">
      {/* Background glow effects */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-pink-500/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[600px] h-[600px] bg-purple-500/5 rounded-full blur-[150px] pointer-events-none" />

      {/* Header Container */}
      <div className="border-b border-white/10 bg-[#08080f]/80 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <button
            onClick={onBack}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-300 hover:text-white hover:bg-white/10 hover:border-white/20 transition-all cursor-pointer text-xs md:text-sm font-semibold uppercase tracking-wider"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Game
          </button>
          
          <div className="flex items-center gap-2 text-pink-500 font-mono text-xs font-black uppercase tracking-widest">
            <BookOpen className="w-4 h-4" />
            Legal Document
          </div>
        </div>
      </div>

      {/* Document Content */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="max-w-4xl mx-auto px-4 mt-8 md:mt-12"
      >
        <div className="bg-[#0b0b14] border border-white/10 rounded-2xl p-6 md:p-10 shadow-2xl relative overflow-hidden">
          {/* Subtle neon corner accents */}
          <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-br from-transparent to-pink-500/10 pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-20 h-20 bg-gradient-to-tr from-purple-500/10 to-transparent pointer-events-none" />

          {/* Title */}
          <div className="flex items-center gap-3.5 mb-6 border-b border-white/5 pb-6">
            <div className="p-3 bg-pink-500/10 border border-pink-500/20 rounded-xl text-pink-500">
              <FileText className="w-6 h-6 md:w-7 md:h-7" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3.5xl font-black tracking-tight text-white uppercase font-sans">
                Terms of Service
              </h1>
              <p className="text-xs text-slate-400 font-mono mt-0.5 uppercase tracking-wider">
                Last Updated: 9 July 2026
              </p>
            </div>
          </div>

          {/* Markdown Content rendered nicely */}
          <div className="prose prose-invert prose-slate max-w-none text-slate-300 text-sm md:text-base leading-relaxed space-y-6 select-text">
            
            <section className="space-y-3">
              <h2 className="text-lg md:text-xl font-bold text-white flex items-center gap-2 uppercase tracking-wide">
                <span className="text-pink-500 font-mono text-sm font-black">01.</span> AGREEMENT TO TERMS
              </h2>
              <p>
                These Terms of Service constitute a legally binding agreement made between you, whether personally or on behalf of an entity (“you”) and <strong>RhythmMania</strong> ("we," "us," or "our”), concerning your access to and use of the <strong>rhythm-mania.com</strong> website as well as any other media form, media channel, mobile website or mobile application related, linked, or otherwise connected thereto (collectively, the “Site”). You agree that by accessing the Site, you have read, understood, and agreed to be bound by all of these Terms of Service. IF YOU DO NOT AGREE WITH ALL OF THESE TERMS OF SERVICE, THEN YOU ARE EXPRESSLY PROHIBITED FROM USING THE SITE AND YOU MUST DISCONTINUE USE IMMEDIATELY.
              </p>
              <p>
                Supplemental terms and conditions or documents that may be posted on the Site from time to time are hereby expressly incorporated herein by reference. We reserve the right, in our sole discretion, to make changes or modifications to these Terms of Service from time to time. We will alert you about any changes by updating the “Last updated” date of these Terms of Service, and you waive any right to receive specific notice of each such change. Please ensure that you check the applicable Terms every time you use our Site so that you understand which Terms apply. You will be subject to, and will be deemed to have been made aware of and to have accepted, the changes in any revised Terms of Service by your continued use of the Site after the date such revised Terms of Service are posted.
              </p>
              <p>
                The information provided on the Site is not intended for distribution to or use by any person or entity in any jurisdiction or country where such distribution or use would be contrary to law or regulation or which would subject us to any registration requirement within such jurisdiction or country. Accordingly, those persons who choose to access the Site from other locations do so on their own initiative and are solely responsible for compliance with local laws, if and to the extent local laws are applicable.
              </p>
              <p>
                The Site is not tailored to comply with industry-specific regulations (Health Insurance Portability and Accountability Act (HIPAA), Federal Information Security Management Act (FISMA), etc.), so if your interactions would be subjected to such laws, you may not use this Site. You may not use the Site in a way that would violate the Gramm-Leach-Bliley Act (GLBA).
              </p>
              <p>
                All users who are minors in the jurisdiction in which they reside (generally under the age of 18) must have the permission of, and be directly supervised by, their parent or guardian to use the Site. If you are a minor, you must have your parent or guardian read and agree to these Terms of Service prior to you using the Site.
              </p>
            </section>

            <hr className="border-white/5 my-6" />

            <section className="space-y-3">
              <h2 className="text-lg md:text-xl font-bold text-white flex items-center gap-2 uppercase tracking-wide">
                <span className="text-pink-500 font-mono text-sm font-black">02.</span> INTELLECTUAL PROPERTY RIGHTS
              </h2>
              <p>
                Unless otherwise indicated, the Site is our proprietary property and all source code, databases, functionality, software, website designs, audio, video (except user uploaded or linked third-party audio and video), text, photographs, and graphics on the Site (collectively, the “Content”) and the trademarks, service marks, and logos contained therein (the “Marks”) are owned or controlled by us or licensed to us, and are protected by copyright and trademark laws and various other intellectual property rights and unfair competition laws of the United States, international copyright laws, and international conventions.
              </p>
              <div className="my-4 p-4 md:p-5 bg-[#141424] border border-pink-500/20 rounded-xl relative">
                <div className="absolute top-0 right-0 px-2 py-0.5 bg-pink-500 text-black font-mono text-[9px] font-black uppercase rounded-bl-lg tracking-wider">
                  Open Source
                </div>
                <h4 className="text-sm font-bold text-white uppercase tracking-wider mb-1 flex items-center gap-1.5">
                  <CheckCircle className="w-4 h-4 text-pink-500" /> Open Source Code Notice
                </h4>
                <p className="text-xs md:text-sm text-slate-300 leading-relaxed mb-0">
                  Notwithstanding the general restrictions above, the core source code for <strong>RhythmMania</strong> is made available and licensed under the <strong>PolyForm Perimeter License 1.0.1</strong>. Your access to, modification, and distribution of the repository's underlying code are strictly governed by the permissions and commercial limitations outlined in that specific license.
                </p>
              </div>
              <p>
                The Content and the Marks are provided on the Site “AS IS” for your information and personal use only. Except as expressly provided in these Terms of Service or permitted under the <strong>PolyForm Perimeter License 1.0.1</strong>, no part of the Site and no Content or Marks may be copied, reproduced, aggregated, republished, uploaded, posted, publicly displayed, encoded, translated, transmitted, distributed, sold, licensed, or otherwise exploited for any commercial purpose whatsoever, without our express prior written permission.
              </p>
              <p>
                Provided that you are eligible to use the Site, you are granted a limited license to access and use the Site and to download or print a copy of any portion of the Content to which you have properly gained access solely for your personal, non-commercial use. We reserve all rights not expressly granted to you in and to the Site, the Content and the Marks.
              </p>
            </section>

            <hr className="border-white/5 my-6" />

            <section className="space-y-3">
              <h2 className="text-lg md:text-xl font-bold text-white flex items-center gap-2 uppercase tracking-wide">
                <span className="text-pink-500 font-mono text-sm font-black">03.</span> USER REPRESENTATIONS
              </h2>
              <p>
                By using the Site, you represent and warrant that:
              </p>
              <ol className="list-decimal list-inside pl-4 space-y-2 text-slate-300">
                <li>All registration information you submit will be true, accurate, current, and complete;</li>
                <li>You will maintain the accuracy of such information and promptly update such registration information as necessary;</li>
                <li>You have the legal capacity and you agree to comply with these Terms of Service;</li>
                <li>You are not a minor in the jurisdiction in which you reside, or if a minor, you have received parental permission to use the Site;</li>
                <li>You will not access the Site through automated or non-human means, whether through a bot, script, or otherwise;</li>
                <li>You will not use the Site for any illegal or unauthorized purpose; and</li>
                <li>Your use of the Site will not violate any applicable law or regulation.</li>
              </ol>
              <p>
                If you provide any information that is untrue, inaccurate, not current, or incomplete, we have the right to suspend or terminate your account and refuse any and all current or future use of the Site (or any portion thereof).
              </p>
            </section>

            <hr className="border-white/5 my-6" />

            <section className="space-y-3">
              <h2 className="text-lg md:text-xl font-bold text-white flex items-center gap-2 uppercase tracking-wide">
                <span className="text-pink-500 font-mono text-sm font-black">04.</span> USER REGISTRATION
              </h2>
              <p>
                You may be required to register with the Site. You agree to keep your password confidential and will be responsible for all use of your account and password. We reserve the right to remove, reclaim, or change a username you select if we determine, in our sole discretion, that such username is inappropriate, obscene, or otherwise objectionable.
              </p>
            </section>

            <hr className="border-white/5 my-6" />

            <section className="space-y-3">
              <h2 className="text-lg md:text-xl font-bold text-white flex items-center gap-2 uppercase tracking-wide">
                <span className="text-pink-500 font-mono text-sm font-black">05.</span> PROHIBITED ACTIVITIES
              </h2>
              <p>
                You may not access or use the Site for any purpose other than that for which we make the Site available. The Site may not be used in connection with any commercial endeavors except those that are specifically endorsed or approved by us.
              </p>
              <p>As a user of the Site, you agree not to:</p>
              <ul className="list-disc list-inside pl-4 space-y-1.5 text-slate-300 text-sm">
                <li>Systematically retrieve data or other content from the Site to create or compile, directly or indirectly, a collection, compilation, database, or directory without written permission from us.</li>
                <li>Trick, defraud, or mislead us and other users, especially in any attempt to learn sensitive account information such as user passwords.</li>
                <li>Circumvent, disable, or otherwise interfere with security-related features of the Site, including features that prevent or restrict the use or copying of any Content or enforce limitations on the use of the Site and/or the Content contained therein.</li>
                <li>Disparage, tarnish, or otherwise harm, in our opinion, us and/or the Site.</li>
                <li>Use any information obtained from the Site in order to harass, abuse, or harm another person.</li>
                <li>Make improper use of our support services or submit false reports of abuse or misconduct.</li>
                <li>Use the Site in a manner inconsistent with any applicable laws or regulations.</li>
                <li>Engage in unauthorized framing of or linking to the Site.</li>
                <li>Upload or transmit (or attempt to upload or to transmit) viruses, Trojan horses, or other material, including excessive use of capital letters and spamming, that interferes with any party’s uninterrupted use.</li>
                <li>Engage in any automated use of the system, such as using scripts to send comments or messages, or using any data mining, robots, or similar data gathering and extraction tools.</li>
                <li>Delete the copyright or other proprietary rights notice from any Content.</li>
                <li>Attempt to impersonate another user or person or use the username of another user.</li>
                <li>Upload or transmit spyware, clear GIFs, 1x1 pixels, web bugs, or cookies.</li>
                <li>Interfere with, disrupt, or create an undue burden on the Site or the networks or services connected to the Site.</li>
                <li>Harass, annoy, intimidate, or threaten any of our employees or agents engaged in providing any portion of the Site to you.</li>
                <li>Attempt to bypass any measures of the Site designed to prevent or restrict access to the Site.</li>
                <li>Copy or adapt the Site’s software, including but not limited to HTML, JavaScript, or other code (subject to permissions explicitly offered to you via our open-source codebase).</li>
                <li>Decipher, decompile, disassemble, or reverse engineer any of the software comprising or in any way making up a part of the Site.</li>
                <li>Use the Site as part of any effort to compete with us or otherwise use the Site and/or the Content for any unauthorized revenue-generating endeavor or commercial enterprise.</li>
              </ul>
            </section>

            <hr className="border-white/5 my-6" />

            <section className="space-y-3">
              <h2 className="text-lg md:text-xl font-bold text-white flex items-center gap-2 uppercase tracking-wide">
                <span className="text-pink-500 font-mono text-sm font-black">06.</span> USER GENERATED CONTRIBUTIONS & COMMUNITY CONTENT
              </h2>
              <p>
                <strong>RhythmMania</strong> game levels (beatmaps), songs, and associated videos may be created, sourced, or uploaded entirely by community members. You acknowledge and understand that some of these materials, beatmaps, songs, and media are sourced directly from third-party platforms like YouTube, and <strong>RhythmMania</strong> does not own, license, or hold any direct legal rights to such third-party content.
              </p>
              <p>
                We try to go out of our way to not advertise or profit directly from any user-uploaded or linked community content. The platform is entirely funded by user donations, a large portion of which we intend to use to reinvest in legitimate music licensing efforts. Licensing enquiries may be sent to: <strong>licensing@rhythm-mania.com</strong>.
              </p>
              <p>
                The <strong>RhythmMania</strong> management makes no guarantees as to whether any user-uploaded content, external embeds, or beatmap information is accurate, current, or of substantial quality. We assume no responsibility as to whether objectionable content has been uploaded, or whether users have the proper rights to distribute uploaded or linked content.
              </p>
              <p>
                When you create, link, or make available any Contributions (including beatmaps utilizing YouTube audio/video), you thereby represent and warrant that:
              </p>
              <ul className="list-disc list-inside pl-4 space-y-1 text-slate-300">
                <li>Your Contributions do not and will not infringe the proprietary rights, including but not limited to the copyright, patent, trademark, or moral rights of any third party.</li>
                <li>You have the necessary licenses, rights, consents, releases, and permissions to use and to authorize us and other users of the Site to use your Contributions.</li>
                <li>Your Contributions are not false, inaccurate, or misleading.</li>
                <li>Your Contributions are not obscene, lewd, lascivious, filthy, violent, harassing, or otherwise objectionable.</li>
                <li>Your Contributions do not violate any applicable law, regulation, or rule.</li>
              </ul>
            </section>

            <hr className="border-white/5 my-6" />

            <section className="space-y-3">
              <h2 className="text-lg md:text-xl font-bold text-white flex items-center gap-2 uppercase tracking-wide">
                <span className="text-pink-500 font-mono text-sm font-black">07.</span> COPYRIGHT INFRINGEMENT POLICY (DMCA NOTICE)
              </h2>
              <p>
                <strong>RhythmMania</strong> takes copyright and other intellectual property rights very seriously. In accordance with the Digital Millennium Copyright Act (DMCA), 17 U.S.C. 512, it is our strict policy to:
              </p>
              <ol className="list-decimal list-inside pl-4 space-y-1.5 text-slate-300">
                <li>Expeditiously block access to or remove content (including user-created beatmaps, audio tracks, or linked videos) that it believes in good faith may contain material that infringes the copyrights of third parties; and</li>
                <li>Remove and discontinue service to repeat offenders.</li>
              </ol>
              <h3 className="text-white font-bold text-sm uppercase tracking-wide mt-4">Reporting Copyright Infringements</h3>
              <p className="text-sm">
                If you believe that content residing on or accessible through the <strong>RhythmMania</strong> website or service infringes your copyright, please send a notice of claimed copyright infringement containing the following information to our Designated Agent listed below:
              </p>
              <ul className="list-disc list-inside pl-4 space-y-1 text-xs md:text-sm text-slate-400">
                <li>A physical or electronic signature of a person authorized to act on behalf of the owner of the copyright;</li>
                <li>Identification of the copyrighted works claimed to have been infringed;</li>
                <li>Identification of the material that is claimed to be infringing and info to locate it (like URL or beatmap link);</li>
                <li>Contact info for the notifier (address, phone, email);</li>
                <li>A statement that the notifier has a good faith belief that the use is unauthorized; and</li>
                <li>A statement that the notification is accurate, and under penalty of perjury, that the notifier is authorized to act.</li>
              </ul>
              <p className="text-xs md:text-sm text-pink-500 font-mono mt-2">
                Designated Agent Contact Info:<br />
                • Attn: Copyright / DMCA Agent<br />
                • Email: copyright@rhythm-mania.com
              </p>
            </section>

            <hr className="border-white/5 my-6" />

            <section className="space-y-3">
              <h2 className="text-lg md:text-xl font-bold text-white flex items-center gap-2 uppercase tracking-wide">
                <span className="text-pink-500 font-mono text-sm font-black">08.</span> DISCLAIMER OF WARRANTIES
              </h2>
              <p className="uppercase font-mono text-xs md:text-sm text-amber-500/90 leading-relaxed bg-amber-500/5 p-4 rounded-xl border border-amber-500/10">
                USER EXPRESSLY AGREES THAT USE OF THE SERVICE IS AT USER'S SOLE RISK. THE SERVICE IS PROVIDED ON AN "AS IS" AND "AS AVAILABLE" BASIS. RhythmMania DISCLAIMS ALL WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY WARRANTY OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT OR TITLE. RhythmMania MAKES NO WARRANTY OR REPRESENTATION REGARDING THE RESULTS THAT MAY BE OBTAINED FROM THE USE OF THE SERVICES, OR THAT RhythmMania'S SERVICES WILL MEET ANY USER'S REQUIREMENTS, BE UNINTERRUPTED, TIMELY, SECURE, OR ERROR-FREE.
              </p>
            </section>

            <hr className="border-white/5 my-6" />

            <section className="space-y-3">
              <h2 className="text-lg md:text-xl font-bold text-white flex items-center gap-2 uppercase tracking-wide">
                <span className="text-pink-500 font-mono text-sm font-black">09.</span> LIMITATION OF LIABILITY
              </h2>
              <p>
                IN NO EVENT SHALL <strong>RhythmMania</strong>, ITS OFFICERS, DIRECTORS, EMPLOYEES, OR AGENTS, BE LIABLE TO YOU FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, PUNITIVE, OR CONSEQUENTIAL DAMAGES WHATSOEVER RESULTING FROM ANY (1) ERRORS, MISTAKES, OR INACCURACIES OF CONTENT, (2) PERSONAL INJURY OR PROPERTY DAMAGE, (3) ANY UNAUTHORIZED ACCESS TO OR USE OF OUR SECURE SERVERS, (4) ANY INTERRUPTION OF TRANSMISSION, OR (5) ANY BUGS, VIRUSES, TROJAN HORSES OR THE LIKE TRANSMITTED TO OR THROUGH THE SITE.
              </p>
            </section>

          </div>
        </div>
      </motion.div>
    </div>
  );
};

export const PrivacyPolicyPage: React.FC<LegalPageProps> = ({ onBack }) => {
  return (
    <div className="h-screen overflow-y-auto w-full bg-[#050508] text-slate-100 font-sans pb-16 relative">
      {/* Background glow effects */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-cyan-500/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[600px] h-[600px] bg-blue-500/5 rounded-full blur-[150px] pointer-events-none" />

      {/* Header Container */}
      <div className="border-b border-white/10 bg-[#08080f]/80 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <button
            onClick={onBack}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-300 hover:text-white hover:bg-white/10 hover:border-white/20 transition-all cursor-pointer text-xs md:text-sm font-semibold uppercase tracking-wider"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Game
          </button>
          
          <div className="flex items-center gap-2 text-cyan-500 font-mono text-xs font-black uppercase tracking-widest">
            <BookOpen className="w-4 h-4" />
            Legal Document
          </div>
        </div>
      </div>

      {/* Document Content */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="max-w-4xl mx-auto px-4 mt-8 md:mt-12"
      >
        <div className="bg-[#0b0b14] border border-white/10 rounded-2xl p-6 md:p-10 shadow-2xl relative overflow-hidden">
          {/* Subtle neon corner accents */}
          <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-br from-transparent to-cyan-500/10 pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-20 h-20 bg-gradient-to-tr from-blue-500/10 to-transparent pointer-events-none" />

          {/* Title */}
          <div className="flex items-center gap-3.5 mb-6 border-b border-white/5 pb-6">
            <div className="p-3 bg-cyan-500/10 border border-cyan-500/20 rounded-xl text-cyan-500">
              <Shield className="w-6 h-6 md:w-7 md:h-7" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3.5xl font-black tracking-tight text-white uppercase font-sans">
                Privacy Policy
              </h1>
              <p className="text-xs text-slate-400 font-mono mt-0.5 uppercase tracking-wider">
                Last Updated: 9 July 2026
              </p>
            </div>
          </div>

          {/* Markdown Content rendered nicely */}
          <div className="prose prose-invert prose-slate max-w-none text-slate-300 text-sm md:text-base leading-relaxed space-y-6 select-text">
            
            <section className="space-y-3">
              <h2 className="text-lg md:text-xl font-bold text-white flex items-center gap-2 uppercase tracking-wide">
                <span className="text-cyan-500 font-mono text-sm font-black">01.</span> INTRODUCTION & CORE ETHOS
              </h2>
              <p>
                We at <strong>RhythmMania</strong> care deeply about privacy and data minimization. We believe that your gameplay scores, local custom charts, settings, and performance data belong solely to you. Because our platform is architected primarily as an offline-first, client-side single page web application, we do not systematically collect, sell, or monetize your personal details.
              </p>
              <p>
                By accessing or using our game, you acknowledge and accept the terms of this Privacy Policy. If you do not agree, please do not use the service.
              </p>
            </section>

            <hr className="border-white/5 my-6" />

            <section className="space-y-3">
              <h2 className="text-lg md:text-xl font-bold text-white flex items-center gap-2 uppercase tracking-wide">
                <span className="text-cyan-500 font-mono text-sm font-black">02.</span> HOW WE STORE YOUR DATA
              </h2>
              <p>
                Because RhythmMania stores game progress, configurations, personal performance limits, customized hotkeys, and custom beatmap databases locally:
              </p>
              <ul className="list-disc list-inside pl-4 space-y-1 text-slate-300">
                <li><strong>Local Storage:</strong> Your custom key bindings, calibration values, game volumes, and user configuration settings are saved directly in your browser's local cache.</li>
                <li><strong>Local Score DB:</strong> Your personal play history, combos, and grades are logged entirely on your local machine. Clearing your browser cache or site data will erase these local metrics permanently.</li>
              </ul>
            </section>

            <hr className="border-white/5 my-6" />

            <section className="space-y-3">
              <h2 className="text-lg md:text-xl font-bold text-white flex items-center gap-2 uppercase tracking-wide">
                <span className="text-cyan-500 font-mono text-sm font-black">03.</span> THIRD-PARTY INTEGRATIONS & EMBEDS
              </h2>
              <p>
                To provide music, synchronization, and backgrounds, some community-created beatmaps utilize embedded assets or link directly to external APIs. In particular, some charts play background media sourced from <strong>YouTube</strong>.
              </p>
              <p>
                When interacting with these embedded players, YouTube/Google may place tracking cookies, collect telemetry, or process information about your browser. This activity is strictly subject to the <strong>Google Privacy Policy</strong> and <strong>YouTube Terms of Service</strong>, which we do not control.
              </p>
            </section>

            <hr className="border-white/5 my-6" />

            <section className="space-y-3">
              <h2 className="text-lg md:text-xl font-bold text-white flex items-center gap-2 uppercase tracking-wide">
                <span className="text-cyan-500 font-mono text-sm font-black">04.</span> CONTACT INFORMATION
              </h2>
              <p>
                If you have any questions about this Privacy Policy, your local data protection rights, or our licensing efforts, you can contact us at:
              </p>
              <p className="text-sm text-cyan-400 font-mono">
                Email: privacy@rhythm-mania.com
              </p>
            </section>

          </div>
        </div>
      </motion.div>
    </div>
  );
};
