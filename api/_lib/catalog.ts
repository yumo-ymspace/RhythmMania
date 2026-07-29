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

const catalogDifficultyToSet: Record<string, string> = {
  server_usseewa_unknown: 'server_usseewa',
  server_mach_roger_easy: 'server_mach_roger',
  server_mach_roger_normal: 'server_mach_roger',
  server_mach_roger_pys_hard: 'server_mach_roger',
  server_mach_roger_insane: 'server_mach_roger',
  server_mach_roger_maharaja: 'server_mach_roger',
  server_brain_power_chickens_4k_basic: 'server_brain_power',
  server_brain_power_starrys_4k_novice: 'server_brain_power',
  server_brain_power_avalons_4k_advanced: 'server_brain_power',
  server_brain_power_lirais_4k_exhaust: 'server_brain_power',
  server_brain_power_spys_4k_infinite: 'server_brain_power',
  server_brain_power_sy_4k_overdrive: 'server_brain_power',
  server_brain_power_arzens_7k_basic: 'server_brain_power',
  server_brain_power_zzh_7k_novice: 'server_brain_power',
  server_brain_power_r1s_7k_advanced: 'server_brain_power',
  server_brain_power_7k_exhaust: 'server_brain_power',
  server_brain_power_pews_7k_infinite: 'server_brain_power',
  server_brain_power_cs_x_kb_7k_overdrive: 'server_brain_power',
  server_freedom_dive_4k_normal: 'server_freedom_dive',
  server_freedom_dive_4k_hyper: 'server_freedom_dive',
  server_freedom_dive_4k_another: 'server_freedom_dive',
  server_freedom_dive_fullerenes_4k_dimensions: 'server_freedom_dive',
  server_freedom_dive_dains_7k_light: 'server_freedom_dive',
  server_freedom_dive_blockos_7k_normal: 'server_freedom_dive',
  server_freedom_dive_tears_7k_hyper: 'server_freedom_dive',
  server_freedom_dive_blockos_7k_another: 'server_freedom_dive',
  server_freedom_dive_blockos_7k_black_another: 'server_freedom_dive',
  server_test_flades_normal: 'server_test',
  server_test_advanced: 'server_test',
  server_test_hyper: 'server_test',
  server_test_hard: 'server_test',
  server_test_insane: 'server_test',
  server_test_another: 'server_test',
  server_test_believe: 'server_test',
  server_unravel_4k_easy_vocal: 'server_unravel',
  server_unravel_4k_normal_melody: 'server_unravel',
  server_unravel_4k_advanced_instrumental: 'server_unravel',
  server_unravel_4k_hard_light_jumpstream: 'server_unravel',
  server_unravel_4k_insane_full_jumpstream: 'server_unravel',
  server_unravel_4k_complicated_existence: 'server_unravel',
  server_unravel_4k_twisted_fate: 'server_unravel',
  server_unravel_7k_distorted_presence: 'server_unravel',
};

export function getCatalogSetId(difficultyId: string): string | undefined {
  return catalogDifficultyToSet[difficultyId];
}
