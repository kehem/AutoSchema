/* =====================================================================
 * AutoSchema Studio — JSON compliance linter
 * Validates the schema JSON against the expected AutoSchema structure
 * and suggests auto-fixable corrections (typos, wrong types, ...).
 * ===================================================================== */

/* ---------- known vocabulary ---------- */

const KNOWN_TYPES = [
  'INT','INTEGER','BIGINT','SMALLINT','SERIAL','BIGSERIAL','SMALLSERIAL',
  'BOOLEAN','BOOL','REAL','FLOAT4','FLOAT8','DOUBLE','DOUBLE PRECISION','FLOAT',
  'MONEY','NUMERIC','DECIMAL','TEXT','CITEXT','VARCHAR','CHAR','CHARACTER VARYING',
  'BYTEA','DATE','TIME','TIMETZ','TIMESTAMP','TIMESTAMPTZ','DATETIME','INTERVAL',
  'INET','CIDR','MACADDR','MACADDR8','UUID','XML','JSON','JSONB',
  'POINT','LINE','LSEG','BOX','PATH','POLYGON','CIRCLE','TSVECTOR','TSQUERY',
  'INT4RANGE','INT8RANGE','NUMRANGE','TSRANGE','TSTZRANGE','DATERANGE',
  'BIT','OID','REGCLASS','REGPROC','REGPROCEDURE','REGOPER','REGOPERATOR',
  'REGCONFIG','REGDICTIONARY','REGNAMESPACE',
  'FILE','IMAGE','PDF','DOCUMENT','VIDEO','AUDIO'
];

const TOP_KEYS = [
  'database','schema','roles','extensions','sequences','types','domains',
  'tables','table','views','materialized_views','functions'
];

const TABLE_KEYS = [
  'columns','constraints','indexes','comments','table_options',
  'triggers','policies','inherits','like','partition','row_security'
];

const COLUMN_KEYS = [
  'type','default','collate','collation','compression','check','comment','generated',
  'identity','references','notnull','unique','primary_key'
];

const CONSTRAINT_KEYS = ['primary_key','unique','foreign_key','check','exclude'];

/* ---------- text helpers ---------- */

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function levenshtein(a, b) {
  a = String(a); b = String(b);
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = Array.from({ length: m + 1 }, (_, i) => i ? [i, ...Array(n).fill(0)] : [0, ...Array.from({length:n}, (_,j)=>j)]);
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(
        dp[i-1][j] + 1,
        dp[i][j-1] + 1,
        dp[i-1][j-1] + (a[i-1] === b[j-1] ? 0 : 1)
      );
    }
  }
  return dp[m][n];
}

function didYouMean(word, candidates) {
  let best = null, bestD = 1e9;
  const w = String(word);
  for (const c of candidates) {
    const d = levenshtein(w.toLowerCase(), String(c).toLowerCase());
    if (d < bestD) { bestD = d; best = c; }
  }
  const maxD = w.length <= 4 ? 1 : 2;
  return bestD <= maxD ? best : null;
}

