# AutoSchema

**AutoSchema v2** generates complete PostgreSQL DDL from a JSON schema file (`schema.json`). It covers nearly every PostgreSQL feature — from simple `VARCHAR` columns to partitioning, inheritance, row-level security, and triggers — so your schema definition stays in one readable JSON file.

## Features

### Object types generated
| Category | Details |
|---|---|
| **Roles** | `CREATE ROLE` with `LOGIN`, `SUPERUSER`, `CREATEDB`, `CREATEROLE`, `PASSWORD` (idempotent `DO` block) |
| **Extensions** | `pgcrypto`, `citext`, `btree_gist`, `uuid-ossp`, … with optional `SCHEMA` / `CASCADE` |
| **Sequences** | `START`, `INCREMENT`, `MINVALUE`, `MAXVALUE`, `CYCLE` |
| **Enums** | `CREATE TYPE … AS ENUM` |
| **Domains** | Typed domains with `DEFAULT`, `COLLATE`, `NOT NULL`, `CHECK`, `COMMENT` |
| **Tables** | Regular, `UNLOGGED`, `TEMPORARY`, `LIKE`, inheritance, storage params, tablespace |
| **Views** | With optional `WITH [ LOCAL | CASCADED ] CHECK OPTION` |
| **Materialized views** | With storage params, tablespace, and indexes |
| **Functions/Procedures** | `LANGUAGE`, `RETURNS`, behavior (`IMMUTABLE`/`STABLE`/`VOLATILE`), `SECURITY DEFINER`, dollar-quoted bodies; `before_tables` flag for trigger functions |
| **Triggers** | `BEFORE`/`AFTER`/`INSTEAD OF`, `FOR EACH ROW/STATEMENT`, `WHEN`, args, comments |
| **Row-Level Security** | `ENABLE ROW LEVEL SECURITY` + `CREATE POLICY` with `FOR`, `TO`, `USING`, `WITH CHECK` |

### Data types
`INT`, `INTEGER`, `BIGINT`, `SMALLINT`, `SERIAL`, `BIGSERIAL`, `SMALLSERIAL`, `BOOLEAN`, `REAL`, `FLOAT4`, `FLOAT8`, `DOUBLE PRECISION`, `FLOAT`, `MONEY`, `NUMERIC(p,s)`, `DECIMAL(p,s)`, `TEXT`, `CITEXT`, `VARCHAR(n)`, `CHAR(n)`, `BYTEA`, `DATE`, `TIME`, `TIMETZ`, `TIMESTAMP`, `TIMESTAMPTZ`, `DATETIME`, `INTERVAL`, `INET`, `CIDR`, `MACADDR`, `MACADDR8`, `UUID`, `XML`, `JSON`, `JSONB`, `POINT`, `LINE`, `LSEG`, `BOX`, `PATH`, `POLYGON`, `CIRCLE`, `TSVECTOR`, `TSQUERY`, `INT4RANGE`, `INT8RANGE`, `NUMRANGE`, `TSRANGE`, `TSTZRANGE`, `DATERANGE`, `BIT(n)`, `OID`, object identifier types (`REGCLASS`, …), plus enums/domains/custom types and arrays (`type[]`).

### Column features
- **Identity columns**: `GENERATED ALWAYS | BY DEFAULT AS IDENTITY (START… INCREMENT… CYCLE)`
- **Generated columns**: `GENERATED ALWAYS AS (expr) STORED` (type can be declared or inferred)
- **Constraints**: `NOT NULL`, `UNIQUE`, `PRIMARY KEY`, `DEFAULT`, `CHECK (expr)`
- **References**: `REFERENCES table(col)` with `ON DELETE`, `ON UPDATE`, `DEFERRABLE`, `INITIALLY DEFERRED`
- **`COLLATE`**, **`COMPRESSION`** (e.g. `pglz`), comments
- **File types** (`File`, `Image`, `PDF`, `Document`, `Video`, `Audio`): stored as `TEXT` with an automatic companion `<col>_mime_type` column plus MIME-type `CHECK` constraint

### Table constraints
`PRIMARY KEY`, `UNIQUE` (simple and named), `FOREIGN KEY` (object map or array form with actions/deferrability), `CHECK` (simple, named, or array), `EXCLUDE USING GIST` with operator elements and `WHERE`.

