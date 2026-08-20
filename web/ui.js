/* =====================================================================
   AutoSchema Studio — UI logic (no dependencies)
   ===================================================================== */

/* ---------- presets ---------- */
const FULL_SCHEMA = JSON.stringify(__FULL_SCHEMA__);

const PRESETS = {
  full: { label: 'Full feature demo',  value: FULL_SCHEMA },
  blog: { label: 'Blog · minimal', value: JSON.stringify({
    database: 'postgresql', schema: 'public',
    extensions: ['pgcrypto', 'citext', 'pg_trgm'],
    types: { post_status: ['draft', 'published', 'archived'] },
    tables: {
      authors: {
        columns: {
          id: { type: 'UUID', default: 'gen_random_uuid()', primary_key: true },
          name: { type: 'CITEXT', notnull: true },
          email: { type: 'VARCHAR(255)', unique: true },
          bio: { type: 'TEXT' },
          created_at: { type: 'TIMESTAMPTZ', default: 'NOW()', notnull: true }
        },
        indexes: { idx_authors_name: { columns: 'name', type: 'BTREE' } },
        comments: { table: 'Blog authors' }
      },
      posts: {
        columns: {
          id: { type: 'BIGSERIAL', primary_key: true },
          author_id: { type: 'UUID', references: { table: 'authors', column: 'id', ondelete: 'CASCADE' } },
          title: { type: 'VARCHAR(200)', notnull: true },
          slug: { type: 'VARCHAR(220)', notnull: true, unique: true },
          body: { type: 'TEXT' },
          status: { type: 'post_status', default: "'draft'" },
          tags: { type: 'TEXT[]', default: "'{}'" },
          views: { type: 'BIGINT', default: '0' },
          published_at: { type: 'TIMESTAMPTZ' }
        },
        indexes: {
          idx_posts_author: { columns: 'author_id' },
          idx_posts_status: { columns: 'status, published_at DESC', where: "status = 'published'" },
          idx_posts_body: { columns: 'body gin_trgm_ops', type: 'GIN' }
        },
        comments: { table: 'Blog posts' }
      },
      comments: {
        columns: {
          id: { type: 'BIGSERIAL', primary_key: true },
          post_id: { type: 'BIGINT', references: { table: 'posts', column: 'id', ondelete: 'CASCADE' } },
          author_name: { type: 'VARCHAR(100)' },
          content: { type: 'TEXT', notnull: true },
          created_at: { type: 'TIMESTAMPTZ', default: 'NOW()' }
        },
        indexes: { idx_comments_post: { columns: 'post_id' } },
        comments: { table: 'Post comments' }
      }
    },
    views: {
      v_published_posts: {
        query: "SELECT p.title, p.slug, a.name AS author, p.published_at\nFROM posts p\nJOIN authors a ON a.id = p.author_id\nWHERE p.status = 'published'"
      }
    }
  }, null, 2) },

  ecom: { label: 'E-commerce · products', value: JSON.stringify({
    database: 'postgresql', schema: 'public',
    types: { order_status: ['pending', 'paid', 'shipped', 'cancelled'] },
    sequences: { order_seq: { start: 1000, increment: 1 } },
    tables: {
      categories: {
        columns: {
          id: { type: 'INTEGER', identity: { type: 'ALWAYS', start: 1 }, primary_key: true },
          name: { type: 'VARCHAR(100)', notnull: true, unique: true }
        },
        comments: { table: 'Product categories' }
      },
      products: {
        columns: {
          id: { type: 'BIGSERIAL', primary_key: true },
          category_id: { type: 'INTEGER', references: { table: 'categories', column: 'id', ondelete: 'RESTRICT' } },
          name: { type: 'VARCHAR(200)', notnull: true },
          sku: { type: 'VARCHAR(50)', notnull: true, unique: true },
          price: { type: 'NUMERIC(10,2)', notnull: true, check: 'price >= 0' },
          stock: { type: 'INTEGER', default: '0', check: 'stock >= 0' },
          active: { type: 'BOOLEAN', default: 'true' },
          photo: { type: 'Image' },
          tags: { type: 'TEXT[]', default: "'{}'" },
          created_at: { type: 'TIMESTAMPTZ', default: 'NOW()' }
        },
        indexes: {
          idx_products_cat: { columns: 'category_id' },
          idx_products_name: 'name',
          idx_products_active_sku: { unique: true, columns: 'sku', where: 'active' }
        },
        comments: { table: 'Product catalog' }
      },
      orders: {
        columns: {
          id: { type: 'BIGSERIAL', primary_key: true },
          number: { type: 'VARCHAR(30)', default: "nextval('order_seq')::text", notnull: true },
          status: { type: 'order_status', default: "'pending'" },
          total: { type: 'NUMERIC(12,2)', default: '0', check: 'total >= 0' },
          placed_at: { type: 'TIMESTAMPTZ', default: 'NOW()' }
        },
        indexes: { idx_orders_status: { columns: 'status' } },
        comments: { table: 'Customer orders' }
      },
      order_items: {
        columns: {
          id: { type: 'BIGSERIAL', primary_key: true },
          order_id: { type: 'BIGINT' },
          product_id: { type: 'BIGINT' },
          qty: { type: 'INTEGER', default: '1', check: 'qty > 0' },
          unit_price: { type: 'NUMERIC(10,2)', notnull: true },
          line_total: { type: 'NUMERIC(12,2)', generated: 'ALWAYS AS (qty * unit_price) STORED' }
        },
        constraints: {
          unique: { uq_order_product: ['order_id', 'product_id'] },
          foreign_key: [
            { columns: 'order_id', ref_table: 'orders', ondelete: 'CASCADE' },
            { columns: 'product_id', ref_table: 'products', ondelete: 'RESTRICT' }
          ]
        },
        indexes: { idx_oi_order: 'order_id', idx_oi_product: 'product_id' },
        comments: { table: 'Order line items' }
      }
    }
  }, null, 2) },

  legacy: { label: 'Legacy v1 · string format', value: JSON.stringify({
    database: 'postgresql', schema: 'public',
    types: { status: ['active', 'inactive', 'pending'] },
    table: {
      website_info: {
        columns: {
          id: 'Serial',
          name: 'Char(50,notnull)',
          email: 'Char(50,unique)',
          status: "status DEFAULT 'active'",
          created_at: 'DateTime',
          tags: 'Text[]',
          metadata: 'Jsonb',
          visits: 'BigInt DEFAULT 0',
          full_name: "Generated(name || ' Website')",
          logo_file: 'File',
          banner_image: 'Image'
        },
        constraints: { primary_key: ['id'], check: 'visits >= 0' },
        indexes: { idx_email: 'email' },
        comments: { table: 'Website info', name: 'Site name' }
      },
      address: {
        columns: {
          id: 'Serial',
          web: 'Foreign(website_info) ON DELETE CASCADE',
          village: 'Char(50)',
          road: 'Char(50,notnull)'
        },
        constraints: { primary_key: ['id'] },
        comments: { table: 'Addresses linked to websites' }
      }
    }
  }, null, 2) }
};

