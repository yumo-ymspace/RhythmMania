import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sendError, sendJson } from './_lib/response.js';
import search from './catalog/_search.js';
import getSet from './catalog/_set.js';
import getChart from './catalog/_chart.js';
import registerDownload from './catalog/_register-download.js';
import activateDownload from './catalog/_activate-download.js';
import download from './catalog/_download.js';

function route(req: VercelRequest): string {
  const value = req.query._route;
  if (typeof value === 'string') return value.replace(/^\/+|\/+$/g, '');
  return (req.url || '').split('?')[0].replace(/^.*\/api\/catalog\//, '').replace(/\/+$/, '');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    switch (route(req)) {
      case 'search': return search(req, res);
      case 'set': return getSet(req, res);
      case 'chart': return getChart(req, res);
      case 'register-download': return registerDownload(req, res);
      case 'activate-download': return activateDownload(req, res);
      case 'download': return download(req, res);
      default: return sendError(res, 404, 'Catalog route not found');
    }
  } catch (error) {
    console.error('Catalog router request failed:', error instanceof Error ? error.name : 'unknown');
    return sendJson(res, 500, { success: false, error: 'Catalog service unavailable' });
  }
}
