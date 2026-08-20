/* =====================================================================
 * AutoSchema Studio — JSON → PostgreSQL DDL engine
 * Pure JavaScript port of the AutoSchema v2 C generator (schema.c).
 * No dependencies. Runs fully in the browser.
 * ===================================================================== */

/* ---------- helpers ---------- */

function qi(id) {
  if (!id) return '';
  if (id[0] === '"') return id;
  return /^[a-z_][a-z0-9_]*$/.test(id) ? id : '"' + id + '"';
}

function esc(s) {
  return String(s).replace(/'/g, "''");
}

/* ---------- type mapping (mirrors map_type in schema.c) ---------- */

function mapType(raw) {
  let buf = String(raw).trim();
  let upper = buf.toUpperCase();

  let isArr = false;
  const br = upper.indexOf('[]');
  if (br !== -1) { isArr = true; buf = buf.slice(0, br).trim(); upper = buf.toUpperCase(); }

  let pg = '';
  const U = upper;

  if      (U === 'INT' || U === 'INTEGER')                  pg = 'INTEGER';
  else if (U === 'BIGINT')                                  pg = 'BIGINT';
  else if (U === 'SMALLINT')                                pg = 'SMALLINT';
  else if (U === 'SERIAL')                                  pg = 'SERIAL';
  else if (U === 'BIGSERIAL')                               pg = 'BIGSERIAL';
  else if (U === 'SMALLSERIAL')                             pg = 'SMALLSERIAL';
  else if (U === 'BOOLEAN' || U === 'BOOL')                 pg = 'BOOLEAN';
  else if (U === 'REAL' || U === 'FLOAT4')                  pg = 'REAL';
  else if (U === 'DOUBLE' || U === 'FLOAT8')                pg = 'DOUBLE PRECISION';
  else if (U === 'FLOAT')                                   pg = 'FLOAT';
  else if (U === 'MONEY')                                   pg = 'MONEY';
  else if (U === 'NUMERIC' || U === 'DECIMAL')              pg = buf.includes('(') ? buf : 'NUMERIC';
  else if (U === 'TEXT')                                    pg = 'TEXT';
  else if (U === 'CITEXT')                                  pg = 'CITEXT';
  else if (U.startsWith('VARCHAR') || U.startsWith('CHARACTER VARYING')) pg = buf;
  else if (U.startsWith('CHAR'))                            pg = buf;
  else if (U === 'BYTEA')                                   pg = 'BYTEA';
  else if (U === 'DATE')                                    pg = 'DATE';
  else if (U === 'TIME')                                    pg = 'TIME';
  else if (U === 'TIMETZ')                                  pg = 'TIMETZ';
  else if (U === 'DATETIME')                                pg = 'TIMESTAMP';
  else if (U === 'TIMESTAMP')                               pg = 'TIMESTAMP';
  else if (U === 'TIMESTAMPTZ' || U.includes('TIMESTAMP WITH TIME ZONE')) pg = 'TIMESTAMP WITH TIME ZONE';
  else if (U === 'INTERVAL')                                pg = 'INTERVAL';
  else if (U === 'INET')                                    pg = 'INET';
  else if (U === 'CIDR')                                    pg = 'CIDR';
  else if (U === 'MACADDR')                                 pg = 'MACADDR';
  else if (U === 'MACADDR8')                                pg = 'MACADDR8';
  else if (U === 'UUID')                                    pg = 'UUID';
  else if (U === 'XML')                                     pg = 'XML';
  else if (U === 'JSON')                                    pg = 'JSON';
  else if (U === 'JSONB')                                   pg = 'JSONB';
  else if (U === 'POINT')                                   pg = 'POINT';
  else if (U === 'LINE')                                    pg = 'LINE';
  else if (U === 'LSEG')                                    pg = 'LSEG';
  else if (U === 'BOX')                                     pg = 'BOX';
  else if (U === 'PATH')                                    pg = 'PATH';
  else if (U === 'POLYGON')                                 pg = 'POLYGON';
  else if (U === 'CIRCLE')                                  pg = 'CIRCLE';
  else if (U === 'TSVECTOR')                                pg = 'TSVECTOR';
  else if (U === 'TSQUERY')                                 pg = 'TSQUERY';
  else if (U === 'INT4RANGE')                               pg = 'INT4RANGE';
  else if (U === 'INT8RANGE')                               pg = 'INT8RANGE';
  else if (U === 'NUMRANGE')                                pg = 'NUMRANGE';
  else if (U === 'TSRANGE')                                 pg = 'TSRANGE';
  else if (U === 'TSTZRANGE')                               pg = 'TSTZRANGE';
  else if (U === 'DATERANGE')                               pg = 'DATERANGE';
  else if (U.startsWith('BIT'))                             pg = buf;
  else if (U === 'OID')                                     pg = 'OID';
  else if (['REGPROC','REGPROCEDURE','REGOPER','REGOPERATOR','REGCLASS',
            'REGCONFIG','REGDICTIONARY','REGNAMESPACE'].includes(U)) pg = buf;
  /* file types → TEXT (with companion mime_type column + CHECK) */
  else if (['FILE','IMAGE','PDF','DOCUMENT','VIDEO','AUDIO'].includes(U)) pg = 'TEXT';
  else pg = buf; /* enum, domain, or custom type */

  if (isArr) pg += '[]';
  return pg;
}

/* MIME CHECK expression for file types, or null */
function fileMimeCheck(typeUpper) {
  switch (typeUpper) {
    case 'FILE':     return "mime_type ~ '^(application|audio|image|text|video)/[a-z0-9.+-]+$'";
    case 'IMAGE':    return "mime_type IN ('image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/bmp', 'image/tiff')";
    case 'PDF':      return "mime_type = 'application/pdf'";
    case 'DOCUMENT': return "mime_type IN ('application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain', 'application/pdf', 'application/vnd.oasis.opendocument.text')";
    case 'VIDEO':    return "mime_type IN ('video/mp4', 'video/webm', 'video/ogg', 'video/x-msvideo', 'video/quicktime')";
    case 'AUDIO':    return "mime_type IN ('audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4', 'audio/x-aiff')";
    default:         return null;
  }
}

/* ---------- column parsing ---------- */

function newDef() {
  return { type: '', file_type: '', default: '', collation: '', compression: '', check: '',
           comment: '', generated: '', identity_type: '', identity_opts: '',
           ref_table: '', ref_column: '', ref_ondelete: '', ref_onupdate: '',
           ref_deferrable: '', ref_initially: '',
           notnull: false, unique: false, primary_key: false, is_foreign: false };
}

/* returns uppercase file-type name (IMAGE/PDF/...) or '' */
function fileTypeName(raw) {
  const u = String(raw).trim().toUpperCase().replace(/\[\]$/, '');
  return ['FILE', 'IMAGE', 'PDF', 'DOCUMENT', 'VIDEO', 'AUDIO'].includes(u) ? u : '';
}

function findModifierComma(buf) {
  /* comma outside parens */
  let depth = 0;
  for (let i = 0; i < buf.length; i++) {
    const c = buf[i];
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === ',' && depth === 0) return i;
  }
  /* legacy: comma inside parens with trailing ')' */
  if (buf.endsWith(')')) {
    depth = 0;
    for (let i = buf.length - 1; i >= 0; i--) {
      const c = buf[i];
      if (c === ')') depth++;
      else if (c === '(') depth--;
      else if (c === ',' && depth === 1) return i;
    }
  }
  return null;
}