### Indexes
`BTREE`, `HASH`, `GIN`, `GIST`, `BRIN` (or `SP-GIST`), plus:
- `UNIQUE` indexes
- `CONCURRENTLY` creation
- `INCLUDE` columns
- partial indexes (`WHERE` clause)
- `TABLESPACE`

## Requirements
- `libjansson` — `sudo apt-get install libjansson-dev`
- `gcc`

## Compilation
```bash
gcc -o autoschema schema.c -ljansson
```

## Usage
1. Edit `schema.json` to define your schema.
2. Generate the DDL:
   ```bash
   ./autoschema > autoschema.sql
   ```
3. Apply it:
   ```bash
   psql -U your_user -d your_db -f autoschema.sql
   ```

The output has been tested against **PostgreSQL 17** — the bundled `schema.json` example applies with zero errors.

## JSON format

Columns can be defined two ways:

**1. Compact string (backward compatible):**
```json
"columns": {
    "name": "Char(50,notnull)",          "email": "Char(50,unique)",
    "status": "status DEFAULT 'active'", "visits": "BigInt DEFAULT 0",
    "web": "Foreign(website_info) ON DELETE CASCADE",
    "full_name": "Generated(first_name || ' ' || last_name)"
}
```

**2. Full object form (recommended):**
```json
"columns": {
    "id": {
        "type": "UUID",
        "default": "gen_random_uuid()",
        "primary_key": true,
        "comment": "Primary key"
    },
    "username": { "type": "CITEXT", "notnull": true, "unique": true },
    "sku": { "type": "VARCHAR(50)", "collation": "\"C\"", "unique": true },
    "price": { "type": "NUMERIC(10,2)", "notnull": true, "check": "price >= 0" },
    "seq": {
        "type": "INTEGER",
        "identity": { "type": "ALWAYS", "start": 1, "increment": 1, "cycle": false }
    },
    "owner_id": {
        "type": "UUID",
        "references": {
            "table": "users", "column": "id",
            "ondelete": "SET NULL", "onupdate": "CASCADE",
            "deferrable": "DEFERRABLE", "initially": "DEFERRED"
        }
    },
    "price_with_tax": {
        "type": "NUMERIC(10,2)",
        "generated": "ALWAYS AS (price * 1.15) STORED"
    }
}
```

### Top-level sections
```json
{
    "database": "postgresql",
    "schema": "public",
    "roles": [ { "name": "app_user", "login": true } ],
    "extensions": ["pgcrypto", { "name": "citext", "cascade": true }],
    "sequences": { "order_seq": { "start": 1000, "increment": 5, "cycle": true } },
    "types": { "status": ["active", "inactive", "pending"] },
    "domains": { "positive_int": { "type": "INTEGER", "check": "VALUE > 0" } },
    "tables": { ... },
    "views": { "v_name": { "query": "SELECT ...", "check_option": "CASCADED" } },
    "materialized_views": {
        "mv_name": {
            "query": "SELECT ...",
            "with": "fillfactor=100",
            "tablespace": "pg_default",
            "index": { "idx_name": { "columns": "col" } }
        }
    },
    "functions": [
        {
            "name": "set_updated_at",
            "returns": "trigger",
            "language": "plpgsql",
            "before_tables": true,   // needed for trigger functions
            "body": "BEGIN\n    NEW.updated_at = NOW();\n    RETURN NEW;\nEND;"
        }
    ]
}
```

### Table options
```json
"table_options": { "unlogged": true, "temporary": false,
                   "with": "fillfactor=70", "tablespace": "pg_default" },
"inherits": "people",                          // table inheritance
"like": { "table": "users", "options": "INCLUDING DEFAULTS" },
"row_security": true,
"policies": [ { "name": "pol_owner", "command": "SELECT", "role": "app_user",
                "using": "user_id = current_setting('app.user_id')::uuid" } ],
"triggers": [ { "name": "trg_set_updated", "timing": "BEFORE", "event": "UPDATE",
                "for_each_row": true, "function": "set_updated_at()" } ]
```

> **Note on ordering:** `functions` marked `"before_tables": true` are emitted before tables so table triggers can reference them; all other functions are emitted after tables so they may reference tables.

## Example
See `schema.json` for a comprehensive example covering every feature, and `autoschema.sql` for its generated output (validated against PostgreSQL 17).

## Contributions welcome!