/* ---------- helpers ---------- */

const $ = id => document.getElementById(id);

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const SQL_KEYWORDS = new Set(`
select insert update delete from where group by order limit offset having join inner left right full outer cross on as
and or not null is true false in exists any all between like ilike distinct union except intersect with
create table index unique primary key foreign references column constraint check exclude default generated always
stored identity start increment minvalue maxvalue cycle sequence type enum domain extension view materialized
trigger function procedure returns language plpgsql sql volatile stable immutable security definer cascade
restrict set no action deferrable initially deferred immediate unlogged temporary temp alter add drop rename to
comment tablespace using btree hash gin gist brin include concurrently where if begin end do case when then else
row level security enable policy to current_setting over partition interval date time timestamp timestamptz
numeric decimal varchar char text boolean bigint smallint integer serial bigserial smallserial real double
precision bytea uuid json jsonb xml inet cidr macaddr money point line lseg box path polygon circle tsvector
tsquery int4range int8range numrange tsrange tstzrange daterange bit varying current_timestamp now current_date
current_time nextval gen_random_uuid coalesce count sum avg min max substring length lower upper trim replace
formatting refresh concurrently vacuum analyze
`.trim().split(/\s+/));

function hlSQL(sql) {
  const re = /(--[^\n]*)|('(?:[^']|'')*')|("(?:[^"]|"")*")|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][A-Za-z0-9_]*)|(\S)/g;
  let out = '', last = 0, m;
  while ((m = re.exec(sql))) {
    out += escapeHtml(sql.slice(last, m.index));
    const all = m[0], cm = m[1], str = m[2], idq = m[3], num = m[4], word = m[5];
    if (cm) out += '<span class="tok-cm">' + escapeHtml(cm) + '</span>';
    else if (str) out += '<span class="tok-str">' + escapeHtml(str) + '</span>';
    else if (idq) out += '<span class="tok-cte">' + escapeHtml(idq) + '</span>';
    else if (num) out += '<span class="tok-num">' + num + '</span>';
    else if (word) out += SQL_KEYWORDS.has(word.toUpperCase()) ? '<span class="tok-kw">' + word + '</span>' : word;
    else out += '<span class="tok-op">' + escapeHtml(all) + '</span>';
    last = re.lastIndex;
  }
  out += escapeHtml(sql.slice(last));
  return out;
}