function parseColStr(str) {
  const def = newDef();
  let buf = String(str).trim();

  /* Generated(expr) */
  if (buf.startsWith('Generated(')) {
    let depth = 1, j = 10, expr = '';
    while (j < buf.length && depth > 0) {
      const c = buf[j];
      if (c === '(') depth++;
      else if (c === ')') depth--;
      if (depth > 0) expr += c;
      j++;
    }
    def.generated = 'ALWAYS AS (' + expr + ') STORED';
    def.notnull = true;
    return def;
  }

  /* Foreign(table) [ON DELETE ...] [ON UPDATE ...] */
  if (buf.startsWith('Foreign(')) {
    const inner = buf.slice(8, buf.lastIndexOf(')'));
    const m = inner.match(/^(\S+)(?:\s+ON\s+DELETE\s+(\S+))?(?:\s+ON\s+UPDATE\s+(\S+))?/);
    def.type = 'INTEGER';
    def.ref_table = m[1];
    def.ref_column = 'id';
    if (m[2]) def.ref_ondelete = m[2];
    if (m[3]) def.ref_onupdate = m[3];
    def.is_foreign = true;
    return def;
  }

  /* Type [DEFAULT expr] */
  let rawType;
  const defPos = buf.indexOf(' DEFAULT ');
  if (defPos !== -1) {
    rawType = buf.slice(0, defPos).trim();
    def.default = buf.slice(defPos + 9).trim();
  } else {
    const comma = findModifierComma(buf);
    if (comma !== null) {
      const mod = buf.slice(comma + 1).split(')')[0].trim().toLowerCase();
      if (mod === 'notnull' || mod === 'unique') {
        rawType = buf.slice(0, comma).trim();
        if (rawType.includes('(') && !rawType.includes(')')) rawType += ')';
        if (mod === 'notnull') def.notnull = true;
        else def.unique = true;
      } else {
        rawType = buf;
      }
    } else {
      rawType = buf;
    }
  }
  def.type = mapType(rawType);
  def.file_type = fileTypeName(rawType);
  return def;
}

function parseColObj(obj) {
  const def = newDef();
  const rawType = String(obj.type || 'TEXT');
  def.type = mapType(rawType);
  def.file_type = fileTypeName(rawType);
  def.default      = obj.default || '';
  def.collation    = obj.collate || obj.collation || '';
  def.compression  = obj.compression || '';
  def.check        = obj.check || '';
  def.comment      = obj.comment || '';
  def.generated    = obj.generated || '';
  def.notnull      = !!obj.notnull;
  def.unique       = !!obj.unique;
  def.primary_key  = !!obj.primary_key;

  if (obj.identity && typeof obj.identity === 'object') {
    def.identity_type = obj.identity.type || 'ALWAYS';
    const opts = [];
    if (obj.identity.start !== undefined) opts.push('START ' + obj.identity.start);
    if (obj.identity.increment !== undefined) opts.push('INCREMENT ' + obj.identity.increment);
    if (obj.identity.minvalue !== undefined) opts.push('MINVALUE ' + obj.identity.minvalue);
    if (obj.identity.maxvalue !== undefined) opts.push('MAXVALUE ' + obj.identity.maxvalue);
    if (obj.identity.cycle) opts.push('CYCLE');
    def.identity_opts = opts.join(' ');
  }

  if (obj.references && typeof obj.references === 'object') {
    def.ref_table       = obj.references.table || '';
    def.ref_column      = obj.references.column || 'id';
    def.ref_ondelete    = obj.references.ondelete || '';
    def.ref_onupdate    = obj.references.onupdate || '';
    def.ref_deferrable  = obj.references.deferrable || '';
    def.ref_initially   = obj.references.initially || '';
    def.is_foreign      = !!def.ref_table;
  }
  return def;
}

