/*
 * AutoSchema v2 — Comprehensive PostgreSQL Schema Generator from JSON
 *
 * Compile:  gcc -o autoschema schema.c -ljansson
 * Run:      ./autoschema > output.sql
 *
 * Features: Extensions, Sequences, ENUMs, Domains, Tables with all column types
 *   and constraints, Identity columns, Generated columns, Indexes (unique,
 *   partial, type, concurrent, include, tablespace), Triggers, Row-Level
 *   Security, Policies, Inheritance, Views, Materialized Views, Functions.
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>
#include <jansson.h>

#define MAX_STR 4096
#define MAX_TYPE 256
#define MAX_EXPR 2048

/* =============================================================== */
/*  Helpers                                                        */
/* =============================================================== */

static void json_str_opt(const json_t *obj, const char *key,
                         char *buf, size_t sz, const char *fallback) {
    json_t *v = json_object_get(obj, key);
    if (v && json_is_string(v))
        snprintf(buf, sz, "%s", json_string_value(v));
    else if (fallback)
        snprintf(buf, sz, "%s", fallback);
    else
        buf[0] = '\0';
}

static int json_bool_opt(const json_t *obj, const char *key, int fallback) {
    json_t *v = json_object_get(obj, key);
    if (v && json_is_boolean(v)) return json_boolean_value(v);
    return fallback;
}

static void escape_quotes(const char *src, char *dst, size_t sz) {
    size_t j = 0;
    for (size_t i = 0; src[i] && j < sz - 3; i++) {
        if (src[i] == '\'') {
            if (j + 2 < sz) { dst[j++] = '\''; dst[j++] = '\''; }
        } else {
            dst[j++] = src[i];
        }
    }
    dst[j] = '\0';
}

static const char *qi(const char *id) {
    static char buf[MAX_STR];
    if (!id || !*id) return "";
    if (id[0] == '"') return id;
    int safe = 1;
    for (const char *p = id; *p; p++)
        if (!(isalnum((unsigned char)*p) || *p == '_')) { safe = 0; break; }
    if (safe) {
        for (const char *p = id; *p; p++)
            if (isupper((unsigned char)*p)) { safe = 0; break; }
    }
    if (safe) return id;
    snprintf(buf, sizeof(buf), "\"%s\"", id);
    return buf;
}

/* =============================================================== */
/*  Type mapping — maps type name strings to PG DDL types           */
/* =============================================================== */

static void map_type(const char *raw, char *out, size_t outsz) {
    char buf[MAX_TYPE]; snprintf(buf, sizeof(buf), "%s", raw);
    size_t len = strlen(buf);
    while (len > 0 && (buf[len-1] == ' ' || buf[len-1] == '\t')) buf[--len] = '\0';

    char upper[MAX_TYPE];
    for (size_t i = 0; i <= len; i++) upper[i] = toupper((unsigned char)buf[i]);

    int is_arr = 0;
    char *br = strstr(upper, "[]");
    if (br) { is_arr = 1; *br = '\0'; buf[br - upper] = '\0'; }

    char pg[MAX_TYPE] = "";

    if (strcmp(upper, "INT") == 0 || strcmp(upper, "INTEGER") == 0)
        strcpy(pg, "INTEGER");
    else if (strcmp(upper, "BIGINT") == 0) strcpy(pg, "BIGINT");
    else if (strcmp(upper, "SMALLINT") == 0) strcpy(pg, "SMALLINT");
    else if (strcmp(upper, "SERIAL") == 0) strcpy(pg, "SERIAL");
    else if (strcmp(upper, "BIGSERIAL") == 0) strcpy(pg, "BIGSERIAL");
    else if (strcmp(upper, "SMALLSERIAL") == 0) strcpy(pg, "SMALLSERIAL");
    else if (strcmp(upper, "BOOLEAN") == 0 || strcmp(upper, "BOOL") == 0) strcpy(pg, "BOOLEAN");
    else if (strcmp(upper, "REAL") == 0 || strcmp(upper, "FLOAT4") == 0) strcpy(pg, "REAL");
    else if (strcmp(upper, "DOUBLE") == 0 || strcmp(upper, "FLOAT8") == 0) strcpy(pg, "DOUBLE PRECISION");
    else if (strcmp(upper, "FLOAT") == 0) strcpy(pg, "FLOAT");
    else if (strcmp(upper, "MONEY") == 0) strcpy(pg, "MONEY");
    else if (strcmp(upper, "NUMERIC") == 0 || strcmp(upper, "DECIMAL") == 0) {
        if (strchr(buf, '(')) snprintf(pg, sizeof(pg), "%s", buf);
        else strcpy(pg, "NUMERIC");
    }
    else if (strcmp(upper, "TEXT") == 0) strcpy(pg, "TEXT");
    else if (strcmp(upper, "CITEXT") == 0) strcpy(pg, "CITEXT");
    else if (strncmp(upper, "VARCHAR", 7) == 0 || strncmp(upper, "CHARACTER VARYING", 17) == 0)
        strcpy(pg, buf);
    else if (strncmp(upper, "CHAR", 4) == 0) strcpy(pg, buf);
    else if (strcmp(upper, "BYTEA") == 0) strcpy(pg, "BYTEA");
    else if (strcmp(upper, "DATE") == 0) strcpy(pg, "DATE");
    else if (strcmp(upper, "TIME") == 0) strcpy(pg, "TIME");
    else if (strcmp(upper, "TIMETZ") == 0) strcpy(pg, "TIMETZ");
    else if (strcmp(upper, "DATETIME") == 0) strcpy(pg, "TIMESTAMP");
    else if (strcmp(upper, "TIMESTAMP") == 0) strcpy(pg, "TIMESTAMP");
    else if (strcmp(upper, "TIMESTAMPTZ") == 0) strcpy(pg, "TIMESTAMP WITH TIME ZONE");
    else if (strcmp(upper, "INTERVAL") == 0) strcpy(pg, "INTERVAL");
    else if (strcmp(upper, "INET") == 0) strcpy(pg, "INET");
    else if (strcmp(upper, "CIDR") == 0) strcpy(pg, "CIDR");
    else if (strcmp(upper, "MACADDR") == 0) strcpy(pg, "MACADDR");
    else if (strcmp(upper, "MACADDR8") == 0) strcpy(pg, "MACADDR8");
    else if (strcmp(upper, "UUID") == 0) strcpy(pg, "UUID");
    else if (strcmp(upper, "XML") == 0) strcpy(pg, "XML");
    else if (strcmp(upper, "JSON") == 0) strcpy(pg, "JSON");
    else if (strcmp(upper, "JSONB") == 0) strcpy(pg, "JSONB");
    else if (strcmp(upper, "POINT") == 0) strcpy(pg, "POINT");
    else if (strcmp(upper, "LINE") == 0) strcpy(pg, "LINE");
    else if (strcmp(upper, "LSEG") == 0) strcpy(pg, "LSEG");
    else if (strcmp(upper, "BOX") == 0) strcpy(pg, "BOX");
    else if (strcmp(upper, "PATH") == 0) strcpy(pg, "PATH");
    else if (strcmp(upper, "POLYGON") == 0) strcpy(pg, "POLYGON");
    else if (strcmp(upper, "CIRCLE") == 0) strcpy(pg, "CIRCLE");
    else if (strcmp(upper, "TSVECTOR") == 0) strcpy(pg, "TSVECTOR");
    else if (strcmp(upper, "TSQUERY") == 0) strcpy(pg, "TSQUERY");
    else if (strcmp(upper, "INT4RANGE") == 0) strcpy(pg, "INT4RANGE");
    else if (strcmp(upper, "INT8RANGE") == 0) strcpy(pg, "INT8RANGE");
    else if (strcmp(upper, "NUMRANGE") == 0) strcpy(pg, "NUMRANGE");
    else if (strcmp(upper, "TSRANGE") == 0) strcpy(pg, "TSRANGE");
    else if (strcmp(upper, "TSTZRANGE") == 0) strcpy(pg, "TSTZRANGE");
    else if (strcmp(upper, "DATERANGE") == 0) strcpy(pg, "DATERANGE");
    else if (strncmp(upper, "BIT", 3) == 0) strcpy(pg, buf);
    else if (strcmp(upper, "OID") == 0) strcpy(pg, "OID");
    else if (strcmp(upper, "REGPROC") == 0 ||
             strcmp(upper, "REGPROCEDURE") == 0 ||
             strcmp(upper, "REGOPER") == 0 ||
             strcmp(upper, "REGOPERATOR") == 0 ||
             strcmp(upper, "REGCLASS") == 0 ||
             strcmp(upper, "REGCONFIG") == 0 ||
             strcmp(upper, "REGDICTIONARY") == 0 ||
             strcmp(upper, "REGNAMESPACE") == 0)
        strcpy(pg, buf);
    else
        strcpy(pg, buf); /* enum, domain, or custom type */

    if (is_arr) strcat(pg, "[]");
    snprintf(out, outsz, "%s", pg);
}
/* =============================================================== */
/*  Column definition and parsing                                  */
/* =============================================================== */

