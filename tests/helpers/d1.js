// A stand-in for Cloudflare's D1 database, for tests only.
// It keeps the data in memory using the SQLite that is built into Node.js, and offers the
// same small set of calls the site uses: prepare().bind().run() / .all() / .first(),
// batch() and exec().
const { DatabaseSync } = require('node:sqlite');

function createD1() {
  const sqlite = new DatabaseSync(':memory:');

  function statement(sql, args = []) {
    const run = (mode) => {
      const stmt = sqlite.prepare(sql);
      if (mode === 'run') {
        const info = stmt.run(...args);
        return { success: true, results: [], meta: { changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid), size_after: 0 } };
      }
      const rows = stmt.all(...args).map((row) => ({ ...row }));
      return { success: true, results: rows, meta: { changes: 0, size_after: 0 } };
    };
    // D1 accepts undefined-free values only; SQLite in Node wants null instead of undefined.
    const safe = (values) => values.map((v) => (v === undefined ? null : typeof v === 'boolean' ? Number(v) : v));
    return {
      bind: (...values) => statement(sql, safe(values)),
      run: async () => run('run'),
      all: async () => run('all'),
      first: async (column) => {
        const row = run('all').results[0];
        if (!row) return null;
        return column ? row[column] ?? null : row;
      },
      _runSync: () => (/^\s*(select|pragma|with)\b/i.test(sql) ? run('all') : run('run')),
    };
  }

  return {
    prepare: (sql) => statement(sql),
    batch: async (statements) => statements.map((s) => s._runSync()),
    exec: async (sql) => {
      sqlite.exec(sql);
      return { count: 1, duration: 0 };
    },
    // Test-only helpers
    _rows: (sql, ...args) => sqlite.prepare(sql).all(...args).map((row) => ({ ...row })),
    _run: (sql, ...args) => sqlite.prepare(sql).run(...args),
    _close: () => sqlite.close(),
  };
}

module.exports = { createD1 };