/* base of a type name: strip array suffix and params: "VARCHAR(50)[]" -> "VARCHAR" */
function baseType(t) {
  return String(t).toUpperCase().replace(/\[\]$/, '').replace(/\(.*$/, '').trim();
}

/* ---------- fix primitives ---------- */
/* fix kinds:
 *   { kind:'replace-key',    oldKey, newKey }
 *   { kind:'replace-value',  key, oldValue, newValue }
 *   { kind:'insert',         search, replaceText }   // e.g. add "type": "TEXT"
 */

function applyFix(text, fix) {
  if (fix.kind === 'replace-key') {
    const re = new RegExp('"' + escapeRegExp(fix.oldKey) + '"', 'g');
    return text.replace(re, '"' + fix.newKey + '"');
  }
  if (fix.kind === 'replace-value') {
    const oldTxt = JSON.stringify(fix.oldValue);
    const newTxt = JSON.stringify(fix.newValue);
    const re = new RegExp('("' + escapeRegExp(fix.key) + '"\\s*:\\s*)' + escapeRegExp(oldTxt), 'g');
    return text.replace(re, '$1' + newTxt);
  }
  if (fix.kind === 'insert') {
    const re = new RegExp(fix.search, 'g');
    return text.replace(re, fix.replaceText);
  }
  return text;
}

/* ---------- issue helpers ---------- */

function addIssue(issues, severity, path, message, fix, snippet) {
  issues.push({ severity, path, message, fix: fix || null, snippet: snippet || '' });
}

/* warn about an unknown key, offering a rename fix only when the suggested
 * name is NOT already present in the same object (avoid duplicate keys) */
function unknownKeyIssue(issues, objKeys, path, key, validKeys) {
  const where = path || '(root)';
  const sug = didYouMean(key, validKeys);
  if (sug && objKeys.includes(sug)) {
    addIssue(issues, 'warning', path,
      "Unknown key '" + key + "' in " + where + " — and '" + sug + "' already exists here; consider removing '" + key + "'.");
  } else if (sug) {
    addIssue(issues, 'warning', path,
      "Unknown key '" + key + "' in " + where + ". Did you mean '" + sug + "'?",
      { kind: 'replace-key', oldKey: key, newKey: sug });
  } else {
    addIssue(issues, 'warning', path, "Unknown key '" + key + "' in " + where + ".");
  }
}

/* ---------- main linter ---------- */

function lintText(text) {
  const issues = [];
  let root;
  try {
    root = JSON.parse(text);
  } catch (e) {
    addIssue(issues, 'error', '', 'Invalid JSON — ' + e.message);
    return issues;
  }

  if (typeof root !== 'object' || root === null || Array.isArray(root)) {
    addIssue(issues, 'error', '', 'Root must be a JSON object.');
    return issues;
  }

  const typeNames = (root.types && typeof root.types === 'object') ? Object.keys(root.types) : [];
  const domainNames = (root.domains && typeof root.domains === 'object') ? Object.keys(root.domains) : [];
  const tablesObj = root.tables || root.table || {};

  /* ---------- top level ---------- */
  for (const key of Object.keys(root)) {
    if (!TOP_KEYS.includes(key)) {
      unknownKeyIssue(issues, Object.keys(root), '', key, TOP_KEYS);
    }
  }

  if (root.tables && root.table)
    addIssue(issues, 'warning', '', "Both 'tables' and 'table' are present — the generator uses 'tables'. Consider removing 'table'.");

  if (root.database !== undefined && typeof root.database !== 'string')
    addIssue(issues, 'error', 'database', "'database' should be a string (e.g. \"postgresql\").",
      { kind: 'replace-value', key: 'database', oldValue: root.database, newValue: 'postgresql' });

  if (root.schema !== undefined && typeof root.schema !== 'string')
    addIssue(issues, 'error', 'schema', "'schema' should be a string (e.g. \"public\").",
      { kind: 'replace-value', key: 'schema', oldValue: root.schema, newValue: 'public' });

  const hasTables = root.tables || root.table;
  if (!hasTables)
    addIssue(issues, 'error', '', "No tables defined — add a \"tables\": { ... } object.",
      null, '"tables": {\n  "my_table": {\n    "columns": {}\n  }\n}');

  /* extensions */
  if (root.extensions !== undefined) {
    if (!Array.isArray(root.extensions))
      addIssue(issues, 'error', 'extensions', "'extensions' should be an array of extension names.",
        { kind: 'replace-value', key: 'extensions', oldValue: root.extensions, newValue: [] });
    else
      root.extensions.forEach((e, i) => {
        if (typeof e !== 'string' && (typeof e !== 'object' || e === null || !e.name))
          addIssue(issues, 'warning', 'extensions[' + i + ']', 'Each extension should be a string name or an object with a "name".');
      });
  }

  /* roles */
  if (root.roles !== undefined) {
    if (!Array.isArray(root.roles))
      addIssue(issues, 'error', 'roles', "'roles' should be an array.",
        { kind: 'replace-value', key: 'roles', oldValue: root.roles, newValue: [] });
  }

  /* sequences */
  if (root.sequences !== undefined) {
    if (typeof root.sequences !== 'object' || root.sequences === null || Array.isArray(root.sequences))
      addIssue(issues, 'error', 'sequences', "'sequences' should be an object of sequence definitions.");
    else
      for (const [sn, sv] of Object.entries(root.sequences)) {
        if (typeof sv !== 'object' || sv === null || Array.isArray(sv))
          addIssue(issues, 'error', 'sequences.' + sn, 'Sequence "' + sn + '" should be an object (e.g. { "start": 1 }).',
            { kind: 'replace-value', key: sn, oldValue: sv, newValue: { start: 1 } });
      }
  }

  /* types (enums) */
  if (root.types !== undefined) {
    if (typeof root.types !== 'object' || root.types === null || Array.isArray(root.types))
      addIssue(issues, 'error', 'types', "'types' should be an object of enum definitions.");
    else
      for (const [tn, tv] of Object.entries(root.types)) {
        if (!Array.isArray(tv)) {
          addIssue(issues, 'error', 'types.' + tn,
            'Enum "' + tn + '" should be an array of values, e.g. ' + JSON.stringify([tv]) + '.',
            { kind: 'replace-value', key: tn, oldValue: tv, newValue: [tv] });
        } else {
          tv.forEach((v, i) => {
            if (typeof v !== 'string')
              addIssue(issues, 'warning', 'types.' + tn + '[' + i + ']', 'Enum values should be strings.');
          });
        }
      }
  }

  /* domains */
  if (root.domains !== undefined) {
    if (typeof root.domains !== 'object' || root.domains === null || Array.isArray(root.domains))
      addIssue(issues, 'error', 'domains', "'domains' should be an object of domain definitions.");
    else
      for (const [dn, dv] of Object.entries(root.domains)) {
        if (typeof dv !== 'object' || dv === null || Array.isArray(dv))
          addIssue(issues, 'error', 'domains.' + dn, 'Domain "' + dn + '" should be an object with a "type".',
            { kind: 'replace-value', key: dn, oldValue: dv, newValue: { type: 'TEXT' } });
        else if (!dv.type)
          addIssue(issues, 'error', 'domains.' + dn, 'Domain "' + dn + '" is missing its "type".',
            null, '"type": "TEXT"');
      }
  }

  /* ---------- tables ---------- */
  if (hasTables) {
    for (const [tname, td] of Object.entries(hasTables)) {
      const p = 'tables.' + tname;
      if (typeof td !== 'object' || td === null || Array.isArray(td)) {
        addIssue(issues, 'error', p, 'Table "' + tname + '" should be an object with a "columns" member.');
        continue;
      }

      for (const key of Object.keys(td)) {
        if (!TABLE_KEYS.includes(key)) {
          unknownKeyIssue(issues, Object.keys(td), p, key, TABLE_KEYS);
        }
      }

      const hasColumns = td.columns && typeof td.columns === 'object' && !Array.isArray(td.columns);
      if (!hasColumns) {
        const suggestsColumns = Object.keys(td).some(k => didYouMean(k, ['columns']) === 'columns');
        if (!suggestsColumns)
          addIssue(issues, 'error', p, 'Table "' + tname + '" is missing a "columns" object.',
            null, '"columns": {\n    "id": { "type": "BIGSERIAL", "primary_key": true }\n  }');
      }

      /* columns */
      if (td.columns !== undefined) {
        if (typeof td.columns !== 'object' || td.columns === null || Array.isArray(td.columns)) {
          addIssue(issues, 'error', p + '.columns', "'columns' should be an object mapping column names to definitions.");
        } else {
          for (const [cname, cdef] of Object.entries(td.columns)) {
            const cp = p + '.columns.' + cname;
            if (typeof cdef === 'string') continue; /* legacy string form is fine */

            if (typeof cdef !== 'object' || cdef === null || Array.isArray(cdef)) {
              addIssue(issues, 'error', cp, 'Column "' + cname + '" should be a string (legacy) or an object definition.');
              continue;
            }

            for (const key of Object.keys(cdef)) {
              if (!COLUMN_KEYS.includes(key)) {
                unknownKeyIssue(issues, Object.keys(cdef), cp, key, COLUMN_KEYS);
              }
            }

            /* type */
            if (!cdef.type) {
              addIssue(issues, 'error', cp, 'Column "' + cname + '" is missing a "type".',
                { kind: 'insert', search: '"' + escapeRegExp(cname) + '"\\s*:\\s*\\{', replaceText: '"' + cname + '": { "type": "TEXT", ' });
            } else if (typeof cdef.type !== 'string') {
              addIssue(issues, 'error', cp + '.type', '"type" should be a string.',
                { kind: 'replace-value', key: 'type', oldValue: cdef.type, newValue: String(cdef.type) });
            } else {
              const base = baseType(cdef.type);
              const known = KNOWN_TYPES.includes(base) || KNOWN_TYPES.includes(cdef.type.toUpperCase());
              const isEnum = typeNames.includes(cdef.type) || typeNames.includes(base.toLowerCase());
              const isDomain = domainNames.includes(cdef.type) || domainNames.includes(base.toLowerCase());
              if (!known && !isEnum && !isDomain) {
                const candidates = KNOWN_TYPES.concat(typeNames, domainNames);
                const sug = didYouMean(cdef.type, candidates);
                if (sug) {
                  addIssue(issues, 'warning', cp + '.type',
                    "Unknown type '" + cdef.type + "'. Did you mean '" + sug + "'?",
                    { kind: 'replace-value', key: 'type', oldValue: cdef.type, newValue: sug });
                } else {
                  addIssue(issues, 'warning', cp + '.type',
                    "Type '" + cdef.type + "' is not a built-in type and is not defined in 'types' or 'domains'.",
                    null, '"' + cdef.type + '": [\n    "value1",\n    "value2"\n  ]');
                }
              }
            }

            /* boolean flags */
            for (const flag of ['notnull', 'unique', 'primary_key']) {
              if (cdef[flag] !== undefined && typeof cdef[flag] !== 'boolean') {
                const nv = (cdef[flag] === true || String(cdef[flag]).toLowerCase() === 'true') ? true : false;
                addIssue(issues, 'warning', cp + '.' + flag,
                  '"' + flag + '" should be true/false (boolean), not "' + cdef[flag] + '".',
                  { kind: 'replace-value', key: flag, oldValue: cdef[flag], newValue: nv });
              }
            }

            /* references */
            if (cdef.references !== undefined) {
              if (typeof cdef.references !== 'object' || cdef.references === null || Array.isArray(cdef.references)) {
                addIssue(issues, 'error', cp + '.references', '"references" should be an object like { "table": "users" }.');
              } else {
                if (!cdef.references.table)
                  addIssue(issues, 'error', cp + '.references', 'Reference for column "' + cname + '" is missing "table".',
                    null, '"table": "target_table"');
                else if (Object.keys(tablesObj).length) {
                  const tkey = Object.keys(tablesObj).find(t => t.toLowerCase() === String(cdef.references.table).toLowerCase());
                  if (!tkey) {
                    const sug = didYouMean(cdef.references.table, Object.keys(tablesObj));
                    if (sug)
                      addIssue(issues, 'warning', cp + '.references.table',
                        "Referenced table '" + cdef.references.table + "' is not defined. Did you mean '" + sug + "'?",
                        { kind: 'replace-value', key: 'table', oldValue: cdef.references.table, newValue: sug });
                    else
                      addIssue(issues, 'warning', cp + '.references.table',
                        "Referenced table '" + cdef.references.table + "' is not defined in 'tables'.");
                  }
                }
              }
            }

            /* identity */
            if (cdef.identity !== undefined) {
              if (typeof cdef.identity !== 'object' || cdef.identity === null || Array.isArray(cdef.identity)) {
                addIssue(issues, 'error', cp + '.identity', '"identity" should be an object like { "type": "ALWAYS" }.');
              } else if (cdef.identity.type !== undefined &&
                         !['ALWAYS', 'BY DEFAULT'].includes(String(cdef.identity.type).toUpperCase())) {
                addIssue(issues, 'warning', cp + '.identity.type',
                  "Identity type should be 'ALWAYS' or 'BY DEFAULT', got '" + cdef.identity.type + "'.",
                  { kind: 'replace-value', key: 'type', oldValue: cdef.identity.type, newValue: 'ALWAYS' });
              }
            }

            /* generated */
            if (cdef.generated !== undefined && typeof cdef.generated !== 'string')
              addIssue(issues, 'warning', cp + '.generated', '"generated" should be a string like "ALWAYS AS (expr) STORED".');
          }
        }
      }

      /* constraints */
      if (td.constraints !== undefined) {
        const cons = td.constraints;
        if (typeof cons !== 'object' || cons === null || Array.isArray(cons)) {
          addIssue(issues, 'error', p + '.constraints', "'constraints' should be an object.");
        } else {
          for (const key of Object.keys(cons)) {
            if (!CONSTRAINT_KEYS.includes(key)) {
              unknownKeyIssue(issues, Object.keys(cons), p + '.constraints', key, CONSTRAINT_KEYS);
            }
          }
          if (cons.primary_key !== undefined && typeof cons.primary_key === 'string')
            addIssue(issues, 'warning', p + '.constraints.primary_key',
              '"primary_key" should be an array of column names, not a string.',
              { kind: 'replace-value', key: 'primary_key', oldValue: cons.primary_key, newValue: [cons.primary_key] });
          if (cons.unique !== undefined && typeof cons.unique === 'string')
            addIssue(issues, 'warning', p + '.constraints.unique',
              '"unique" should be an array of columns or an object of named constraints.',
              { kind: 'replace-value', key: 'unique', oldValue: cons.unique, newValue: [cons.unique] });
          if (cons.foreign_key !== undefined) {
            if (Array.isArray(cons.foreign_key)) {
              cons.foreign_key.forEach((fe, i) => {
                if (typeof fe !== 'object' || fe === null)
                  addIssue(issues, 'error', p + '.constraints.foreign_key[' + i + ']', 'Each foreign key entry should be an object with "columns" and "ref_table".');
                else {
                  if (!fe.columns) addIssue(issues, 'error', p + '.constraints.foreign_key[' + i + ']', 'Foreign key entry is missing "columns".');
                  if (!fe.ref_table) addIssue(issues, 'error', p + '.constraints.foreign_key[' + i + ']', 'Foreign key entry is missing "ref_table".');
                }
              });
            } else if (typeof cons.foreign_key !== 'object' || cons.foreign_key === null) {
              addIssue(issues, 'error', p + '.constraints.foreign_key', '"foreign_key" should be an object or array.');
            }
          }
        }
      }

      /* indexes */
      if (td.indexes !== undefined) {
        if (typeof td.indexes !== 'object' || td.indexes === null || Array.isArray(td.indexes)) {
          addIssue(issues, 'error', p + '.indexes', "'indexes' should be an object mapping index names to definitions.");
        } else {
          for (const [iname, iv] of Object.entries(td.indexes)) {
            if (typeof iv === 'object' && iv !== null && !Array.isArray(iv) && !iv.columns)
              addIssue(issues, 'warning', p + '.indexes.' + iname,
                'Index "' + iname + '" is missing "columns".',
                null, '"columns": "column_name"');
          }
        }
      }

      /* triggers */
      if (td.triggers !== undefined) {
        if (!Array.isArray(td.triggers)) {
          addIssue(issues, 'error', p + '.triggers', "'triggers' should be an array.");
        } else {
          td.triggers.forEach((tt, i) => {
            if (typeof tt !== 'object' || tt === null) {
              addIssue(issues, 'error', p + '.triggers[' + i + ']', 'Each trigger should be an object.');
              return;
            }
            if (!tt.name) addIssue(issues, 'error', p + '.triggers[' + i + ']', 'Trigger is missing "name".');
            if (!tt.event) addIssue(issues, 'error', p + '.triggers[' + i + ']', 'Trigger is missing "event" (e.g. "UPDATE").');
            if (!tt.function) addIssue(issues, 'error', p + '.triggers[' + i + ']', 'Trigger is missing "function".');
          });
        }
      }

      /* policies */
      if (td.policies !== undefined) {
        if (!Array.isArray(td.policies)) {
          addIssue(issues, 'error', p + '.policies', "'policies' should be an array.");
        } else {
          td.policies.forEach((pp, i) => {
            if (typeof pp !== 'object' || pp === null)
              addIssue(issues, 'error', p + '.policies[' + i + ']', 'Each policy should be an object.');
            else if (!pp.name)
              addIssue(issues, 'error', p + '.policies[' + i + ']', 'Policy is missing "name".');
          });
        }
      }

      /* row_security */
      if (td.row_security !== undefined && typeof td.row_security !== 'boolean')
        addIssue(issues, 'warning', p + '.row_security', '"row_security" should be true/false.',
          { kind: 'replace-value', key: 'row_security', oldValue: td.row_security,
            newValue: td.row_security === true || String(td.row_security).toLowerCase() === 'true' });
    }
  }

  /* ---------- views ---------- */
  if (root.views !== undefined) {
    if (typeof root.views !== 'object' || root.views === null || Array.isArray(root.views))
      addIssue(issues, 'error', 'views', "'views' should be an object mapping view names to queries.");
    else
      for (const [vn, vd] of Object.entries(root.views)) {
        if (typeof vd !== 'string' && (typeof vd !== 'object' || vd === null || !vd.query))
          addIssue(issues, 'warning', 'views.' + vn, 'View "' + vn + '" should be a query string or an object with "query".');
      }
  }

  /* ---------- materialized views ---------- */
  if (root.materialized_views !== undefined) {
    if (typeof root.materialized_views !== 'object' || root.materialized_views === null || Array.isArray(root.materialized_views))
      addIssue(issues, 'error', 'materialized_views', "'materialized_views' should be an object.");
    else
      for (const [vn, vd] of Object.entries(root.materialized_views)) {
        if (typeof vd !== 'object' || vd === null || !vd.query)
          addIssue(issues, 'error', 'materialized_views.' + vn, 'Materialized view "' + vn + '" is missing a "query".');
      }
  }

  /* ---------- functions ---------- */
  if (root.functions !== undefined) {
    if (!Array.isArray(root.functions))
      addIssue(issues, 'error', 'functions', "'functions' should be an array.");
    else
      root.functions.forEach((f, i) => {
        if (typeof f !== 'object' || f === null) {
          addIssue(issues, 'error', 'functions[' + i + ']', 'Each function should be an object.');
          return;
        }
        if (!f.name) addIssue(issues, 'error', 'functions[' + i + ']', 'Function is missing "name".');
        if (!f.body) addIssue(issues, 'warning', 'functions[' + i + ']', 'Function "' + (f.name || '?') + '" is missing a "body".');
      });
  }

  return issues;
}

/* apply all fixable issues, iterating (fixes expose new issues, e.g. a
 * key typo 'colums' -> 'columns' lets column checks run). Returns {text, rounds}. */
function applyAllFixes(text, issues) {
  let out = text;
  let rounds = 0;
  let changed = true;
  while (changed && rounds < 6) {
    changed = false;
    rounds++;
    const current = lintText(out);
    for (const iss of current) {
      if (!iss.fix) continue;
      const before = out;
      out = applyFix(out, iss.fix);
      if (out !== before) changed = true;
    }
  }
  return { text: out, rounds };
}

/* ---------- module export (for node testing) ---------- */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { lintText, applyFix, applyAllFixes, didYouMean, levenshtein, baseType, KNOWN_TYPES };
}