typedef struct {
    char type[MAX_TYPE];
    char default_expr[MAX_EXPR];
    char collation[MAX_TYPE];
    char compression[MAX_TYPE];
    char check_expr[MAX_EXPR];
    char comment[MAX_EXPR];
    char generated_expr[MAX_EXPR];
    char identity_type[MAX_TYPE];   /* ALWAYS or BY DEFAULT */
    char identity_opts[MAX_EXPR];
    char ref_table[MAX_TYPE];
    char ref_column[MAX_TYPE];
    char ref_ondelete[MAX_TYPE];
    char ref_onupdate[MAX_TYPE];
    char ref_deferrable[MAX_TYPE];
    char ref_initially[MAX_TYPE];
    int  notnull;
    int  unique;
    int  primary_key;
    int  is_foreign;
} ColumnDef;

/* Parse a column given as a simple string (backward compatible) */
static void parse_col_str(const char *str, ColumnDef *def) {
    memset(def, 0, sizeof(*def));
    char buf[MAX_STR];
    snprintf(buf, sizeof(buf), "%s", str);
    size_t len = strlen(buf);
    while (len > 0 && (buf[len-1] == ' ' || buf[len-1] == '\t')) buf[--len] = '\0';

    /* Generated(expr) */
    if (strncmp(buf, "Generated(", 10) == 0) {
        char expr[MAX_EXPR] = "";
        int depth = 1; size_t j = 10, k = 0;
        while (buf[j] && depth > 0 && k < MAX_EXPR - 1) {
            if (buf[j] == '(') depth++;
            else if (buf[j] == ')') depth--;
            if (depth > 0) expr[k++] = buf[j];
            j++;
        }
        expr[k] = '\0';
        def->type[0] = '\0'; /* type inferred from expression */
        snprintf(def->generated_expr, sizeof(def->generated_expr),
                 "ALWAYS AS (%s) STORED", expr);
        def->notnull = 1;
        return;
    }

    /* Foreign(table) [ON DELETE action] [ON UPDATE action] */
    if (strncmp(buf, "Foreign(", 8) == 0) {
        char refspec[MAX_STR] = "";
        sscanf(buf, "Foreign(%[^)])", refspec);
        char t[MAX_TYPE] = "", d[MAX_TYPE] = "", u[MAX_TYPE] = "";
        int n = sscanf(refspec, "%s ON DELETE %s ON UPDATE %s", t, d, u);
        if (n < 2) {
            n = sscanf(refspec, "%s ON DELETE %s", t, d);
            if (n < 2) sscanf(refspec, "%s", t);
        }
        snprintf(def->type, sizeof(def->type), "INTEGER");
        snprintf(def->ref_table, sizeof(def->ref_table), "%s", t);
        snprintf(def->ref_column, sizeof(def->ref_column), "id");
        if (d[0]) snprintf(def->ref_ondelete, sizeof(def->ref_ondelete), "%s", d);
        if (u[0]) snprintf(def->ref_onupdate, sizeof(def->ref_onupdate), "%s", u);
        def->is_foreign = 1;
        return;
    }

    /* Type [DEFAULT expr] or Type,modifier */
    char type_part[MAX_STR] = "";
    char *def_pos = strstr(buf, " DEFAULT ");
    if (def_pos) {
        size_t tl = (size_t)(def_pos - buf);
        memcpy(type_part, buf, tl); type_part[tl] = '\0';
        char *dv = def_pos + 9; while (*dv == ' ') dv++;
        snprintf(def->default_expr, sizeof(def->default_expr), "%s", dv);
    } else {
        /* Find a modifier separator comma. First look for one OUTSIDE
         * parentheses (e.g. "Char(50),unique"), then fall back to the last
         * comma inside parentheses for the legacy "Char(50,notnull)" format
         * (but NOT for NUMERIC(10,2)-style precision lists). */
        char *comma = NULL;
        int depth = 0;
        for (char *p = buf; *p; p++) {
            if (*p == '(') depth++;
            else if (*p == ')') depth--;
            else if (*p == ',' && depth == 0) comma = p;
        }
        if (!comma) {
            /* legacy: last comma inside parens, trailing ')' after modifier */
            char *p = buf + strlen(buf) - 1;
            if (*p == ')') {
                depth = 0;
                for (char *q = p; q >= buf; q--) {
                    if (*q == ')') depth++;
                    else if (*q == '(') depth--;
                    else if (*q == ',' && depth == 1) { comma = q; break; }
                }
            }
        }
        if (comma) {
            const char *mod = comma + 1;
            size_t modlen = strcspn(mod, ")");
            char modbuf[32] = "";
            if (modlen < sizeof(modbuf)) {
                memcpy(modbuf, mod, modlen);
                modbuf[modlen] = '\0';
            }
            if (strcasecmp(modbuf, "notnull") == 0) {
                memcpy(type_part, buf, comma - buf); type_part[comma - buf] = '\0';
                def->notnull = 1;
                /* re-close the parenthesis for legacy Char(50,notnull) form */
                char *open = strchr(type_part, '(');
                if (open && !strchr(type_part, ')')) strcat(type_part, ")");
            } else if (strcasecmp(modbuf, "unique") == 0) {
                memcpy(type_part, buf, comma - buf); type_part[comma - buf] = '\0';
                def->unique = 1;
                char *open = strchr(type_part, '(');
                if (open && !strchr(type_part, ')')) strcat(type_part, ")");
            } else {
                snprintf(type_part, sizeof(type_part), "%s", buf);
            }
        } else {
            snprintf(type_part, sizeof(type_part), "%s", buf);
        }
    }

    map_type(type_part, def->type, sizeof(def->type));
    if (def->type[0] == '\0')
        snprintf(def->type, sizeof(def->type), "%s", type_part);
}

