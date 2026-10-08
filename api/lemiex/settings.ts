import type { VercelRequest, VercelResponse } from '@vercel/node';
import { prisma } from '../_lib/prisma.js';
import { requireOwner } from '../_lib/auth.js';
import { methodNotAllowed, serverError } from '../_lib/helpers.js';
import { getLemiexConfig, getLemiexToken, clearLemiexToken, lemiexSettingKey, LemiexError } from '../_lib/lemiex.js';

// Owner-only Lemiex connection settings. The password / api key are write-only:
// GET never returns them, only whether they are set.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = requireOwner(req, res);
  if (!auth) return;

  try {
    if (req.method === 'GET') {
      const cfg = await getLemiexConfig(auth.teamId);
      return res.status(200).json({
        configured: Boolean(cfg.email && cfg.password),
        email: cfg.email || '',
        hasApiKey: Boolean(cfg.apiKey),
      });
    }

    if (req.method === 'POST') {
      const { email, password, apiKey } = req.body || {};
      const existing = await getLemiexConfig(auth.teamId);
      const merged = {
        email: email !== undefined ? String(email).trim() : existing.email,
        // Empty string keeps the stored secret (form fields left blank on edit)
        password: password ? String(password) : existing.password,
        apiKey: apiKey ? String(apiKey).trim() : existing.apiKey,
      };
      await prisma.setting.upsert({
        where: { key: lemiexSettingKey(auth.teamId) },
        update: { value: merged },
        create: { key: lemiexSettingKey(auth.teamId), value: merged },
      });
      clearLemiexToken(auth.teamId);

      // Test the credentials right away so the UI can report the result.
      let loginOk = false;
      let loginMessage = '';
      try {
        await getLemiexToken(auth.teamId);
        loginOk = true;
      } catch (e: any) {
        loginMessage = e instanceof LemiexError ? e.message : 'Login test failed';
      }
      return res.status(200).json({
        configured: Boolean(merged.email && merged.password),
        email: merged.email || '',
        hasApiKey: Boolean(merged.apiKey),
        loginOk,
        loginMessage,
      });
    }

    return methodNotAllowed(res, ['GET', 'POST']);
  } catch (err) {
    return serverError(res, err);
  }
}