let toastTimer = null;
function toast(msg, kind) {
  const t = $('toast');
  t.className = 'show ' + (kind || '');
  t.querySelector('.t-ico').textContent = kind === 'err' ? '⚠' : kind === 'ok' ? '✓' : '•';
  t.querySelector('.t-msg').textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = ''; }, 2400);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (e2) { return false; }
  }
}

/* ---------- editor ---------- */

const editor = $('editor');
const gutter = $('gutter');
const jsonDot = $('json-dot');
const jsonLabel = $('json-label');

function renderLines() {
  const n = editor.value.split('\n').length;
  let html = '';
  for (let i = 1; i <= n; i++) html += '<div>' + i + '</div>';
  gutter.innerHTML = html;
}

function syncScroll() { gutter.scrollTop = editor.scrollTop; }

editor.addEventListener('input', () => {
  renderLines();
  validateJSON();
  clearTimeout(complTimer);
  complTimer = setTimeout(runCompliance, 300);
});

editor.addEventListener('scroll', syncScroll);
editor.addEventListener('keydown', e => {
  if (e.key === 'Tab') {
    e.preventDefault();
    const s = editor.selectionStart, en = editor.selectionEnd;
    editor.value = editor.value.slice(0, s) + '    ' + editor.value.slice(en);
    editor.selectionStart = editor.selectionEnd = s + 4;
    renderLines(); validateJSON();
  }
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); run(); }
});

let jsonValid = true;

function validateJSON() {
  const err = $('editor-err');
  try {
    JSON.parse(editor.value);
    jsonValid = true;
    err.classList.remove('show');
    updateJsonDot();
    return true;
  } catch (e) {
    jsonValid = false;
    const pos = parseJSONError(e.message);
    err.textContent = '⚠ ' + e.message + (pos ? '  (line ' + pos.line + ', col ' + pos.col + ')' : '');
    err.classList.add('show');
    updateJsonDot();
    return false;
  }
}

/* ---------- compliance ---------- */

let complianceIssues = [];
let complTimer = null;

function runCompliance() {
  let issues;
  try {
    JSON.parse(editor.value);
    issues = lintText(editor.value);
  } catch (e) {
    issues = [{ severity: 'error', path: '', message: 'Invalid JSON — ' + e.message, fix: null, snippet: '' }];
  }
  complianceIssues = issues;
  renderCompliance();
  updateJsonDot();
}

function updateJsonDot() {
  if (!jsonValid) {
    jsonDot.className = 'dot err';
    jsonLabel.textContent = 'JSON error';
    return;
  }
  const errs = complianceIssues.filter(i => i.severity === 'error').length;
  const warns = complianceIssues.filter(i => i.severity === 'warning').length;
  if (errs) {
    jsonDot.className = 'dot err';
    jsonLabel.textContent = errs + ' error' + (errs > 1 ? 's' : '');
  } else if (warns) {
    jsonDot.className = 'dot warn';
    jsonLabel.textContent = warns + ' warning' + (warns > 1 ? 's' : '');
  } else {
    jsonDot.className = 'dot ok';
    jsonLabel.textContent = 'compliant';
  }
}