/* ---------- column printing ---------- */

function printCol(name, def, schema, table) {
  let s = '    ' + qi(name);
  if (def.generated) {
    s += ' ' + (def.type || 'TEXT'); /* PG requires a data type on generated columns */
    if (!/^GENERATED/i.test(def.generated)) s += ' GENERATED';
    s += ' ' + def.generated;
    if (def.notnull) s += ' NOT NULL';
    if (def.collation) s += ' COLLATE ' + def.collation;
    if (def.comment) s += '  /* ' + def.comment + ' */';
    return s;
  }
  if (def.identity_type) {
    s += ' ' + def.type + ' GENERATED ' + def.identity_type + ' AS IDENTITY';
    if (def.identity_opts) s += ' (' + def.identity_opts + ')';
    if (def.collation) s += ' COLLATE ' + def.collation;
    if (def.notnull) s += ' NOT NULL';
    if (def.unique) s += ' UNIQUE';
    if (def.primary_key) s += ' PRIMARY KEY';
    if (def.default) s += ' DEFAULT ' + def.default;
  } else {
    s += ' ' + def.type;
    if (def.collation) s += ' COLLATE ' + def.collation;
    if (def.compression) s += ' COMPRESSION ' + def.compression;
    if (def.default) s += ' DEFAULT ' + def.default;
    if (def.notnull) s += ' NOT NULL';
    if (def.unique) s += ' UNIQUE';
    if (def.primary_key) s += ' PRIMARY KEY';
    if (def.is_foreign) {
      s += ' REFERENCES ' + qi(schema) + '.' + qi(def.ref_table) + '(' + qi(def.ref_column) + ')';
      if (def.ref_ondelete) s += ' ON DELETE ' + def.ref_ondelete;
      if (def.ref_onupdate) s += ' ON UPDATE ' + def.ref_onupdate;
      if (def.ref_deferrable) {
        s += (/^true$/i.test(def.ref_deferrable)) ? ' DEFERRABLE' : ' ' + def.ref_deferrable;
      }
      if (def.ref_initially) s += ' INITIALLY ' + def.ref_initially;
    }
    if (def.check) s += ' CHECK (' + def.check + ')';
  }
  if (def.comment) s += '  /* ' + def.comment + ' */';
  return s;
}

function joinIds(arr) {
  return arr.map(v => qi(String(v))).join(', ');
}

/* ---------- table generation ---------- */

