import jwt from 'jsonwebtoken';
import config from '../config.js';
import { HttpError } from './error.js';
import { findUserById } from '../repositories/users.js';

/** Verifies `Authorization: Bearer <jwt>` and sets req.user = { id }. */
export function auth(req, _res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new HttpError(401, 'Unauthorized');

    let payload;
    try {
      payload = jwt.verify(token, config.JWT_SECRET);
    } catch {
      throw new HttpError(401, 'Session expired, please log in again');
    }

    const user = findUserById(Number(payload.sub));
    if (!user) throw new HttpError(401, 'Unauthorized');

    req.user = { id: user.id, email: user.email, name: user.name };
    next();
  } catch (err) {
    next(err);
  }
}

export function signToken(user) {
  return jwt.sign({ sub: String(user.id), email: user.email }, config.JWT_SECRET, {
    expiresIn: config.JWT_EXPIRES_IN,
  });
}
