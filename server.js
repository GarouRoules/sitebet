const express = require('express');
const cookieParser = require('cookie-parser');
const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8000;
const ROOT_DIR = __dirname;
const DB_PATH = process.env.DATABASE_PATH || path.join(ROOT_DIR, 'sitebet.db');
const sessions = new Map();

app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

function ensureDatabase() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB_PATH, async (err) => {
      if (err) {
        reject(err);
        return;
      }

      try {
        await new Promise((resolveRun, rejectRun) => {
          db.run(`
            CREATE TABLE IF NOT EXISTS users (
              id TEXT PRIMARY KEY,
              name TEXT NOT NULL UNIQUE,
              salt TEXT NOT NULL,
              passwordHash TEXT NOT NULL,
              balance REAL NOT NULL DEFAULT 10.0,
              createdAt TEXT NOT NULL
            )
          `, (createErr) => {
            if (createErr) return rejectRun(createErr);
            resolveRun();
          });
        });

        const columns = await new Promise((resolveColumns, rejectColumns) => {
          db.all('PRAGMA table_info(users);', (pragmaErr, rows) => {
            if (pragmaErr) return rejectColumns(pragmaErr);
            resolveColumns(rows || []);
          });
        });

        const hasName = columns.some((column) => column.name === 'name');
        const hasEmail = columns.some((column) => column.name === 'email');

        if (!hasName && hasEmail) {
          await new Promise((resolveMigration, rejectMigration) => {
            db.run('ALTER TABLE users RENAME COLUMN email TO name;', (migrationErr) => {
              if (migrationErr) return rejectMigration(migrationErr);
              resolveMigration();
            });
          });
        }

        db.close();
        resolve();
      } catch (error) {
        db.close();
        reject(error);
      }
    });
  });
}

function openDb() {
  return new sqlite3.Database(DB_PATH);
}

function getUserByName(name) {
  return new Promise((resolve, reject) => {
    const db = openDb();
    db.get(
      'SELECT id, name, salt, passwordHash, balance, createdAt FROM users WHERE name = ?',
      [name],
      (err, row) => {
        db.close();
        if (err) return reject(err);
        resolve(row || null);
      }
    );
  });
}

function getUserById(id) {
  return new Promise((resolve, reject) => {
    const db = openDb();
    db.get(
      'SELECT id, name, salt, passwordHash, balance, createdAt FROM users WHERE id = ?',
      [id],
      (err, row) => {
        db.close();
        if (err) return reject(err);
        resolve(row || null);
      }
    );
  });
}

function saveUser(user) {
  return new Promise((resolve, reject) => {
    const db = openDb();
    db.run(
      `
        INSERT INTO users (id, name, salt, passwordHash, balance, createdAt)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          salt = excluded.salt,
          passwordHash = excluded.passwordHash,
          balance = excluded.balance,
          createdAt = excluded.createdAt
      `,
      [user.id, user.name, user.salt, user.passwordHash, user.balance, user.createdAt],
      (err) => {
        db.close();
        if (err) return reject(err);
        resolve();
      }
    );
  });
}

function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 120000, 32, 'sha256').toString('base64');
}

function createSession(res, userId) {
  const sessionId = crypto.randomBytes(24).toString('hex');
  sessions.set(sessionId, userId);
  res.cookie('site_session', sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    path: '/'
  });
}

function getSessionUser(req) {
  const sessionId = req.cookies && req.cookies.site_session;
  if (!sessionId || !sessions.has(sessionId)) return null;
  return sessions.get(sessionId);
}

function jsonResponse(res, status, payload) {
  res.status(status).json(payload);
}

app.get('/api/health', (_req, res) => {
  jsonResponse(res, 200, { ok: true, message: 'SiteBet backend online' });
});