function renderCompliance() {
  const errs = complianceIssues.filter(i => i.severity === 'error').length;
  const warns = complianceIssues.filter(i => i.severity === 'warning').length;
  $('tab-compl-count').textContent = complianceIssues.length;
  $('compl-summary').textContent =
    complianceIssues.length === 0 ? '✓ Schema is compliant' :
    (errs ? errs + ' error' + (errs > 1 ? 's' : '') : '') +
    (errs && warns ? ' · ' : '') +
    (warns ? warns + ' warning' + (warns > 1 ? 's' : '') : '');

  const fixable = complianceIssues.filter(i => i.fix).length;
  const btn = $('btn-fixall');
  btn.disabled = fixable === 0;
  btn.style.opacity = fixable ? '1' : '.45';

  const list = $('compl-list');
  if (!complianceIssues.length) {
    list.innerHTML = '<div class="empty"><div><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg><br>Your schema JSON matches the AutoSchema format.</div></div>';
    return;
  }
  list.innerHTML = complianceIssues.map((it, i) => `
    <div class="compl-card ${it.severity}">
      <div class="compl-ico">${it.severity === 'error' ? '⛔' : '⚠'}</div>
      <div class="compl-main">
        ${it.path ? '<div class="compl-path">' + escapeHtml(it.path) + '</div>' : ''}
        <div class="compl-msg">${escapeHtml(it.message)}</div>
        ${it.snippet ? '<div class="compl-snippet">' + escapeHtml(it.snippet) + '</div>' : ''}
      </div>
      <div class="compl-actions">
        ${it.fix ? '<button class="btn btn-fix" data-fix="' + i + '">Fix</button>' : ''}
        ${it.snippet ? '<button class="btn btn-icon" data-copy-snippet="' + i + '" title="Copy snippet"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>' : ''}
      </div>
    </div>`).join('');
}

function applyComplianceFix(idx) {
  const it = complianceIssues[idx];
  if (!it || !it.fix) return false;
  const before = editor.value;
  const after = applyFix(before, it.fix);
  if (after === before) { toast('Nothing to fix here', 'err'); return false; }
  editor.value = after;
  renderLines();
  validateJSON();
  runCompliance();
  if (jsonValid) run();
  toast('Fixed: ' + it.message.split('.')[0], 'ok');
  return true;
}

function autoFixAll() {
  const { text, rounds } = applyAllFixes(editor.value, complianceIssues);
  if (text === editor.value) { toast('No fixable issues', 'err'); return; }
  editor.value = text;
  renderLines();
  validateJSON();
  runCompliance();
  if (jsonValid) run();
  toast('Auto-fixed all issues (' + rounds + ' pass' + (rounds > 1 ? 'es' : '') + ')', 'ok');
}

function parseJSONError(msg) {
  let pos = null;
  const lm = msg.match(/line (\d+) column (\d+)/);
  if (lm) return { line: +lm[1], col: +lm[2] };
  const pm = msg.match(/position (\d+)/);
  if (pm) {
    const before = editor.value.slice(0, +pm[1]);
    const lines = before.split('\n');
    return { line: lines.length, col: lines[lines.length - 1].length + 1 };
  }
  return null;
}

/* ---------- output ---------- */

let lastSql = '';
let lastSuggestions = [];
let suggFilter = 'all';

function setPane(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.pane').forEach(p => p.classList.toggle('active', p.id === 'pane-' + name));
}

function renderSQL(sql) {
  lastSql = sql;
  $('sql-out').innerHTML = hlSQL(sql);
  $('tab-sql-count').textContent = sql.split('\n').length;
}

function renderSuggestions(items) {
  lastSuggestions = items;
  $('tab-sugg-count').textContent = items.length;
  const list = $('sugg-list');
  const filtered = items.filter(i => suggFilter === 'all' || i.kind === suggFilter);
  if (!filtered.length) {
    list.innerHTML = '<div class="empty">Nothing to suggest for this filter.</div>';
    return;
  }
  list.innerHTML = filtered.map((it, i) => `
    <div class="sugg-card">
      <div class="sugg-card-head">
        <span class="sugg-ico ${it.kind}">${it.kind === 'tip' ? '💡' : '⚡'}</span>
        <div style="min-width:0">
          <div class="sugg-title">${escapeHtml(it.title)}</div>
          <div class="sugg-desc">${escapeHtml(it.desc || '')}</div>
        </div>
        <div class="head-spacer"></div>
        <button class="btn btn-icon" data-copy="${i}" title="Copy code">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        </button>
      </div>
      <div class="sugg-body">
        <div class="sugg-code">${escapeHtml(it.code)}</div>
      </div>
    </div>`).join('');
}

