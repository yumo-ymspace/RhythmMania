import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCors, sendError, sendJson } from '../_lib/response.js';
import { getSessionFromReq, isValidUserId } from '../_lib/auth.js';
import { query } from '../_lib/db.js';
import { sanitizeActivityStatus, sanitizeActivityMessage } from '../_lib/profile.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return;
  if (req.method !== 'GET') return sendError(res, 405, 'Method Not Allowed');

  try {
    const session = await getSessionFromReq(req);
    const rawUserId = typeof req.query.userId === 'string'
      ? req.query.userId
      : typeof req.query.id === 'string'
        ? req.query.id
        : undefined;
    const rawHandle = typeof req.query.handle === 'string' ? req.query.handle : undefined;
    let targetUserId: string | null = null;

    if (rawUserId !== undefined && rawUserId !== '') {
      if (!isValidUserId(rawUserId)) {
        return sendError(res, 400, 'Invalid user id');
      }
      targetUserId = rawUserId;
    } else if (rawHandle !== undefined && rawHandle !== '') {
      // Resolve handle -> user id
      const handleRes = await query<{ user_id: string }>(
        `SELECT user_id FROM user_profiles WHERE handle = $1`,
        [rawHandle]
      );
      if (handleRes.rows.length === 0) {
        return sendError(res, 404, 'Profile not found');
      }
      targetUserId = handleRes.rows[0].user_id;
    } else if (session) {
      targetUserId = session.userId;
    } else {
      return sendError(res, 401, 'Authentication required');
    }

    const userRes = await query<{
      id: string;
      username: string;
      email: string | null;
      avatar_url: string | null;
      role: string;
    }>(
      `SELECT id, username, email, avatar_url, role FROM users WHERE id = $1`,
      [targetUserId]
    );

    if (userRes.rows.length === 0) {
      return sendError(res, 404, 'Profile not found');
    }

    const profileUser = userRes.rows[0];
    const isOwn = Boolean(session && session.userId === profileUser.id);

    // Load editable profile (handle, bio, social links)
    const profileRowRes = await query<{
      display_name: string;
      handle: string;
      bio: string;
      social_links: any;
      activity_status: string | null;
      activity_message: string | null;
    }>(
      `SELECT display_name, handle, bio, social_links, activity_status, activity_message
       FROM user_profiles WHERE user_id = $1`,
      [targetUserId]
    );

    const profileRow = profileRowRes.rows[0];

    const displayName = profileRow?.display_name || profileUser.username;
    const bio = profileRow?.bio || '';
    const socialLinks = profileRow?.social_links || {};
    const handle = profileRow?.handle || null;
    const activityStatus = sanitizeActivityStatus(profileRow?.activity_status);
    const activityMessage = sanitizeActivityMessage(profileRow?.activity_message);

    const [summary, keyCounts, modCounts, recent] = await Promise.all([
      query<{
        total_plays: string;
        total_score: string;
        average_accuracy: string | null;
        best_grade: string | null;
        ss_count: string;
        s_count: string;
        a_count: string;
      }>(
        `SELECT COUNT(*)::text AS total_plays,
                COALESCE(SUM(score), 0)::text AS total_score,
                AVG(accuracy)::text AS average_accuracy,
                CASE WHEN COUNT(*) FILTER (WHERE grade = 'SS') > 0 THEN 'SS'
                     WHEN COUNT(*) FILTER (WHERE grade = 'S') > 0 THEN 'S'
                     WHEN COUNT(*) FILTER (WHERE grade = 'A') > 0 THEN 'A'
                     WHEN COUNT(*) FILTER (WHERE grade = 'B') > 0 THEN 'B'
                     WHEN COUNT(*) FILTER (WHERE grade = 'C') > 0 THEN 'C'
                     ELSE NULL END AS best_grade,
                COUNT(*) FILTER (WHERE grade = 'SS')::text AS ss_count,
                COUNT(*) FILTER (WHERE grade = 'S')::text AS s_count,
                COUNT(*) FILTER (WHERE grade = 'A')::text AS a_count
         FROM replays
         WHERE user_id = $1 AND is_failed = false`,
        [targetUserId]
      ),
      query<{ key_count: number; plays: string }>(
        `SELECT COALESCE(bd.key_count, 0) AS key_count, COUNT(*)::text AS plays
         FROM replays r
         LEFT JOIN beatmap_difficulties bd ON bd.id = r.beatmap_difficulty_id
         WHERE r.user_id = $1 AND r.is_failed = false
         GROUP BY bd.key_count ORDER BY bd.key_count`,
        [targetUserId]
      ),
      query<{ mod: string; plays: string }>(
        `SELECT mod, COUNT(*)::text AS plays
         FROM replays r
         CROSS JOIN LATERAL jsonb_array_elements_text(
           CASE WHEN jsonb_typeof(r.mods) = 'array' THEN r.mods ELSE '[]'::jsonb END
         ) AS mods(mod)
         WHERE r.user_id = $1 AND r.is_failed = false
         GROUP BY mod ORDER BY COUNT(*) DESC, mod`,
        [targetUserId]
      ),
      query<{
        id: string;
        score: number;
        accuracy: number;
        grade: string;
        created_at: Date;
        beatmap_title: string | null;
        beatmap_artist: string | null;
        difficulty: string | null;
      }>(
        `SELECT r.id, r.score, r.accuracy, r.grade, r.created_at,
                bs.title AS beatmap_title, bs.artist AS beatmap_artist,
                bd.name AS difficulty
         FROM replays r
         LEFT JOIN beatmap_sets bs ON bs.id = r.beatmap_set_id
         LEFT JOIN beatmap_difficulties bd ON bd.id = r.beatmap_difficulty_id
         WHERE r.user_id = $1 AND r.is_failed = false
         ORDER BY r.created_at DESC LIMIT 10`,
        [targetUserId]
      ),
    ]);

    const totals = summary.rows[0];

    return sendJson(res, 200, {
      success: true,
      data: {
        user: {
          id: profileUser.id,
          username: profileUser.username,
          displayName,
          handle,
          email: isOwn ? (profileUser.email || null) : null,
          avatarUrl: profileUser.avatar_url || null,
          role: profileUser.role,
        },
        isOwn,
        bio,
        socialLinks,
        activityStatus,
        activityMessage,
        stats: {
          totalPlays: Number(totals?.total_plays || 0),
          totalScore: Number(totals?.total_score || 0),
          averageAccuracy: totals?.average_accuracy ? Number(totals.average_accuracy) : 0,
          bestGrade: totals?.best_grade || '-',
          grades: {
            SS: Number(totals?.ss_count || 0),
            S: Number(totals?.s_count || 0),
            A: Number(totals?.a_count || 0),
          },
          keyCounts: keyCounts.rows.map(row => ({ keyCount: row.key_count, plays: Number(row.plays) })),
          mods: modCounts.rows.map(row => ({ mod: row.mod, plays: Number(row.plays) })),
        },
        recent: recent.rows.map(row => ({
          id: row.id,
          title: row.beatmap_title || 'Unknown Title',
          artist: row.beatmap_artist || 'Unknown Artist',
          difficulty: row.difficulty || 'Unknown',
          score: row.score,
          accuracy: row.accuracy,
          grade: row.grade,
          createdAt: row.created_at.toISOString(),
        })),
      },
    });
  } catch (error) {
    console.error('Error fetching profile stats:', error);
    return sendError(res, 500, 'Failed to fetch profile statistics');
  }
}