/* Parse a column given as a JSON object */
static void parse_col_obj(const json_t *obj, ColumnDef *def) {
    memset(def, 0, sizeof(*def));
    char raw_type[MAX_TYPE] = "TEXT";
    json_str_opt(obj, "type", raw_type, sizeof(raw_type), "TEXT");
    map_type(raw_type, def->type, sizeof(def->type));

    json_str_opt(obj, "default", def->default_expr, sizeof(def->default_expr), "");
    json_str_opt(obj, "collate", def->collation, sizeof(def->collation), "");
    json_str_opt(obj, "compression", def->compression, sizeof(def->compression), "");
    json_str_opt(obj, "check", def->check_expr, sizeof(def->check_expr), "");
    json_str_opt(obj, "comment", def->comment, sizeof(def->comment), "");
    json_str_opt(obj, "generated", def->generated_expr, sizeof(def->generated_expr), "");
    def->notnull = json_bool_opt(obj, "notnull", 0);
    def->unique  = json_bool_opt(obj, "unique", 0);
    def->primary_key = json_bool_opt(obj, "primary_key", 0);

    /* Identity column */
    json_t *idty = json_object_get(obj, "identity");
    if (idty && json_is_object(idty)) {
        json_str_opt(idty, "type", def->identity_type, sizeof(def->identity_type), "ALWAYS");
        char opts[MAX_EXPR] = "";
        char tmp[MAX_TYPE];
        json_str_opt(idty, "start", tmp, sizeof(tmp), "");
        if (tmp[0]) { char a[MAX_STR]; snprintf(a, sizeof(a), " START %s", tmp); strcat(opts, a); }
        json_str_opt(idty, "increment", tmp, sizeof(tmp), "");
        if (tmp[0]) { char a[MAX_STR]; snprintf(a, sizeof(a), " INCREMENT %s", tmp); strcat(opts, a); }
        json_str_opt(idty, "minvalue", tmp, sizeof(tmp), "");
        if (tmp[0]) { char a[MAX_STR]; snprintf(a, sizeof(a), " MINVALUE %s", tmp); strcat(opts, a); }
        json_str_opt(idty, "maxvalue", tmp, sizeof(tmp), "");
        if (tmp[0]) { char a[MAX_STR]; snprintf(a, sizeof(a), " MAXVALUE %s", tmp); strcat(opts, a); }
        if (json_bool_opt(idty, "cycle", 0)) strcat(opts, " CYCLE");
        if (opts[0] == ' ') memmove(opts, opts + 1, strlen(opts));
        snprintf(def->identity_opts, sizeof(def->identity_opts), "%s", opts);
    }

    /* Foreign key reference */
    json_t *ref = json_object_get(obj, "references");
    if (ref && json_is_object(ref)) {
        json_str_opt(ref, "table", def->ref_table, sizeof(def->ref_table), "");
        json_str_opt(ref, "column", def->ref_column, sizeof(def->ref_column), "id");
        json_str_opt(ref, "ondelete", def->ref_ondelete, sizeof(def->ref_ondelete), "");
        json_str_opt(ref, "onupdate", def->ref_onupdate, sizeof(def->ref_onupdate), "");
        json_str_opt(ref, "deferrable", def->ref_deferrable, sizeof(def->ref_deferrable), "");
        json_str_opt(ref, "initially", def->ref_initially, sizeof(def->ref_initially), "");
        def->is_foreign = (def->ref_table[0] != '\0');
    }
}

/* Return the MIME-type CHECK expression for file types, or NULL if not a file type */
static const char *file_mime_check(const char *type_upper) {
    if (strcmp(type_upper, "FILE") == 0)
        return "mime_type ~ '^(application|audio|image|text|video)/[a-z0-9.+-]+$'";
    if (strcmp(type_upper, "IMAGE") == 0)
        return "mime_type IN ('image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/bmp', 'image/tiff')";
    if (strcmp(type_upper, "PDF") == 0)
        return "mime_type = 'application/pdf'";
    if (strcmp(type_upper, "DOCUMENT") == 0)
        return "mime_type IN ('application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain', 'application/pdf', 'application/vnd.oasis.opendocument.text')";
    if (strcmp(type_upper, "VIDEO") == 0)
        return "mime_type IN ('video/mp4', 'video/webm', 'video/ogg', 'video/x-msvideo', 'video/quicktime')";
    if (strcmp(type_upper, "AUDIO") == 0)
        return "mime_type IN ('audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4', 'audio/x-aiff')";
    return NULL;
}

