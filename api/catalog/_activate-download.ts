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

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSessionFromReq } from '../_lib/auth.js';
import { withTransaction } from '../_lib/db.js';
import { canActivatePendingRegistration, isPendingRegistrationExpired } from '../_lib/catalogRegistration.js';
import {
  parseReplayUploadPayload,
  verifyMirrorArchive,
  verifyReplayAgainstChart,
  type MirrorChartExpectation,
} from '../_lib/replayVerification.js';
import { handleCors, requireSameOrigin, sendError, sendJson } from '../_lib/response.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseJsonValue(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value) as unknown; } catch { return null; }
}

function pendingResponse(res: VercelResponse, cloudSetId: string) {
  return sendJson(res, 202, {
    success: true,
    data: {
      cloudSetId,
      state: 'pending' as const,
      retryable: true,
      message: 'The mirror archive could not be independently verified yet',
    },
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') return sendError(res, 405, 'Method Not Allowed');
  if (!requireSameOrigin(req, res)) return;
  const session = await getSessionFromReq(req);
  if (!session) return sendError(res, 401, 'Sign in to activate a cloud download');

  const body: unknown = req.body;
  const cloudSetId = isRecord(body) && typeof body.cloudSetId === 'string' ? body.cloudSetId : '';
  const token = isRecord(body) && typeof body.token === 'string' ? body.token : '';
  if (!/^osuapi_\d+$/.test(cloudSetId) || token.length < 1 || token.length > 128) return sendError(res, 400, 'Invalid activation request');

  try {
    const result = await withTransaction(async (client) => {
      const pending = await client.query<{
        source_metadata: unknown;
        catalog_state: 'pending' | 'active';
        source_set_id: number;
      }>(
        `SELECT source_metadata, catalog_state, source_set_id
          FROM beatmap_sets WHERE id = $1 AND source = 'osuapi' FOR UPDATE`,
        [cloudSetId],
      );
      const row = pending.rows[0];
      if (!row) return { kind: 'missing' as const };
      if (row.catalog_state === 'active') return { kind: 'active' as const };
      const metadata = isRecord(row.source_metadata) ? row.source_metadata : null;
      if (isPendingRegistrationExpired(metadata) || !canActivatePendingRegistration(row.catalog_state, false, metadata, token, session.userId) || !Array.isArray(metadata?.charts)) return { kind: 'forbidden' as const };
      const expectations: MirrorChartExpectation[] = [];
      for (const rawChart of metadata.charts) {
        const sourceChartId = isRecord(rawChart) && typeof rawChart.id === 'number' ? rawChart.id : null;
        const keyCount = isRecord(rawChart) && typeof rawChart.keyCount === 'number' ? rawChart.keyCount : null;
         if (!isRecord(rawChart) || sourceChartId === null || !Number.isInteger(sourceChartId) || sourceChartId < 1 || typeof rawChart.filename !== 'string' || rawChart.filename.length < 1 || rawChart.filename.length > 512 || typeof rawChart.checksum !== 'string' || !rawChart.checksum || keyCount === null || !Number.isInteger(keyCount) || keyCount < 2 || keyCount > 9) return { kind: 'invalid' as const };
         const checksum = rawChart.checksum.toLowerCase();
         expectations.push({
           sourceChartId,
           filename: rawChart.filename,
           checksum,
           keyCount,
           chartRevisionId: `osuapi_${row.source_set_id}_b${rawChart.id}_${checksum}`,
         });
      }
      if (expectations.length === 0) return { kind: 'invalid' as const };
      return { kind: 'verify' as const, sourceSetId: row.source_set_id, expectations };
    });

    if (result.kind === 'missing') return sendError(res, 404, 'Pending cloud set not found');
    if (result.kind === 'forbidden') return sendError(res, 403, 'Activation token is invalid or expired');
    if (result.kind === 'invalid') return pendingResponse(res, cloudSetId);
    if (result.kind === 'active') return sendJson(res, 200, { success: true, data: { cloudSetId, state: 'active' as const } });

    let canonicalCharts;
    try {
      canonicalCharts = await verifyMirrorArchive(result.sourceSetId, result.expectations);
    } catch (error: unknown) {
      console.error('Catalog mirror verification failed:', error instanceof Error ? error.name : 'unknown');
      return pendingResponse(res, cloudSetId);
    }

    const activated = await withTransaction(async (client) => {
      const locked = await client.query<{
        source_metadata: unknown;
        catalog_state: 'pending' | 'active';
      }>(
        `SELECT source_metadata, catalog_state
           FROM beatmap_sets WHERE id = $1 AND source = 'osuapi' FOR UPDATE`,
        [cloudSetId],
      );
      const lockedRow = locked.rows[0];
      const lockedMetadata = isRecord(lockedRow?.source_metadata) ? lockedRow.source_metadata : null;
      if (isPendingRegistrationExpired(lockedMetadata) || !canActivatePendingRegistration(lockedRow?.catalog_state, false, lockedMetadata, token, session.userId)) return false;

      await client.query(`UPDATE beatmap_chart_revisions SET is_active = FALSE, is_current = FALSE WHERE beatmap_set_id = $1`, [cloudSetId]);
      for (const chart of canonicalCharts) {
        const updated = await client.query(
          `UPDATE beatmap_chart_revisions
           SET is_active = TRUE, is_current = TRUE, canonical_chart = $2
           WHERE id = $1 AND beatmap_set_id = $3 AND checksum = $4 AND key_count = $5 AND mode = 3`,
          [chart.chartRevisionId, JSON.stringify(chart), cloudSetId, chart.checksum, chart.keyCount],
        );
        if (updated.rowCount !== 1) throw new Error('Verified chart revision is not registered');
      }

      const pendingReplays = await client.query<{
        id: string;
        chart_revision_id: string;
        score: number;
        accuracy: number;
        max_combo: number;
        grade: string;
        is_failed: boolean;
        score_state: unknown;
        replay_frames: unknown;
        recorded_settings: unknown;
        mods: unknown;
        beatmap_hash: string;
        hold_rules_version: number;
        hold_tick_interval_ms: number | null;
      }>(
        `SELECT id, chart_revision_id, score, accuracy, max_combo, grade, is_failed, score_state,
                replay_frames, recorded_settings, mods, beatmap_hash,
                hold_rules_version, hold_tick_interval_ms
           FROM replays
          WHERE chart_revision_id = ANY($1::text[]) AND upload_status = 'pending'`,
        [canonicalCharts.map((chart) => chart.chartRevisionId)],
      );

      for (const replay of pendingReplays.rows) {
        const chart = canonicalCharts.find((candidate) => candidate.chartRevisionId === replay.chart_revision_id);
        if (!chart) continue;
        const parsed = parseReplayUploadPayload({
          id: replay.id,
          keyCount: chart.keyCount,
          score: replay.score,
          accuracy: replay.accuracy,
          maxCombo: replay.max_combo,
          grade: replay.grade,
          isFailed: replay.is_failed,
          scoreState: parseJsonValue(replay.score_state),
          replayFrames: parseJsonValue(replay.replay_frames),
          recordedSettings: parseJsonValue(replay.recorded_settings) || {},
          mods: parseJsonValue(replay.mods) || [],
          chartRevisionId: chart.chartRevisionId,
          beatmapHash: replay.beatmap_hash,
          checksum: chart.checksum,
          checksumAlgorithm: chart.checksumAlgorithm,
          holdRulesVersion: replay.hold_rules_version === 2 ? 2 : 1,
          holdTickIntervalMs: replay.hold_tick_interval_ms ?? undefined,
        });
        const verified = parsed.ok ? verifyReplayAgainstChart(parsed.value, chart) : null;
        if (verified) {
          await client.query(
            `UPDATE replays
                SET score = $2, accuracy = $3, max_combo = $4, grade = $5,
                    is_failed = $6, score_state = $7, upload_status = 'uploaded'
              WHERE id = $1 AND upload_status = 'pending'`,
            [replay.id, verified.score, verified.accuracy, verified.maxCombo, verified.grade, verified.isFailed, JSON.stringify(verified.scoreState)],
          );
        } else {
          await client.query(
            `UPDATE replays SET upload_status = 'failed' WHERE id = $1 AND upload_status = 'pending'`,
            [replay.id],
          );
        }
      }
      await client.query(
        `UPDATE beatmap_sets
            SET catalog_state = 'active', updated_at = NOW(),
                source_metadata = source_metadata - 'token' - 'userId' - 'registrationExpiresAt'
          WHERE id = $1`,
        [cloudSetId],
      );
      return true;
    });
    if (!activated) return pendingResponse(res, cloudSetId);
    return sendJson(res, 200, { success: true, data: { cloudSetId, state: 'active' as const } });
  } catch (error: unknown) {
    console.error('Catalog activation failed:', error instanceof Error ? error.name : 'unknown');
    return sendError(res, 500, 'Catalog activation unavailable');
  }
}