function generateTable(schema, tname, td) {
  const L = [];
  const columns = td.columns, cons = td.constraints, topts = td.table_options,
        indexes = td.indexes, comments = td.comments, triggers = td.triggers,
        policies = td.policies, inherit = td.inherits, like = td.like;

  if (!columns || typeof columns !== 'object') {
    return { sql: '-- table ' + tname + ' has no columns', tips: [], stats: {} };
  }

  let head = 'CREATE ';
  if (topts) {
    if (topts.unlogged) head += 'UNLOGGED ';
    if (topts.temporary || topts.temp) head += 'TEMPORARY ';
  }
  head += 'TABLE IF NOT EXISTS ' + qi(schema) + '.' + qi(tname) + ' (';
  L.push(head);

  if (like && typeof like === 'object') {
    const lt = like.table || '???';
    L.push('    LIKE ' + qi(schema) + '.' + qi(lt) + (like.options ? ' ' + like.options : '') + ',');
  }

  /* columns */
  const entries = Object.entries(columns);
  let hasColPk = false;
  const localCols = entries.map(([n]) => n);
  const colLines = [];
  for (const [cname, cdef] of entries) {
    const def = (typeof cdef === 'string') ? parseColStr(cdef) : parseColObj(cdef || {});
    if (def.primary_key) hasColPk = true;
    let line = printCol(cname, def, schema, tname);
    /* file-type companion mime column */
    const mime = fileMimeCheck(def.file_type || def.type.toUpperCase());
    if (mime && !def.generated) {
      const mcol = qi(cname + '_mime_type');
      /* the CHECK must reference the actual companion column, not a literal 'mime_type' */
      const expr = mime.replace(/mime_type/g, mcol);
      line += ',\n    ' + mcol + ' VARCHAR(100)';
      line += ',\n    CHECK (' + mcol + ' IS NULL OR (' + expr + '))';
    }
    colLines.push(line);
  }
  const bodyParts = colLines.slice();
  /* table constraints */
  let deferredPk = '';
  const constraintLines = [];
  if (cons && typeof cons === 'object') {
    if (Array.isArray(cons.primary_key) && !hasColPk) {
      const allLocal = cons.primary_key.every(c => localCols.includes(String(c)));
      if (allLocal) constraintLines.push('    PRIMARY KEY (' + joinIds(cons.primary_key) + ')');
      else deferredPk = joinIds(cons.primary_key);
    }
    if (cons.unique) {
      if (Array.isArray(cons.unique)) {
        constraintLines.push('    UNIQUE (' + joinIds(cons.unique) + ')');
      } else if (typeof cons.unique === 'object') {
        for (const [un, uv] of Object.entries(cons.unique)) {
          const cols = Array.isArray(uv) ? joinIds(uv) : qi(String(uv));
          constraintLines.push('    CONSTRAINT ' + qi(un) + ' UNIQUE (' + cols + ')');
        }
      }
    }
    if (cons.foreign_key) {
      if (typeof cons.foreign_key === 'object' && !Array.isArray(cons.foreign_key)) {
        for (const [fc, fv] of Object.entries(cons.foreign_key)) {
          constraintLines.push('    FOREIGN KEY (' + qi(fc) + ') REFERENCES ' + fv);
        }
      } else if (Array.isArray(cons.foreign_key)) {
        for (const fe of cons.foreign_key) {
          if (!fe.columns || !fe.ref_table) continue;
          let c = '    FOREIGN KEY (' + fe.columns + ') REFERENCES ' + qi(schema) + '.' + fe.ref_table +
                  '(' + (fe.ref_columns || 'id') + ')';
          if (fe.ondelete) c += ' ON DELETE ' + fe.ondelete;
          if (fe.onupdate) c += ' ON UPDATE ' + fe.onupdate;
          if (fe.deferrable) c += ' ' + fe.deferrable;
          if (fe.initially) c += ' ' + fe.initially;
          constraintLines.push(c);
        }
      }
    }
    if (cons.check) {
      if (typeof cons.check === 'string') {
        constraintLines.push('    CHECK (' + cons.check + ')');
      } else if (typeof cons.check === 'object' && !Array.isArray(cons.check)) {
        for (const [ckn, ckv] of Object.entries(cons.check))
          constraintLines.push('    CONSTRAINT ' + qi(ckn) + ' CHECK (' + ckv + ')');
      } else if (Array.isArray(cons.check)) {
        for (const ce of cons.check) {
          if (typeof ce === 'string') constraintLines.push('    CHECK (' + ce + ')');
          else if (ce.name && ce.expression) constraintLines.push('    CONSTRAINT ' + qi(ce.name) + ' CHECK (' + ce.expression + ')');
        }
      }
    }
    if (cons.exclude && typeof cons.exclude === 'object' && !Array.isArray(cons.exclude)) {
      for (const [exn, exv] of Object.entries(cons.exclude)) {
        const using = exv.using || 'GIST';
        const elems = (exv.elems || []).map((el, i) => {
          if (typeof el === 'object') return el.column + ' WITH ' + el.with;
          return String(el);
        }).join(', ');
        constraintLines.push('    CONSTRAINT ' + qi(exn) + ' EXCLUDE USING ' + using + ' (' + elems + ')' +
                             (exv.where ? ' WHERE (' + exv.where + ')' : ''));
      }
    }
  }
  if (constraintLines.length) bodyParts.push(...constraintLines);
  L.push(bodyParts.join(',\n'));

  if (inherit && typeof inherit === 'string') {
    L.push(') INHERITS (' + qi(schema) + '.' + qi(inherit) + ');');
    if (deferredPk) L.push('ALTER TABLE ' + qi(schema) + '.' + qi(tname) + ' ADD PRIMARY KEY (' + deferredPk + ');');
  } else {
    L.push(');');
    if (deferredPk) L.push('ALTER TABLE ' + qi(schema) + '.' + qi(tname) + ' ADD PRIMARY KEY (' + deferredPk + ');');
  }

  /* partition note */
  if (td.partition && typeof td.partition === 'object') {
    L.push('-- ' + qi(schema) + '.' + qi(tname) + ' designed to be partitioned by ' +
           td.partition.by + ' (' + td.partition.column + ')');
  }

  /* storage / tablespace */
  if (topts) {
    if (topts.with) L.push('ALTER TABLE ' + qi(schema) + '.' + qi(tname) + ' SET (' + topts.with + ');');
    if (topts.tablespace) L.push('ALTER TABLE ' + qi(schema) + '.' + qi(tname) + ' SET TABLESPACE ' + qi(topts.tablespace) + ';');
  }

  /* indexes */
  if (indexes && typeof indexes === 'object') {
    for (const [iname, iv] of Object.entries(indexes)) {
      let ix = '';
      if (typeof iv === 'string') {
        ix = 'CREATE INDEX ' + qi(iname) + ' ON ' + qi(schema) + '.' + qi(tname) + ' (' + iv + ')';
      } else if (typeof iv === 'object') {
        ix = 'CREATE ' + (iv.unique ? 'UNIQUE ' : '') + 'INDEX ' +
             (iv.concurrently ? 'CONCURRENTLY ' : '') + qi(iname) +
             ' ON ' + qi(schema) + '.' + qi(tname) + ' ' +
             (iv.type ? 'USING ' + iv.type + ' ' : '') + '(' + (iv.columns || '???') + ')' +
             (iv.include ? ' INCLUDE (' + iv.include + ')' : '') +
             (iv.where ? ' WHERE (' + iv.where + ')' : '') +
             (iv.tablespace ? ' TABLESPACE ' + qi(iv.tablespace) : '');
      }
      if (ix) L.push(ix + ';');
    }
  }

  /* triggers */
  if (triggers && Array.isArray(triggers)) {
    for (const tt of triggers) {
      if (!tt.name || !tt.event || !tt.function) continue;
      let tr = 'CREATE TRIGGER ' + qi(tt.name) + '\n    ' +
               (tt.timing ? tt.timing + ' ' : '') + tt.event +
               ' ON ' + qi(schema) + '.' + qi(tname) + '\n';
      if (tt.when) tr += '    ' + tt.when + '\n';
      tr += '    FOR EACH ' + (tt.for_each_row === false ? 'STATEMENT' : 'ROW') + '\n';
      if (tt.condition) tr += '    WHEN (' + tt.condition + ')\n';
      let fn = String(tt.function).replace(/\(\)\s*$/, '');
      tr += '    EXECUTE FUNCTION ' + fn + (tt.args ? '(' + tt.args + ')' : '()') + ';';
      L.push(tr);
      if (tt.comment) L.push("COMMENT ON TRIGGER " + qi(tt.name) + " ON " + qi(schema) + "." + qi(tname) +
                             " IS '" + esc(tt.comment) + "';");
    }
  }

  /* row-level security */
  if (td.row_security === true) {
    L.push('ALTER TABLE ' + qi(schema) + '.' + qi(tname) + ' ENABLE ROW LEVEL SECURITY;');
  }
  if (policies && Array.isArray(policies)) {
    for (const pp of policies) {
      if (!pp.name) continue;
      let p = 'CREATE POLICY ' + qi(pp.name) + '\n    ON ' + qi(schema) + '.' + qi(tname) + '\n';
      if (pp.command) p += '    FOR ' + pp.command + '\n';
      if (pp.role) p += '    TO ' + pp.role + '\n';
      if (pp.using) p += '    USING (' + pp.using + ')\n';
      if (pp.check) p += '    WITH CHECK (' + pp.check + ')\n';
      L.push(p.trim() + ';');
    }
  }

  /* comments */
  if (comments && typeof comments === 'object') {
    if (comments.table) L.push("COMMENT ON TABLE " + qi(schema) + "." + qi(tname) + " IS '" + esc(comments.table) + "';");
    for (const [cc, cv] of Object.entries(comments)) {
      if (cc !== 'table' && typeof cv === 'string')
        L.push("COMMENT ON COLUMN " + qi(schema) + "." + qi(tname) + "." + qi(cc) + " IS '" + esc(cv) + "';");
    }
  }

  return { sql: L.join('\n'), entries, columns, comments };
}

