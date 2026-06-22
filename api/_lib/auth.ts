import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const JWT_SECRET = process.env.JWT_SECRET || '';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

if (!JWT_SECRET) {
  console.warn('[auth] JWT_SECRET is not set');
}

export interface AuthTokenPayload {
  userId: string;
  teamId: string;
  role: 'OWNER' | 'USER';
  email: string;
}

export function signToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions);
}

export function verifyToken(token: string): AuthTokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as AuthTokenPayload;
  } catch {
    return null;
  }
}

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export function comparePassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * Extract & verify auth token from request.
 * Returns payload if valid, otherwise sends 401 response and returns null.
 */
export function requireAuth(req: VercelRequest, res: VercelResponse): AuthTokenPayload | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ message: 'Missing or invalid Authorization header' });
    return null;
  }
  const token = header.slice('Bearer '.length).trim();
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ message: 'Invalid or expired token' });
    return null;
  }
  return payload;
}

/**
 * Same as requireAuth but also enforces OWNER role.
 */
export function requireOwner(req: VercelRequest, res: VercelResponse): AuthTokenPayload | null {
  const payload = requireAuth(req, res);
  if (!payload) return null;
  if (payload.role !== 'OWNER') {
    res.status(403).json({ message: 'Owner role required' });
    return null;
  }
  return payload;
}
