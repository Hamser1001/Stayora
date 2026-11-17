import { buildSeedDatabase } from './seed';

const DB_KEY = 'stayora.db.v1';
const SESSION_KEY = 'stayora.session.v1';
const SCHEMA_VERSION = 1;

let cache = null;

function normalize(db) {
  if (!db || db.version !== SCHEMA_VERSION) return buildSeedDatabase();
  return db;
}

export function loadDB() {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) {
      cache = normalize(JSON.parse(raw));
      return cache;
    }
  } catch {
    // Corrupt storage should never block the workspace.
  }
  cache = buildSeedDatabase();
  persist(cache);
  return cache;
}

function persist(db) {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  } catch {
    // Storage quota exceeded — the in-memory workspace keeps working.
  }
}

export function saveDB(db) {
  cache = db;
  persist(db);
  return db;
}

export function resetDB() {
  cache = buildSeedDatabase();
  persist(cache);
  return cache;
}

export function mutate(fn) {
  const db = loadDB();
  const result = fn(db);
  saveDB(db);
  return result;
}

/** "Remember me" keeps the session in localStorage; otherwise it lasts for the tab. */
export function readSession() {
  for (const storage of [sessionStorage, localStorage]) {
    try {
      const raw = storage.getItem(SESSION_KEY);
      if (raw) return JSON.parse(raw);
    } catch {
      // Ignore unavailable storage and try the next one.
    }
  }
  return null;
}

export function writeSession(session, persist = true) {
  if (!session) {
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY);
    return;
  }
  const target = persist ? localStorage : sessionStorage;
  const other = persist ? sessionStorage : localStorage;
  target.setItem(SESSION_KEY, JSON.stringify(session));
  other.removeItem(SESSION_KEY);
}

export function isEphemeralSession() {
  try {
    return Boolean(sessionStorage.getItem(SESSION_KEY));
  } catch {
    return false;
  }
}

export function nextId(prefix, items) {
  const max = items.reduce((highest, item) => {
    const numeric = Number(String(item.id).replace(/\D/g, ''));
    return Number.isFinite(numeric) ? Math.max(highest, numeric) : highest;
  }, 0);
  return `${prefix}_${max + 1}`;
}

export function audit(db, action, entity, entityId, meta = {}) {
  if (!Array.isArray(db.audit)) db.audit = [];
  db.audit.unshift({
    id: `aud_${db.audit.length + 1}`,
    action,
    entity,
    entityId,
    meta,
    actor: 'Amina Bensalem',
    at: new Date().toISOString(),
  });
  db.audit = db.audit.slice(0, 500);
}
