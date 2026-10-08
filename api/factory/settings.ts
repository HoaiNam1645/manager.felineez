import type { VercelRequest, VercelResponse } from '@vercel/node';
import { prisma } from '../_lib/prisma.js';
import { requireOwner } from '../_lib/auth.js';
import { badRequest, methodNotAllowed, serverError } from '../_lib/helpers.js';
import {
  FactoryProvider,
  factorySettingKey,
  getFactoryConfig,
  mangoFetch,
  getVinawayToken,
  clearVinawayToken,
  getMonkeyKingToken,
  clearMonkeyKingToken,
  dreamshipFetch,
  hongPhatFetch,
  hogotoFetch,
  FactoryError,
  MangoConfig,
  VinawayConfig,
  MonkeyKingConfig,
  DreamshipConfig,
  HongPhatConfig,
  HogotoConfig,
} from '../_lib/factory.js';

const PROVIDERS: FactoryProvider[] = ['mango', 'vinaway', 'monkeyking', 'dreamship', 'hongphat', 'hogoto'];

async function saveConfig(provider: FactoryProvider, teamId: string, merged: any) {
  await prisma.setting.upsert({
    where: { key: factorySettingKey(provider, teamId) },
    update: { value: merged },
    create: { key: factorySettingKey(provider, teamId), value: merged },
  });
}

// Owner-only settings for the factory providers. Secrets are write-only:
// GET only reports whether they are set; empty POST fields keep stored values.
//   GET  /api/factory/settings?provider=...
//   POST /api/factory/settings { provider, ...fields } → saves + live-tests
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = requireOwner(req, res);
  if (!auth) return;

  try {
    if (req.method === 'GET') {
      const provider = String(req.query.provider || '') as FactoryProvider;
      if (!PROVIDERS.includes(provider)) return badRequest(res, 'invalid provider');

      if (provider === 'hogoto') {
        const cfg = await getFactoryConfig<HogotoConfig>('hogoto', auth.teamId);
        return res.status(200).json({ provider, configured: Boolean(cfg.apiKey && cfg.tenant), hasApiKey: Boolean(cfg.apiKey), email: cfg.tenant || '' });
      }
      if (provider === 'mango') {
        const cfg = await getFactoryConfig<MangoConfig>('mango', auth.teamId);
        return res.status(200).json({ provider, configured: Boolean(cfg.apiKey), hasApiKey: Boolean(cfg.apiKey) });
      }
      if (provider === 'vinaway') {
        const cfg = await getFactoryConfig<VinawayConfig>('vinaway', auth.teamId);
        return res.status(200).json({ provider, configured: Boolean(cfg.email && cfg.password), email: cfg.email || '' });
      }
      if (provider === 'monkeyking') {
        const cfg = await getFactoryConfig<MonkeyKingConfig>('monkeyking', auth.teamId);
        return res.status(200).json({ provider, configured: Boolean(cfg.username && cfg.password), email: cfg.username || '' });
      }
      if (provider === 'hongphat') {
        const cfg = await getFactoryConfig<HongPhatConfig>('hongphat', auth.teamId);
        return res.status(200).json({ provider, configured: Boolean(cfg.apiKey), hasApiKey: Boolean(cfg.apiKey) });
      }
      const cfg = await getFactoryConfig<DreamshipConfig>('dreamship', auth.teamId);
      return res.status(200).json({ provider, configured: Boolean(cfg.apiKey), hasApiKey: Boolean(cfg.apiKey) });
    }

    if (req.method === 'POST') {
      const { provider, apiKey, email, password, username, tenant } = req.body || {};
      if (!PROVIDERS.includes(provider)) return badRequest(res, 'invalid provider');

      let testOk = false;
      let testMessage = '';
      const test = async (fn: () => Promise<any>) => {
        try {
          await fn();
          testOk = true;
        } catch (e: any) {
          testMessage = e instanceof FactoryError ? e.message : 'Test request failed';
        }
      };

      if (provider === 'mango') {
        const existing = await getFactoryConfig<MangoConfig>('mango', auth.teamId);
        const merged: MangoConfig = { apiKey: apiKey ? String(apiKey).trim() : existing.apiKey };
        await saveConfig('mango', auth.teamId, merged);
        await test(() => mangoFetch(auth.teamId, '/production-lines?limit=1'));
        return res.status(200).json({ provider, configured: Boolean(merged.apiKey), hasApiKey: Boolean(merged.apiKey), testOk, testMessage });
      }

      if (provider === 'vinaway') {
        const existing = await getFactoryConfig<VinawayConfig>('vinaway', auth.teamId);
        const merged: VinawayConfig = {
          email: email !== undefined ? String(email).trim() : existing.email,
          password: password ? String(password) : existing.password,
        };
        await saveConfig('vinaway', auth.teamId, merged);
        clearVinawayToken(auth.teamId);
        await test(() => getVinawayToken(auth.teamId));
        return res.status(200).json({ provider, configured: Boolean(merged.email && merged.password), email: merged.email || '', testOk, testMessage });
      }

      if (provider === 'monkeyking') {
        const existing = await getFactoryConfig<MonkeyKingConfig>('monkeyking', auth.teamId);
        const merged: MonkeyKingConfig = {
          username: username !== undefined ? String(username).trim() : existing.username,
          password: password ? String(password) : existing.password,
        };
        await saveConfig('monkeyking', auth.teamId, merged);
        clearMonkeyKingToken(auth.teamId);
        await test(() => getMonkeyKingToken(auth.teamId));
        return res.status(200).json({ provider, configured: Boolean(merged.username && merged.password), email: merged.username || '', testOk, testMessage });
      }

      if (provider === 'hogoto') {
        const existing = await getFactoryConfig<HogotoConfig>('hogoto', auth.teamId);
        const merged: HogotoConfig = {
          apiKey: apiKey ? String(apiKey).trim() : existing.apiKey,
          tenant: tenant !== undefined ? String(tenant).trim() : existing.tenant,
        };
        await saveConfig('hogoto', auth.teamId, merged);
        await test(() => hogotoFetch(auth.teamId, '/v1/partner/countries'));
        return res.status(200).json({ provider, configured: Boolean(merged.apiKey && merged.tenant), hasApiKey: Boolean(merged.apiKey), email: merged.tenant || '', testOk, testMessage });
      }

      if (provider === 'hongphat') {
        const existing = await getFactoryConfig<HongPhatConfig>('hongphat', auth.teamId);
        const merged: HongPhatConfig = { apiKey: apiKey ? String(apiKey).trim() : existing.apiKey };
        await saveConfig('hongphat', auth.teamId, merged);
        await test(() => hongPhatFetch(auth.teamId, '/products'));
        return res.status(200).json({ provider, configured: Boolean(merged.apiKey), hasApiKey: Boolean(merged.apiKey), testOk, testMessage });
      }

      const existing = await getFactoryConfig<DreamshipConfig>('dreamship', auth.teamId);
      const merged: DreamshipConfig = { apiKey: apiKey ? String(apiKey).trim() : existing.apiKey };
      await saveConfig('dreamship', auth.teamId, merged);
      await test(() => dreamshipFetch(auth.teamId, '/items/?limit=1'));
      return res.status(200).json({ provider, configured: Boolean(merged.apiKey), hasApiKey: Boolean(merged.apiKey), testOk, testMessage });
    }

    return methodNotAllowed(res, ['GET', 'POST']);
  } catch (err) {
    return serverError(res, err);
  }
}