/* =============================================================== */
/*  Print a column line                                            */
/* =============================================================== */

static void print_col(const char *name, const ColumnDef *def,
                      const char *schema, const char *table) {
    printf("    %s", qi(name));
    if (def->generated_expr[0]) {
        if (def->type[0]) printf(" %s", def->type);
        if (strncmp(def->generated_expr, "GENERATED", 9) != 0)
            printf(" GENERATED");
        printf(" %s", def->generated_expr);
        if (def->notnull) printf(" NOT NULL");
        if (def->collation[0]) printf(" COLLATE %s", def->collation);
        goto comment_out;
    }
    if (def->identity_type[0]) {
        printf(" %s GENERATED %s AS IDENTITY", def->type, def->identity_type);
        if (def->identity_opts[0]) printf(" (%s)", def->identity_opts);
        if (def->collation[0]) printf(" COLLATE %s", def->collation);
        if (def->notnull) printf(" NOT NULL");
        if (def->unique) printf(" UNIQUE");
        if (def->primary_key) printf(" PRIMARY KEY");
        if (def->default_expr[0]) printf(" DEFAULT %s", def->default_expr);
    } else {
        printf(" %s", def->type);
        if (def->collation[0]) printf(" COLLATE %s", def->collation);
        if (def->compression[0]) printf(" COMPRESSION %s", def->compression);
        if (def->default_expr[0]) printf(" DEFAULT %s", def->default_expr);
        if (def->notnull) printf(" NOT NULL");
        if (def->unique) printf(" UNIQUE");
        if (def->primary_key) printf(" PRIMARY KEY");
        if (def->is_foreign) {
            printf(" REFERENCES %s.%s(%s)", qi(schema), qi(def->ref_table), qi(def->ref_column));
            if (def->ref_ondelete[0]) printf(" ON DELETE %s", def->ref_ondelete);
            if (def->ref_onupdate[0]) printf(" ON UPDATE %s", def->ref_onupdate);
            if (def->ref_deferrable[0]) {
                if (strcasecmp(def->ref_deferrable, "true") == 0)
                    printf(" DEFERRABLE");
                else
                    printf(" %s", def->ref_deferrable);
            }
            if (def->ref_initially[0]) printf(" INITIALLY %s", def->ref_initially);
        }
        if (def->check_expr[0]) printf(" CHECK (%s)", def->check_expr);
    }
comment_out:
    if (def->comment[0]) {
        char esc[MAX_STR]; escape_quotes(def->comment, esc, sizeof(esc));
        printf("  /* %s */", esc);
    }
    printf("\n");
}

/* =============================================================== */
/*  Generate a single table                                        */
/* =============================================================== */

