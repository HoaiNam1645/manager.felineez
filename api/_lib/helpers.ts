import type { VercelRequest, VercelResponse } from '@vercel/node';

export function methodNotAllowed(res: VercelResponse, allowed: string[]) {
  res.setHeader('Allow', allowed.join(', '));
  return res.status(405).json({ message: 'Method not allowed' });
}

export function badRequest(res: VercelResponse, message: string) {
  return res.status(400).json({ message });
}

export function notFound(res: VercelResponse, message = 'Not found') {
  return res.status(404).json({ message });
}

export function serverError(res: VercelResponse, err: unknown) {
  console.error(err);
  return res.status(500).json({
    message: err instanceof Error ? err.message : 'Internal server error',
  });
}

export function parseDate(v: unknown): Date | null {
  if (!v) return null;
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? null : d;
}

export function parseId(v: unknown): string | null {
  if (typeof v !== 'string' || !v) return null;
  return v;
}
