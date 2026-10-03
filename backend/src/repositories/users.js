import { all, get, run } from '../db/index.js';

export function findUserById(id) {
  return get('SELECT * FROM users WHERE id = ?', [id]);
}

export function findUserByEmail(email) {
  return get('SELECT * FROM users WHERE email = ?', [email]);
}

export function createUser({ name, email, passwordHash }) {
  const r = run(
    'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
    [name, email, passwordHash],
  );
  return findUserById(r.lastInsertRowid);
}

export function updateProfile(id, { name, avatarUrl }) {
  const sets = [];
  const params = [];
  if (name !== undefined) { sets.push('name = ?'); params.push(name); }
  if (avatarUrl !== undefined) { sets.push('avatar_url = ?'); params.push(avatarUrl); }
  if (!sets.length) return findUserById(id);
  sets.push("updated_at = datetime('now')");
  params.push(id);
  run(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, params);
  return findUserById(id);
}

export function updatePassword(id, passwordHash) {
  run("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?", [passwordHash, id]);
}