static void generate_table(const char *schema, const char *tname, const json_t *td) {
    json_t *columns   = json_object_get(td, "columns");
    json_t *cons      = json_object_get(td, "constraints");
    json_t *topts     = json_object_get(td, "table_options");
    json_t *indexes   = json_object_get(td, "indexes");
    json_t *comments  = json_object_get(td, "comments");
    json_t *triggers  = json_object_get(td, "triggers");
    json_t *policies  = json_object_get(td, "policies");
    json_t *inherit   = json_object_get(td, "inherits");
    json_t *like      = json_object_get(td, "like");

    if (!columns || !json_is_object(columns)) {
        fprintf(stderr, "Warning: table '%s' has no columns\n", tname);
        return;
    }

    char deferred_pk[MAX_STR] = "";

    printf("CREATE ");
    if (topts) {
        if (json_bool_opt(topts, "unlogged", 0)) printf("UNLOGGED ");
        if (json_bool_opt(topts, "temporary", 0) || json_bool_opt(topts, "temp", 0)) printf("TEMPORARY ");
    }
    printf("TABLE IF NOT EXISTS %s.%s (\n", qi(schema), qi(tname));

    /* LIKE clause */
    if (like && json_is_object(like)) {
        const char *lt = json_string_value(json_object_get(like, "table"));
        const char *lo = json_string_value(json_object_get(like, "options"));
        printf("    LIKE %s.%s", qi(schema), lt ? qi(lt) : "???");
        if (lo) printf(" %s", lo);
        printf(",\n");
    }

    /* Columns */
    int first = 1;
    int has_col_pk = 0;
    const char *local_cols[128];
    int local_cols_n = 0;
    const char *cname; json_t *cdef;
    json_object_foreach(columns, cname, cdef) {
        if (!first) printf(",\n");
        first = 0;
        ColumnDef def;
        if (json_is_string(cdef)) parse_col_str(json_string_value(cdef), &def);
        else if (json_is_object(cdef)) parse_col_obj(cdef, &def);
        else continue;
        if (def.primary_key) has_col_pk = 1;
        if (local_cols_n < 128) local_cols[local_cols_n++] = cname;
        print_col(cname, &def, schema, tname);

        /* File-type columns get a companion mime_type column + CHECK */
        {
            char upper[MAX_TYPE];
            for (size_t i = 0; i < strlen(def.type); i++)
                upper[i] = toupper((unsigned char)def.type[i]);
            upper[strlen(def.type)] = '\0';
            const char *mime_check = file_mime_check(upper);
            if (mime_check && !def.generated_expr[0]) {
                char mime_col[MAX_STR];
                snprintf(mime_col, sizeof(mime_col), "%s_mime_type", cname);
                printf(",\n    %s VARCHAR(100)", qi(mime_col));
                printf(",\n    CHECK (%s IS NULL OR (%s))", qi(mime_col), mime_check);
            }
        }
    }

    /* ---- Table constraints ---- */
    if (cons && json_is_object(cons)) {
        json_t *pk = json_object_get(cons, "primary_key");
        if (pk && json_is_array(pk) && !has_col_pk) {
            char cols[MAX_STR] = ""; int f = 1;
            int all_local = 1;
            for (size_t i = 0; i < json_array_size(pk); i++) {
                json_t *v = json_array_get(pk, i);
                if (!json_is_string(v)) continue;
                if (!f) strcat(cols, ", "); f = 0;
                strcat(cols, qi(json_string_value(v)));
                /* check if the column is declared locally (not inherited) */
                int found = 0;
                for (int k = 0; k < local_cols_n; k++)
                    if (strcmp(local_cols[k], json_string_value(v)) == 0) { found = 1; break; }
                if (!found) all_local = 0;
            }
            if (all_local) {
                printf(",\n    PRIMARY KEY (%s)", cols);
            } else {
                /* PK references an inherited column — defer to ALTER TABLE */
                snprintf(deferred_pk, sizeof(deferred_pk), "%s", cols);
            }
        }

        json_t *uniq = json_object_get(cons, "unique");
        if (uniq) {
            if (json_is_array(uniq)) {
                char cols[MAX_STR] = ""; int f = 1;
                for (size_t i = 0; i < json_array_size(uniq); i++) {
                    json_t *v = json_array_get(uniq, i);
                    if (json_is_string(v)) { if (!f) strcat(cols, ", "); strcat(cols, qi(json_string_value(v))); f = 0; }
                }
                printf(",\n    UNIQUE (%s)", cols);
            } else if (json_is_object(uniq)) {
                const char *un; json_t *uv;
                json_object_foreach(uniq, un, uv) {
                    char cols[MAX_STR] = "";
                    if (json_is_array(uv)) {
                        int f = 1;
                        for (size_t i = 0; i < json_array_size(uv); i++) {
                            json_t *v = json_array_get(uv, i);
                            if (json_is_string(v)) { if (!f) strcat(cols, ", "); strcat(cols, qi(json_string_value(v))); f = 0; }
                        }
                    } else if (json_is_string(uv)) {
                        snprintf(cols, sizeof(cols), "%s", qi(json_string_value(uv)));
                    }
                    printf(",\n    CONSTRAINT %s UNIQUE (%s)", qi(un), cols);
                }
            }
        }

        json_t *fk = json_object_get(cons, "foreign_key");
        if (fk) {
            if (json_is_object(fk)) {
                const char *fc; json_t *fv;
                json_object_foreach(fk, fc, fv) {
                    printf(",\n    FOREIGN KEY (%s) REFERENCES %s", qi(fc), json_string_value(fv));
                }
            } else if (json_is_array(fk)) {
                for (size_t i = 0; i < json_array_size(fk); i++) {
                    json_t *fe = json_array_get(fk, i);
                    if (!json_is_object(fe)) continue;
                    const char *fcols = json_string_value(json_object_get(fe, "columns"));
                    const char *freft = json_string_value(json_object_get(fe, "ref_table"));
                    const char *frefc = json_string_value(json_object_get(fe, "ref_columns"));
                    const char *fod   = json_string_value(json_object_get(fe, "ondelete"));
                    const char *foup  = json_string_value(json_object_get(fe, "onupdate"));
                    const char *fdef  = json_string_value(json_object_get(fe, "deferrable"));
                    const char *finit = json_string_value(json_object_get(fe, "initially"));
                    if (!fcols || !freft) continue;
                    printf(",\n    FOREIGN KEY (%s) REFERENCES %s.%s(%s)",
                           fcols, qi(schema), freft, frefc ? frefc : "id");
                    if (fod) printf(" ON DELETE %s", fod);
                    if (foup) printf(" ON UPDATE %s", foup);
                    if (fdef) printf(" %s", fdef);
                    if (finit) printf(" %s", finit);
                }
            }
        }

        json_t *chk = json_object_get(cons, "check");
        if (chk) {
            if (json_is_string(chk)) {
                printf(",\n    CHECK (%s)", json_string_value(chk));
            } else if (json_is_object(chk)) {
                const char *ckn; json_t *ckv;
                json_object_foreach(chk, ckn, ckv) {
                    printf(",\n    CONSTRAINT %s CHECK (%s)", qi(ckn), json_string_value(ckv));
                }
            } else if (json_is_array(chk)) {
                for (size_t i = 0; i < json_array_size(chk); i++) {
                    json_t *ce = json_array_get(chk, i);
                    if (json_is_string(ce)) printf(",\n    CHECK (%s)", json_string_value(ce));
                    else if (json_is_object(ce)) {
                        const char *cn_ = json_string_value(json_object_get(ce, "name"));
                        const char *cx_ = json_string_value(json_object_get(ce, "expression"));
                        if (cn_ && cx_) printf(",\n    CONSTRAINT %s CHECK (%s)", qi(cn_), cx_);
                    }
                }
            }
        }

        json_t *excl = json_object_get(cons, "exclude");
        if (excl && json_is_object(excl)) {
            const char *exn; json_t *exv;
            json_object_foreach(excl, exn, exv) {
                json_t *elems = json_object_get(exv, "elems");
                const char *exusing = json_string_value(json_object_get(exv, "using"));
                const char *exwhere = json_string_value(json_object_get(exv, "where"));
                printf(",\n    CONSTRAINT %s EXCLUDE USING %s (", qi(exn), exusing ? exusing : "GIST");
                if (elems && json_is_array(elems)) {
                    for (size_t i = 0; i < json_array_size(elems); i++) {
                        json_t *el = json_array_get(elems, i);
                        if (json_is_object(el)) {
                            const char *ec = json_string_value(json_object_get(el, "column"));
                            const char *eo = json_string_value(json_object_get(el, "with"));
                            if (i > 0) printf(", ");
                            printf("%s WITH %s", ec, eo);
                        }
                    }
                }
                printf(")");
                if (exwhere) printf(" WHERE (%s)", exwhere);
            }
        }
    }

    if (inherit && json_is_string(inherit)) {
        printf("\n) INHERITS (%s.%s);\n", qi(schema), qi(json_string_value(inherit)));
        if (deferred_pk[0])
            printf("ALTER TABLE %s.%s ADD PRIMARY KEY (%s);\n",
                   qi(schema), qi(tname), deferred_pk);
    } else {
        printf("\n);\n");
        if (deferred_pk[0])
            printf("ALTER TABLE %s.%s ADD PRIMARY KEY (%s);\n",
                   qi(schema), qi(tname), deferred_pk);
    }

    /* Partitioning (emitted as a note since syntax needs partitions defined) */
    json_t *part = json_object_get(td, "partition");
    if (part && json_is_object(part)) {
        const char *pm = json_string_value(json_object_get(part, "by"));
        const char *pc = json_string_value(json_object_get(part, "column"));
        if (pm && pc) {
            printf("-- %s.%s is designed to be partitioned by %s (%s);\n",
                   qi(schema), qi(tname), pm, pc);
        }
    }

    /* Storage parameters & tablespace */
    if (topts) {
        json_t *ww = json_object_get(topts, "with");
        if (ww && json_is_string(ww))
            printf("ALTER TABLE %s.%s SET (%s);\n", qi(schema), qi(tname), json_string_value(ww));
        json_t *tblsp = json_object_get(topts, "tablespace");
        if (tblsp && json_is_string(tblsp))
            printf("ALTER TABLE %s.%s SET TABLESPACE %s;\n", qi(schema), qi(tname), qi(json_string_value(tblsp)));
    }

    /* Indexes */
    if (indexes && json_is_object(indexes)) {
        const char *in; json_t *iv;
        json_object_foreach(indexes, in, iv) {
            int uniq = 0, conc = 0;
            const char *itype = NULL, *icols = NULL, *iwhere = NULL, *iinc = NULL, *its = NULL;
            if (json_is_string(iv)) {
                icols = json_string_value(iv);
            } else if (json_is_object(iv)) {
                uniq  = json_bool_opt(iv, "unique", 0);
                conc  = json_bool_opt(iv, "concurrently", 0);
                itype = json_string_value(json_object_get(iv, "type"));
                icols = json_string_value(json_object_get(iv, "columns"));
                iwhere = json_string_value(json_object_get(iv, "where"));
                iinc  = json_string_value(json_object_get(iv, "include"));
                its   = json_string_value(json_object_get(iv, "tablespace"));
            }
            printf("CREATE ");
            if (uniq) printf("UNIQUE ");
            printf("INDEX ");
            if (conc) printf("CONCURRENTLY ");
            printf("%s ON %s.%s ", qi(in), qi(schema), qi(tname));
            if (itype) printf("USING %s ", itype);
            printf("(%s)", icols ? icols : "???");
            if (iinc) printf(" INCLUDE (%s)", iinc);
            if (iwhere) printf(" WHERE (%s)", iwhere);
            if (its) printf(" TABLESPACE %s", qi(its));
            printf(";\n");
        }
    }

    /* Triggers */
    if (triggers && json_is_array(triggers)) {
        for (size_t i = 0; i < json_array_size(triggers); i++) {
            json_t *tt = json_array_get(triggers, i);
            if (!json_is_object(tt)) continue;
            const char *tn   = json_string_value(json_object_get(tt, "name"));
            const char *tw   = json_string_value(json_object_get(tt, "when"));
            const char *te   = json_string_value(json_object_get(tt, "event"));
            const char *ttm  = json_string_value(json_object_get(tt, "timing"));
            const char *tf   = json_string_value(json_object_get(tt, "function"));
            const char *targs = json_string_value(json_object_get(tt, "args"));
            const char *tcond = json_string_value(json_object_get(tt, "condition"));
            const char *tcomment = json_string_value(json_object_get(tt, "comment"));
            int frow = json_bool_opt(tt, "for_each_row", 1);
            if (!tn || !te || !tf) continue;
            printf("CREATE TRIGGER %s\n    ", qi(tn));
            if (ttm) printf("%s ", ttm);
            printf("%s ", te);
            printf("ON %s.%s\n", qi(schema), qi(tname));
            if (tw) printf("    %s\n", tw);
            printf("    FOR EACH %s\n", frow ? "ROW" : "STATEMENT");
            if (tcond) printf("    WHEN (%s)\n", tcond);
            /* strip trailing "()" from function name if present */
            char funcname[MAX_STR];
            snprintf(funcname, sizeof(funcname), "%s", tf);
            size_t fl = strlen(funcname);
            if (fl >= 2 && funcname[fl-1] == ')' && funcname[fl-2] == '(')
                funcname[fl-2] = '\0';
            printf("    EXECUTE FUNCTION %s", funcname);
            if (targs) printf("(%s)", targs);
            else printf("()");
            printf(";\n");
            if (tcomment) {
                char esc[MAX_STR]; escape_quotes(tcomment, esc, sizeof(esc));
                printf("COMMENT ON TRIGGER %s ON %s.%s IS '%s';\n",
                       qi(tn), qi(schema), qi(tname), esc);
            }
            printf("\n");
        }
    }

    /* Row-level security */
    json_t *rls = json_object_get(td, "row_security");
    if (rls && json_is_true(rls)) {
        printf("ALTER TABLE %s.%s ENABLE ROW LEVEL SECURITY;\n", qi(schema), qi(tname));
    }

    if (policies && json_is_array(policies)) {
        for (size_t i = 0; i < json_array_size(policies); i++) {
            json_t *pp = json_array_get(policies, i);
            if (!json_is_object(pp)) continue;
            const char *pn   = json_string_value(json_object_get(pp, "name"));
            const char *pcmd = json_string_value(json_object_get(pp, "command"));
            const char *prol = json_string_value(json_object_get(pp, "role"));
            const char *pus  = json_string_value(json_object_get(pp, "using"));
            const char *pch  = json_string_value(json_object_get(pp, "check"));
            if (!pn) continue;
            printf("CREATE POLICY %s\n    ON %s.%s\n", qi(pn), qi(schema), qi(tname));
            if (pcmd) printf("    FOR %s\n", pcmd);
            if (prol) printf("    TO %s\n", prol);
            if (pus) printf("    USING (%s)\n", pus);
            if (pch) printf("    WITH CHECK (%s)\n", pch);
            printf(";\n\n");
        }
    }

    /* Comments */
    if (comments && json_is_object(comments)) {
        json_t *tc = json_object_get(comments, "table");
        if (tc && json_is_string(tc)) {
            char esc[MAX_STR]; escape_quotes(json_string_value(tc), esc, sizeof(esc));
            printf("COMMENT ON TABLE %s.%s IS '%s';\n", qi(schema), qi(tname), esc);
        }
        const char *ccn; json_t *ccv;
        json_object_foreach(comments, ccn, ccv) {
            if (strcmp(ccn, "table") != 0 && json_is_string(ccv)) {
                char esc[MAX_STR]; escape_quotes(json_string_value(ccv), esc, sizeof(esc));
                printf("COMMENT ON COLUMN %s.%s.%s IS '%s';\n",
                       qi(schema), qi(tname), qi(ccn), esc);
            }
        }
    }
    printf("\n");
}