/* ---------- suggestions ---------- */

function typeUpper(t) { return String(t).toUpperCase().replace(/\[\]$/, ''); }

function sampleValue(colName, def, enums, schemaName) {
  const T = typeUpper(def.type);
  if (def.generated) return null;
  if (def.file_type) return "'/uploads/sample'";
  if (T === 'UUID') return 'gen_random_uuid()';
  if (T === 'SERIAL' || T === 'BIGSERIAL' || T === 'SMALLSERIAL' || def.identity_type) return 'DEFAULT';
  if (['INT','INTEGER','BIGINT','SMALLINT','OID'].includes(T)) return '1';
  if (['REAL','DOUBLE PRECISION','FLOAT4','FLOAT8','FLOAT'].includes(T)) return '1.5';
  if (['NUMERIC','DECIMAL'].includes(T)) return '10.00';
  if (T === 'MONEY') return '10.00';
  if (T === 'BOOLEAN' || T === 'BOOL') return 'true';
  if (T === 'DATE') return 'CURRENT_DATE';
  if (['TIMESTAMP','TIMESTAMPTZ','DATETIME'].includes(T)) return 'NOW()';
  if (T === 'TIME' || T === 'TIMETZ') return 'CURRENT_TIME';
  if (T === 'INTERVAL') return "'1 day'";
  if (T === 'JSONB') return "'{}'::jsonb";
  if (T === 'JSON') return "'{}'";
  if (T === 'XML') return "'<tag/>'::xml";
  if (T === 'INET') return "'192.168.1.1'";
  if (T === 'CIDR') return "'192.168.1.0/24'";
  if (T === 'MACADDR' || T === 'MACADDR8') return "'00:00:00:00:00:00'";
  if (T === 'BYTEA') return "'\\x00'::bytea";
  if (T === 'POINT') return "POINT(1,2)";
  if (T === 'BOX') return "BOX('(0,0)','(1,1)')";
  if (T === 'CIRCLE') return "CIRCLE('(0,0)',1)";
  if (T === 'POLYGON' || T === 'PATH') return "'((0,0),(1,0),(1,1))'";
  if (T === 'LINE' || T === 'LSEG') return "'(0,0),(1,1)'";
  if (T === 'TSVECTOR') return "'sample'::tsvector";
  if (T === 'TSQUERY') return "'sample'::tsquery";
  if (T.endsWith('RANGE')) return "'[1,10)'";
  if (T.startsWith('BIT')) return "B'0'";
  if (T === 'CITEXT' || T === 'TEXT' || T.startsWith('VARCHAR') || T.startsWith('CHAR')) return "'sample'";
  if (['FILE','IMAGE','PDF','DOCUMENT','VIDEO','AUDIO'].includes(T)) return "'/uploads/sample'";
  /* enum or domain — look up first enum value */
  if (enums && enums[def.type] && Array.isArray(enums[def.type]) && enums[def.type].length)
    return "'" + enums[def.type][0] + "'";
  return "'sample'";
}