function renderStats(root) {
  const s = schemaStats(root);
  const set = (id, v, cls) => { const el = $(id); el.innerHTML = v; el.className = 'c-acc ' + (cls || ''); };
  set('st-tables', s.tablesCount, '');
  set('st-columns', s.columns);
  set('st-indexes', s.indexes);
  set('st-fks', s.fks);
  set('st-triggers', s.triggers);
  set('st-policies', s.policies);
  set('st-enums', s.enums);
  set('st-domains', s.domains);
  set('st-views', s.views + s.matviews);
}

function run() {
  if (!validateJSON()) {
    toast('Fix the JSON errors before generating.', 'err');
    editor.focus();
    return;
  }
  try {
    const root = JSON.parse(editor.value);
    const sql = generateSchema(root);
    renderSQL(sql);
    renderSuggestions(buildSuggestions(root));
    renderStats(root);
    runCompliance();
    toast('Generated ' + sql.split('\n').length + ' lines of SQL', 'ok');
  } catch (e) {
    toast('Generation failed: ' + e.message, 'err');
    console.error(e);
  }
}

/* ---------- header actions ---------- */

function formatJSON() {
  try {
    editor.value = JSON.stringify(JSON.parse(editor.value), null, 2);
    renderLines(); validateJSON();
    toast('JSON formatted', 'ok');
  } catch (e) {
    toast('Cannot format: ' + e.message, 'err');
  }
}

function loadSample() {
  const sel = $('sample');
  const v = PRESETS[sel.value];
  if (!v) return;
  editor.value = prettyJson(v.value);
  renderLines(); validateJSON(); run();
}

function prettyJson(s) {
  try { return JSON.stringify(JSON.parse(s), null, 2); }
  catch (e) { return s; }
}

$('sample').addEventListener('change', loadSample);
$('btn-format').addEventListener('click', formatJSON);
$('btn-run').addEventListener('click', run);
$('btn-copy').addEventListener('click', async () => {
  if (!lastSql) return;
  (await copyText(lastSql)) ? toast('SQL copied to clipboard', 'ok') : toast('Copy failed', 'err');
});
$('btn-download').addEventListener('click', () => {
  if (!lastSql) return;
  const blob = new Blob([lastSql], { type: 'application/sql' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'autoschema.sql';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast('Downloaded autoschema.sql', 'ok');
});

/* tabs + filters */
document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => setPane(t.dataset.tab)));
document.querySelectorAll('.filter').forEach(f => f.addEventListener('click', () => {
  document.querySelectorAll('.filter').forEach(x => x.classList.toggle('active', x === f));
  suggFilter = f.dataset.filter;
  renderSuggestions(lastSuggestions);
}));

/* suggested code copy buttons (delegated) */
$('sugg-list').addEventListener('click', async e => {
  const btn = e.target.closest('[data-copy]');
  if (!btn) return;
  const item = lastSuggestions[+btn.dataset.copy];
  if (!item) return;
  (await copyText(item.code)) ? toast('Code copied', 'ok') : toast('Copy failed', 'err');
});

/* compliance actions (delegated) */
$('compl-list').addEventListener('click', async e => {
  const fixBtn = e.target.closest('[data-fix]');
  if (fixBtn) { applyComplianceFix(+fixBtn.dataset.fix); return; }
  const cpBtn = e.target.closest('[data-copy-snippet]');
  if (cpBtn) {
    const item = complianceIssues[+cpBtn.dataset.copySnippet];
    if (item && item.snippet) {
      (await copyText(item.snippet)) ? toast('Snippet copied', 'ok') : toast('Copy failed', 'err');
    }
  }
});
$('btn-fixall').addEventListener('click', autoFixAll);

/* ---------- boot ---------- */

editor.value = prettyJson(PRESETS.full.value);
renderLines();
validateJSON();
run();