/* =============================================================== */
/*  Main schema generator                                          */
/* =============================================================== */

static void generate_schema(json_t *root) {
    const char *database = json_string_value(json_object_get(root, "database"));
    const char *schema = "public";
    json_t *so = json_object_get(root, "schema");
    if (so && json_is_string(so)) schema = json_string_value(so);

    json_t *roles      = json_object_get(root, "roles");
    json_t *extensions = json_object_get(root, "extensions");
    json_t *sequences  = json_object_get(root, "sequences");
    json_t *enums      = json_object_get(root, "types");
    json_t *domains    = json_object_get(root, "domains");
    json_t *tables     = json_object_get(root, "tables");
    if (!tables) tables = json_object_get(root, "table"); /* backward compat */
    json_t *views      = json_object_get(root, "views");
    json_t *matviews   = json_object_get(root, "materialized_views");
    json_t *functions  = json_object_get(root, "functions");

    printf("-- ===============================================================\n");
    printf("-- AutoSchema v2 - Generated DDL for database: %s (schema: %s)\n", database, schema);
    printf("-- ===============================================================\n\n");

    printf("CREATE SCHEMA IF NOT EXISTS %s;\n\n", qi(schema));

    /* Roles */
    if (roles && json_is_array(roles)) {
        printf("-- Roles\n");
        for (size_t i = 0; i < json_array_size(roles); i++) {
            json_t *r = json_array_get(roles, i);
            const char *rname = NULL;
            if (json_is_string(r)) rname = json_string_value(r);
            else if (json_is_object(r)) rname = json_string_value(json_object_get(r, "name"));
            if (!rname) continue;
            printf("DO $do$ BEGIN\n    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '%s') THEN\n        CREATE ROLE %s", rname, qi(rname));
            if (json_is_object(r)) {
                const char *rpass = json_string_value(json_object_get(r, "password"));
                int rlogin = json_bool_opt(r, "login", 0);
                int rsuper = json_bool_opt(r, "superuser", 0);
                int rcreatedb = json_bool_opt(r, "createdb", 0);
                int rcreaterole = json_bool_opt(r, "createrole", 0);
                if (rlogin) printf(" LOGIN");
                if (rsuper) printf(" SUPERUSER");
                if (rcreatedb) printf(" CREATEDB");
                if (rcreaterole) printf(" CREATEROLE");
                if (rpass) printf(" PASSWORD %s", rpass);
            }
            printf(";\n    END IF;\nEND $do$;\n");
        }
        printf("\n");
    }

    /* Extensions */
    if (extensions && json_is_array(extensions)) {
        printf("-- Extensions\n");
        for (size_t i = 0; i < json_array_size(extensions); i++) {
            json_t *ext = json_array_get(extensions, i);
            const char *en = NULL, *es = NULL; int ec = 1;
            if (json_is_string(ext)) {
                en = json_string_value(ext);
            } else if (json_is_object(ext)) {
                en = json_string_value(json_object_get(ext, "name"));
                es = json_string_value(json_object_get(ext, "schema"));
                ec = json_bool_opt(ext, "cascade", 1);
            }
            if (en) {
                printf("CREATE EXTENSION IF NOT EXISTS %s", qi(en));
                if (es) printf(" SCHEMA %s", qi(es));
                if (ec) printf(" CASCADE");
                printf(";\n");
            }
        }
        printf("\n");
    }

    /* Sequences */
    if (sequences && json_is_object(sequences)) {
        printf("-- Sequences\n");
        const char *sn; json_t *sv;
        json_object_foreach(sequences, sn, sv) {
            if (!json_is_object(sv)) continue;
            printf("CREATE SEQUENCE IF NOT EXISTS %s.%s", qi(schema), qi(sn));
            json_t *v;
            if ((v = json_object_get(sv, "start")) && json_is_integer(v))
                printf(" START %lld", (long long)json_integer_value(v));
            if ((v = json_object_get(sv, "increment")) && json_is_integer(v))
                printf(" INCREMENT %lld", (long long)json_integer_value(v));
            if ((v = json_object_get(sv, "minvalue")) && json_is_integer(v))
                printf(" MINVALUE %lld", (long long)json_integer_value(v));
            if ((v = json_object_get(sv, "maxvalue")) && json_is_integer(v))
                printf(" MAXVALUE %lld", (long long)json_integer_value(v));
            if (json_bool_opt(sv, "cycle", 0)) printf(" CYCLE");
            printf(";\n");
        }
        printf("\n");
    }

    /* ENUM types */
    if (enums && json_is_object(enums)) {
        printf("-- Custom ENUM types\n");
        const char *tn; json_t *tv;
        json_object_foreach(enums, tn, tv) {
            if (!json_is_array(tv)) continue;
            printf("CREATE TYPE %s.%s AS ENUM (", qi(schema), qi(tn));
            size_t idx; json_t *val; int f = 1;
            json_array_foreach(tv, idx, val) {
                if (!f) printf(", "); f = 0;
                printf("'%s'", json_string_value(val));
            }
            printf(");\n");
        }
        printf("\n");
    }

    /* Domains */
    if (domains && json_is_object(domains)) {
        printf("-- Custom Domains\n");
        const char *dn; json_t *dv;
        json_object_foreach(domains, dn, dv) {
            if (!json_is_object(dv)) continue;
            const char *dt   = json_string_value(json_object_get(dv, "type"));
            const char *dd   = json_string_value(json_object_get(dv, "default"));
            const char *dc   = json_string_value(json_object_get(dv, "check"));
            const char *dcol = json_string_value(json_object_get(dv, "collation"));
            const char *dcomment = json_string_value(json_object_get(dv, "comment"));
            int dnn = json_bool_opt(dv, "notnull", 0);
            if (!dt) continue;
            printf("CREATE DOMAIN %s.%s AS %s", qi(schema), qi(dn), dt);
            if (dcol) printf(" COLLATE %s", dcol);
            if (dd) printf(" DEFAULT %s", dd);
            if (dnn) printf(" NOT NULL");
            if (dc) printf(" CHECK (%s)", dc);
            printf(";\n");
            if (dcomment) {
                char esc[MAX_STR]; escape_quotes(dcomment, esc, sizeof(esc));
                printf("COMMENT ON DOMAIN %s.%s IS '%s';\n", qi(schema), qi(dn), esc);
            }
        }
        printf("\n");
    }

    /* Functions marked to be created before tables (e.g. trigger functions) */
    if (functions && json_is_array(functions)) {
        printf("-- Functions (created before tables)\n");
        for (size_t i = 0; i < json_array_size(functions); i++) {
            json_t *ff = json_array_get(functions, i);
            if (!json_is_object(ff)) continue;
            if (!json_bool_opt(ff, "before_tables", 0)) continue;
            const char *fn   = json_string_value(json_object_get(ff, "name"));
            const char *fa   = json_string_value(json_object_get(ff, "args"));
            const char *fr   = json_string_value(json_object_get(ff, "returns"));
            const char *fl   = json_string_value(json_object_get(ff, "language"));
            const char *fb   = json_string_value(json_object_get(ff, "body"));
            const char *fbeh = json_string_value(json_object_get(ff, "behavior"));
            const char *ftyp = json_string_value(json_object_get(ff, "type"));
            int secdef = json_bool_opt(ff, "security_definer", 0);
            if (!fn || !fb) continue;
            const char *ft = ftyp ? ftyp : "FUNCTION";
            printf("CREATE %s %s.%s (%s)\n", ft, qi(schema), qi(fn), fa ? fa : "");
            if (fr) printf("    RETURNS %s\n", fr);
            if (fl) printf("    LANGUAGE %s\n", fl);
            if (fbeh) printf("    %s\n", fbeh);
            if (secdef) printf("    SECURITY DEFINER\n");
            printf("    AS $$\n%s\n    $$;\n\n", fb);
        }
        printf("\n");
    }

    /* Tables */
    if (tables && json_is_object(tables)) {
        printf("-- Tables\n\n");
        const char *tn; json_t *td;
        json_object_foreach(tables, tn, td) {
            generate_table(schema, tn, td);
        }
    }

    /* Views */
    if (views && json_is_object(views)) {
        printf("-- Views\n");
        const char *vn; json_t *vd;
        json_object_foreach(views, vn, vd) {
            const char *q = json_is_string(vd)
                ? json_string_value(vd)
                : json_string_value(json_object_get(vd, "query"));
            if (!q) continue;
            const char *co = json_string_value(json_object_get(vd, "check_option"));
            printf("CREATE VIEW %s.%s AS\n%s\n", qi(schema), qi(vn), q);
            if (co) {
                if (strcmp(co, "LOCAL") == 0 || strcmp(co, "CASCADED") == 0)
                    printf(" WITH %s CHECK OPTION", co);
                else
                    printf(" WITH CHECK OPTION");
            }
            printf(";\n\n");
        }
    }

    /* Materialized Views */
    if (matviews && json_is_object(matviews)) {
        printf("-- Materialized Views\n");
        const char *vn; json_t *vd;
        json_object_foreach(matviews, vn, vd) {
            const char *q = json_string_value(json_object_get(vd, "query"));
            if (!q) continue;
            const char *tblsp = json_string_value(json_object_get(vd, "tablespace"));
            const char *storage = json_string_value(json_object_get(vd, "with"));
            int ifne = json_bool_opt(vd, "if_not_exists", 1);
            printf("CREATE MATERIALIZED VIEW ");
            if (ifne) printf("IF NOT EXISTS ");
            printf("%s.%s", qi(schema), qi(vn));
            if (storage) printf(" WITH (%s)", storage);
            if (tblsp) printf(" TABLESPACE %s", qi(tblsp));
            printf(" AS\n%s\n;\n", q);
            json_t *idx = json_object_get(vd, "index");
            if (idx && json_is_object(idx)) {
                const char *ixn; json_t *ixv;
                json_object_foreach(idx, ixn, ixv) {
                    const char *ixc = json_string_value(json_object_get(ixv, "columns"));
                    const char *ixw = json_string_value(json_object_get(ixv, "where"));
                    if (ixc) {
                        printf("CREATE INDEX %s ON %s.%s (%s)", qi(ixn), qi(schema), qi(vn), ixc);
                        if (ixw) printf(" WHERE (%s)", ixw);
                        printf(";\n");
                    }
                }
            }
            printf("\n");
        }
    }

    /* Functions created after tables (may reference tables) */
    if (functions && json_is_array(functions)) {
        printf("-- Functions (created after tables)\n");
        for (size_t i = 0; i < json_array_size(functions); i++) {
            json_t *ff = json_array_get(functions, i);
            if (!json_is_object(ff)) continue;
            if (json_bool_opt(ff, "before_tables", 0)) continue;
            const char *fn   = json_string_value(json_object_get(ff, "name"));
            const char *fa   = json_string_value(json_object_get(ff, "args"));
            const char *fr   = json_string_value(json_object_get(ff, "returns"));
            const char *fl   = json_string_value(json_object_get(ff, "language"));
            const char *fb   = json_string_value(json_object_get(ff, "body"));
            const char *fbeh = json_string_value(json_object_get(ff, "behavior"));
            const char *ftyp = json_string_value(json_object_get(ff, "type"));
            int secdef = json_bool_opt(ff, "security_definer", 0);
            if (!fn || !fb) continue;
            const char *ft = ftyp ? ftyp : "FUNCTION";
            printf("CREATE %s %s.%s (%s)\n", ft, qi(schema), qi(fn), fa ? fa : "");
            if (fr) printf("    RETURNS %s\n", fr);
            if (fl) printf("    LANGUAGE %s\n", fl);
            if (fbeh) printf("    %s\n", fbeh);
            if (secdef) printf("    SECURITY DEFINER\n");
            printf("    AS $$\n%s\n    $$;\n\n", fb);
        }
        printf("\n");
    }

    printf("-- ===============================================================\n");
    printf("-- End of AutoSchema v2 output\n");
    printf("-- ===============================================================\n");
}

/* =============================================================== */
/*  Entry point                                                    */
/* =============================================================== */

int main() {
    const char *filename = "schema.json";
    json_error_t error;
    json_t *root = json_load_file(filename, 0, &error);

    if (!root) {
        fprintf(stderr, "Error loading %s: %s\n", filename, error.text);
        return 1;
    }

    generate_schema(root);
    json_decref(root);
    return 0;
}