function buildSuggestions(root) {
  const items = []; // {icon, title, desc, code}
  const tables = root.tables || root.table || {};
  const enums = root.types || {};
  const schema = root.schema || 'public';

  const tablesList = Object.entries(tables).filter(([, td]) => td && typeof td === 'object' && td.columns);

  /* 1 — usage snippets per table */
  for (const [tname, td] of tablesList) {
    const cols = Object.entries(td.columns).filter(([, c]) => {
      if (typeof c === 'object') return true;
      return !String(c).startsWith('Generated(');
    });
    const ins = [];
    const vals = [];
    for (const [cname, cdef] of cols) {
      const def = typeof cdef === 'string' ? parseColStr(cdef) : parseColObj(cdef || {});
      if (def.generated || def.identity_type) continue;
      const sv = sampleValue(cname, def, enums, schema);
      if (sv === null) continue;
      ins.push(qi(cname));
      vals.push(sv === 'DEFAULT' ? 'DEFAULT' : sv);
    }
    if (ins.length) {
      items.push({
        kind: 'usage',
        title: 'Insert a row into ' + qi(tname),
        desc: 'Minimal INSERT with representative values.',
        code: 'INSERT INTO ' + qi(schema) + '.' + qi(tname) + '\n  (' + ins.join(', ') + ')\nVALUES\n  (' + vals.join(', ') + ')\nRETURNING *;'
      });
    }
    items.push({
      kind: 'usage',
      title: 'Query ' + qi(tname),
      desc: 'A sensible default read query.',
      code: 'SELECT * FROM ' + qi(schema) + '.' + qi(tname) + '\nORDER BY 1\nLIMIT 50;'
    });
  }

  /* 2 — automatic joins for tables with FKs */
  for (const [tname, td] of tablesList) {
    const cons = td.constraints || {};
    const fks = [];
    if (typeof cons.foreign_key === 'object' && !Array.isArray(cons.foreign_key))
      for (const [fc] of Object.entries(cons.foreign_key)) fks.push([fc, null]);
    if (Array.isArray(cons.foreign_key))
      for (const fe of cons.foreign_key) fks.push([fe.columns, fe.ref_table]);
    for (const [cname, refTable] of fks) {
      const t = refTable || guessRefTable(tables, td, cname);
      if (!t) continue;
      items.push({
        kind: 'usage',
        title: 'Join ' + qi(tname) + ' → ' + qi(t) + ' on ' + qi(cname),
        desc: 'Typical JOIN across the foreign key.',
        code: 'SELECT ' + qi(t) + '.*, ' + qi(tname) + '.*\nFROM ' + qi(schema) + '.' + qi(tname) + '\nJOIN ' + qi(schema) + '.' + qi(t) + '\n  ON ' + qi(tname) + '.' + qi(cname) + ' = ' + qi(t) + '.id\nLIMIT 50;'
      });
    }
  }

  /* 3 — best-practice tips */
  const tips = [];
  for (const [tname, td] of tablesList) {
    const cols = Object.entries(td.columns);
    const colDefs = cols.map(([n, c]) => [n, typeof c === 'string' ? parseColStr(c) : parseColObj(c || {})]);
    const fkCols = colDefs.filter(([, d]) => d.is_foreign).map(([n]) => n);
    const cons = td.constraints || {};
    if (Array.isArray(cons.foreign_key)) {
      for (const fe of cons.foreign_key) if (fe.columns) fkCols.push(fe.columns.split(',').map(s => s.trim()));
    } else if (typeof cons.foreign_key === 'object') {
      fkCols.push(...Object.keys(cons.foreign_key));
    }
    const flat = fkCols.flat();
    const hasIndexes = td.indexes && Object.keys(td.indexes).length;
    const indexed = hasIndexes ? Object.values(td.indexes).map(v => typeof v === 'string' ? v : v.columns).join(',') : '';
    for (const fc of flat) {
      if (!indexed.includes(fc) && fc !== 'id')
        tips.push({ table: tname, tip: 'Index foreign key column ' + qi(fc) + ' on ' + qi(tname) +
                    ' — FK lookups are much faster with an index.',
                    code: 'CREATE INDEX idx_' + tname.toLowerCase() + '_' + fc.toLowerCase() + '\n  ON ' + qi(schema) + '.' + qi(tname) + ' (' + qi(fc) + ');' });
    }
    const hasUpdated = colDefs.some(([n]) => n === 'updated_at');
    const hasTrigger = td.triggers && td.triggers.some(t => t.event && /UPDATE/.test(t.event));
    if (hasUpdated && !hasTrigger)
      tips.push({ table: tname, tip: 'Add a trigger to auto-maintain updated_at on ' + qi(tname) + '.',
                  code: "CREATE OR REPLACE FUNCTION set_updated_at()\nRETURNS TRIGGER AS $$\nBEGIN\n  NEW.updated_at = NOW();\n  RETURN NEW;\nEND;\n$$ LANGUAGE plpgsql;\n\nCREATE TRIGGER trg_" + tname.toLowerCase() + "_updated\n  BEFORE UPDATE ON " + qi(schema) + "." + qi(tname) + "\n  FOR EACH ROW EXECUTE FUNCTION set_updated_at();" });
    const hasCreated = colDefs.some(([n]) => n === 'created_at');
    if (hasCreated && !colDefs.find(([, d]) => d.type === 'TIMESTAMPTZ' || d.type === 'TIMESTAMP') )
      tips.push({ table: tname, tip: 'Give created_at on ' + qi(tname) + ' a default of NOW().',
                  code: 'ALTER TABLE ' + qi(schema) + '.' + qi(tname) + '\n  ALTER COLUMN created_at SET DEFAULT NOW();' });
    if (!td.constraints && !colDefs.some(([, d]) => d.primary_key))
      tips.push({ table: tname, tip: qi(tname) + ' has no primary key.',
                  code: 'ALTER TABLE ' + qi(schema) + '.' + qi(tname) + ' ADD PRIMARY KEY (id);' });
  }
  for (const t of tips) {
    items.push({ kind: 'tip', title: 'Recommendation — ' + t.table, desc: t.tip, code: t.code });
  }

  /* 4 — migration footer */
  items.push({
    kind: 'usage',
    title: 'Apply the migration',
    desc: 'Run the generated file against your database.',
    code: 'psql -U your_user -d your_db -f autoschema.sql'
  });

  return items;
}