app.post('/api/register', async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    const password = String(req.body?.password || '');

    if (!name) {
      return jsonResponse(res, 400, { error: 'Informe um nome válido.' });
    }

    if (name.length < 2) {
      return jsonResponse(res, 400, { error: 'O nome precisa ter pelo menos 2 caracteres.' });
    }

    if (password.length < 6) {
      return jsonResponse(res, 400, { error: 'A senha precisa ter pelo menos 6 caracteres.' });
    }

    const existing = await getUserByName(name);
    if (existing) {
      return jsonResponse(res, 409, { error: 'Este nome já está cadastrado.' });
    }

    const salt = crypto.randomBytes(16).toString('base64');
    const user = {
      id: crypto.randomUUID(),
      name,
      salt,
      passwordHash: hashPassword(password, salt),
      balance: 10.0,
      createdAt: new Date().toISOString()
    };

    await saveUser(user);
    createSession(res, user.id);

    return jsonResponse(res, 201, {
      user: { name: user.name, balance: Number(user.balance) }
    });
  } catch (error) {
    console.error('Register error:', error);
    return jsonResponse(res, 500, { error: 'Erro ao cadastrar usuário.' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    const password = String(req.body?.password || '');

    const user = await getUserByName(name);
    if (!user) {
      return jsonResponse(res, 401, { error: 'Nome ou senha incorretos.' });
    }

    const expectedHash = hashPassword(password, user.salt);
    if (expectedHash !== user.passwordHash) {
      return jsonResponse(res, 401, { error: 'Nome ou senha incorretos.' });
    }

    createSession(res, user.id);
    return jsonResponse(res, 200, {
      user: { name: user.name, balance: Number(user.balance) }
    });
  } catch (error) {
    console.error('Login error:', error);
    return jsonResponse(res, 500, { error: 'Erro ao fazer login.' });
  }
});

app.get('/api/me', async (req, res) => {
  try {
    const userId = getSessionUser(req);
    if (!userId) {
      return jsonResponse(res, 200, { user: null });
    }

    const user = await getUserById(userId);
    if (!user) {
      return jsonResponse(res, 200, { user: null });
    }

    return jsonResponse(res, 200, {
      user: { name: user.name, balance: Number(user.balance) }
    });
  } catch (error) {
    console.error('Me error:', error);
    return jsonResponse(res, 500, { error: 'Erro ao buscar conta.' });
  }
});

app.post('/api/balance', async (req, res) => {
  try {
    const userId = getSessionUser(req);
    if (!userId) {
      return jsonResponse(res, 401, { error: 'Sessão inválida.' });
    }

    const rawBalance = Number(req.body?.balance ?? 0);
    const safeBalance = Number.isFinite(rawBalance) ? rawBalance : 0;

    const user = await getUserById(userId);
    if (!user) {
      return jsonResponse(res, 401, { error: 'Usuário não encontrado.' });
    }

    const updatedUser = { ...user, balance: safeBalance };
    await saveUser(updatedUser);

    return jsonResponse(res, 200, {
      user: { name: user.name, balance: Number(updatedUser.balance) }
    });
  } catch (error) {
    console.error('Balance error:', error);
    return jsonResponse(res, 500, { error: 'Erro ao atualizar saldo.' });
  }
});

app.post('/api/logout', (req, res) => {
  const sessionId = req.cookies && req.cookies.site_session;
  if (sessionId) {
    sessions.delete(sessionId);
  }

  res.clearCookie('site_session', { path: '/' });
  return jsonResponse(res, 200, { ok: true });
});

app.use(express.static(ROOT_DIR, {
  index: 'index.html',
  extensions: ['html', 'htm'],
  setHeaders: (_res, filePath) => {
    const lower = filePath.toLowerCase();
    if (lower.endsWith('.mp3')) {
      _res.setHeader('Content-Type', 'audio/mpeg');
    }
    if (lower.endsWith('.mp4')) {
      _res.setHeader('Content-Type', 'video/mp4');
    }
    if (lower.endsWith('.webm')) {
      _res.setHeader('Content-Type', 'video/webm');
    }
  }
}));

app.get('/', (_req, res) => {
  res.sendFile(path.join(ROOT_DIR, 'index.html'));
});

app.get('/site.html', (_req, res) => {
  res.sendFile(path.join(ROOT_DIR, 'index.html'));
});

app.use((req, res) => {
  res.status(404).send('Not found');
});

async function startServer() {
  await ensureDatabase();

  app.listen(PORT, () => {
    console.log(`SiteBet backend running on http://localhost:${PORT}`);
  });
}

startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
