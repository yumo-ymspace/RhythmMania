import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCors, sendError } from '../_lib/response.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return;
  if (req.method !== 'GET') return sendError(res, 405, 'Method Not Allowed');

  return sendError(res, 410, 'Cloud archives are downloaded directly from the approved mirror');
}