function guessRefTable(tables, td, cname) {
  /* naive: singularize last part after '_' or '_id' */
  const m = cname.replace(/_id$/, '').replace(/^id_/, '');
  for (const t of Object.keys(tables)) {
    if (t.toLowerCase() === m.toLowerCase()) return t;
    if (t.toLowerCase() === m.toLowerCase() + 's') return t;
  }
  return null;
}

/* ---------- top-level generator ---------- */

function generateSchema(root) {
  const lines = [];
  const database = root.database || 'postgresql';
  const schema = root.schema || 'public';
  const roles = root.roles, extensions = root.extensions, sequences = root.sequences,
        enums = root.types, domains = root.domains, tables = root.tables || root.table,
        views = root.views, matviews = root.materialized_views, functions = root.functions;

  lines.push('-- ===============================================================');
  lines.push('-- AutoSchema Studio — Generated DDL for database: ' + database + ' (schema: ' + schema + ')');
  lines.push('-- ===============================================================');
  lines.push('');
  lines.push('CREATE SCHEMA IF NOT EXISTS ' + qi(schema) + ';');
  lines.push('');

  /* roles */
  if (roles && Array.isArray(roles)) {
    lines.push('-- Roles');
    for (const r of roles) {
      const rname = typeof r === 'string' ? r : r.name;
      if (!rname) continue;
      let s = "DO $do$ BEGIN\n    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '" +
              rname.replace(/'/g, "''") + "') THEN\n        CREATE ROLE " + qi(rname);
      if (typeof r === 'object') {
        if (r.login) s += ' LOGIN';
        if (r.superuser) s += ' SUPERUSER';
        if (r.createdb) s += ' CREATEDB';
        if (r.createrole) s += ' CREATEROLE';
        if (r.password) s += ' PASSWORD ' + r.password;
      }
      s += ';\n    END IF;\nEND $do$;';
      lines.push(s);
    }
    lines.push('');
  }

  /* extensions */
  if (extensions && Array.isArray(extensions)) {
    lines.push('-- Extensions');
    for (const ext of extensions) {
      let en = ext, es = null, ec = true;
      if (typeof ext === 'object') { en = ext.name; es = ext.schema; ec = ext.cascade !== false; }
      if (!en) continue;
      let s = 'CREATE EXTENSION IF NOT EXISTS ' + qi(en);
      if (es) s += ' SCHEMA ' + qi(es);
      if (ec) s += ' CASCADE';
      lines.push(s + ';');
    }
    lines.push('');
  }

  /* sequences */
  if (sequences && typeof sequences === 'object') {
    lines.push('-- Sequences');
    for (const [sn, sv] of Object.entries(sequences)) {
      if (typeof sv !== 'object') continue;
      let s = 'CREATE SEQUENCE IF NOT EXISTS ' + qi(schema) + '.' + qi(sn);
      if (sv.start !== undefined) s += ' START ' + sv.start;
      if (sv.increment !== undefined) s += ' INCREMENT ' + sv.increment;
      if (sv.minvalue !== undefined) s += ' MINVALUE ' + sv.minvalue;
      if (sv.maxvalue !== undefined) s += ' MAXVALUE ' + sv.maxvalue;
      if (sv.cycle) s += ' CYCLE';
      lines.push(s + ';');
    }
    lines.push('');
  }

  /* enums */
  if (enums && typeof enums === 'object') {
    lines.push('-- Custom ENUM types');
    for (const [tn, tv] of Object.entries(enums)) {
      if (!Array.isArray(tv)) continue;
      lines.push('CREATE TYPE ' + qi(schema) + '.' + qi(tn) + ' AS ENUM (' +
                 tv.map(v => "'" + String(v).replace(/'/g, "''") + "'").join(', ') + ');');
    }
    lines.push('');
  }

  /* domains */
  if (domains && typeof domains === 'object') {
    lines.push('-- Custom Domains');
    for (const [dn, dv] of Object.entries(domains)) {
      if (typeof dv !== 'object' || !dv.type) continue;
      let s = 'CREATE DOMAIN ' + qi(schema) + '.' + qi(dn) + ' AS ' + dv.type;
      if (dv.collation) s += ' COLLATE ' + dv.collation;
      if (dv.default) s += ' DEFAULT ' + dv.default;
      if (dv.notnull) s += ' NOT NULL';
      if (dv.check) s += ' CHECK (' + dv.check + ')';
      lines.push(s + ';');
      if (dv.comment) lines.push("COMMENT ON DOMAIN " + qi(schema) + "." + qi(dn) + " IS '" + esc(dv.comment) + "';");
    }
    lines.push('');
  }

  /* functions marked before_tables (trigger functions etc.) */
  if (functions && Array.isArray(functions)) {
    const before = functions.filter(f => f && f.before_tables);
    if (before.length) {
      lines.push('-- Functions (before tables)');
      for (const f of before) lines.push(printFunction(schema, f));
      lines.push('');
    }
  }

  /* tables */
  if (tables && typeof tables === 'object') {
    lines.push('-- Tables');
    lines.push('');
    for (const [tn, td] of Object.entries(tables)) {
      const res = generateTable(schema, tn, td || {});
      lines.push(res.sql);
      lines.push('');
    }
  }

  /* views */
  if (views && typeof views === 'object') {
    lines.push('-- Views');
    for (const [vn, vd] of Object.entries(views)) {
      const q = typeof vd === 'string' ? vd : vd.query;
      if (!q) continue;
      let s = 'CREATE VIEW ' + qi(schema) + '.' + qi(vn) + ' AS\n' + q;
      const co = typeof vd === 'object' ? vd.check_option : null;
      if (co) s += '\n WITH ' + ((co === 'LOCAL' || co === 'CASCADED') ? co + ' ' : '') + 'CHECK OPTION';
      lines.push(s + ';');
      lines.push('');
    }
  }

  /* materialized views */
  if (matviews && typeof matviews === 'object') {
    lines.push('-- Materialized Views');
    for (const [vn, vd] of Object.entries(matviews)) {
      if (!vd.query) continue;
      let s = 'CREATE MATERIALIZED VIEW IF NOT EXISTS ' + qi(schema) + '.' + qi(vn);
      if (vd.with) s += ' WITH (' + vd.with + ')';
      if (vd.tablespace) s += ' TABLESPACE ' + qi(vd.tablespace);
      s += ' AS\n' + vd.query + ';';
      lines.push(s);
      if (vd.index && typeof vd.index === 'object') {
        for (const [ixn, ixv] of Object.entries(vd.index)) {
          if (!ixv.columns) continue;
          lines.push('CREATE INDEX ' + qi(ixn) + ' ON ' + qi(schema) + '.' + qi(vn) + ' (' + ixv.columns + ')' +
                     (ixv.where ? ' WHERE (' + ixv.where + ')' : '') + ';');
        }
      }
      lines.push('');
    }
  }

  /* remaining functions */
  if (functions && Array.isArray(functions)) {
    const after = functions.filter(f => f && !f.before_tables);
    if (after.length) {
      lines.push('-- Functions');
      for (const f of after) lines.push(printFunction(schema, f));
      lines.push('');
    }
  }

  lines.push('-- ===============================================================');
  lines.push('-- End of AutoSchema Studio output');
  lines.push('-- ===============================================================');

  return lines.join('\n') + '\n';
}

function printFunction(schema, f) {
  const ft = f.type || 'FUNCTION';
  let s = 'CREATE ' + ft + ' ' + qi(schema) + '.' + qi(f.name) + ' (' + (f.args || '') + ')\n';
  if (f.returns) s += '    RETURNS ' + f.returns + '\n';
  if (f.language) s += '    LANGUAGE ' + f.language + '\n';
  if (f.behavior) s += '    ' + f.behavior + '\n';
  if (f.security_definer) s += '    SECURITY DEFINER\n';
  s += '    AS $$\n' + (f.body || '') + '\n    $$;';
  return s;
}

/* stats for the UI */
function schemaStats(root) {
  const tables = root.tables || root.table || {};
  let tablesCount = 0, columns = 0, indexes = 0, fks = 0, triggers = 0, policies = 0, enums = 0, domains = 0;
  enums = Object.keys(root.types || {}).length;
  domains = Object.keys(root.domains || {}).length;
  for (const [, td] of Object.entries(tables)) {
    if (!td || typeof td !== 'object') continue;
    if (td.columns) { tablesCount++; columns += Object.keys(td.columns).length; }
    if (td.indexes) indexes += Object.keys(td.indexes).length;
    if (td.triggers) triggers += td.triggers.length;
    if (td.policies) policies += td.policies.length;
    const c = td.constraints || {};
    if (typeof c.foreign_key === 'object') fks += Array.isArray(c.foreign_key) ? c.foreign_key.length : Object.keys(c.foreign_key).length;
    for (const [, col] of Object.entries(td.columns || {})) {
      const d = typeof col === 'string' ? parseColStr(col) : parseColObj(col || {});
      if (d.is_foreign) fks++;
    }
  }
  return { tablesCount, columns, indexes, fks, triggers, policies, enums, domains,
           views: Object.keys(root.views || {}).length,
           matviews: Object.keys(root.materialized_views || {}).length };
}

/* ---------- module export (for node testing) ---------- */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { generateSchema, buildSuggestions, schemaStats, mapType, parseColStr, parseColObj, qi };
}
