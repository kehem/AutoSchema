#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <jansson.h>

/*
 * AutoSchema: PostgreSQL Schema Generator from JSON
 * Reads schema.json and generates PostgreSQL DDL statements.
 * Supports various data types, relationships, and file variations with MIME type checking.
 * Compile with: gcc -o autoschema autoschema.c -ljansson
 * Run with: ./autoschema > schema.sql
 */

/* Maps JSON types to PostgreSQL types and adds comments */
const char* map_type_to_postgres(const char* type, char* pg_type, size_t pg_type_size, char* comment, size_t comment_size, char* check_constraint, size_t check_size) {
    if (strstr(type, "Char") != NULL) {
        int length;
        sscanf(type, "Char(%d)", &length);
        snprintf(pg_type, pg_type_size, "VARCHAR(%d)", length);
        comment[0] = '\0';
        check_constraint[0] = '\0';
    } else if (strcmp(type, "Int") == 0) {
        strcpy(pg_type, "INTEGER");
        comment[0] = '\0';
        check_constraint[0] = '\0';
    } else if (strcmp(type, "SmallInt") == 0) {
        strcpy(pg_type, "SMALLINT");
        comment[0] = '\0';
        check_constraint[0] = '\0';
    } else if (strcmp(type, "BigInt") == 0) {
        strcpy(pg_type, "BIGINT");
        comment[0] = '\0';
        check_constraint[0] = '\0';
    } else if (strcmp(type, "Bool") == 0) {
        strcpy(pg_type, "BOOLEAN");
        comment[0] = '\0';
        check_constraint[0] = '\0';
    } else if (strcmp(type, "Float") == 0) {
        strcpy(pg_type, "REAL");
        comment[0] = '\0';
        check_constraint[0] = '\0';
    } else if (strcmp(type, "Double") == 0) {
        strcpy(pg_type, "DOUBLE PRECISION");
        comment[0] = '\0';
        check_constraint[0] = '\0';
    } else if (strcmp(type, "Date") == 0) {
        strcpy(pg_type, "DATE");
        comment[0] = '\0';
        check_constraint[0] = '\0';
    } else if (strcmp(type, "DateTime") == 0) {
        strcpy(pg_type, "TIMESTAMP");
        comment[0] = '\0';
        check_constraint[0] = '\0';
    } else if (strcmp(type, "Timestamp") == 0) {
        strcpy(pg_type, "TIMESTAMP");
        comment[0] = '\0';
        check_constraint[0] = '\0';
    } else if (strcmp(type, "File") == 0) {
        strcpy(pg_type, "TEXT");  // Change to BYTEA for binary data
        snprintf(comment, comment_size, "File path (e.g., '/path/to/file')");
        snprintf(check_constraint, check_size, "mime_type ~ '^(application|audio|image|text|video)/[a-z0-9]+$'");
    } else if (strcmp(type, "Image") == 0) {
        strcpy(pg_type, "TEXT");  // Change to BYTEA for binary data
        snprintf(comment, comment_size, "Image file path (e.g., '/images/pic.jpg')");
        snprintf(check_constraint, check_size, "mime_type IN ('image/jpeg', 'image/png', 'image/gif', 'image/webp')");
    } else if (strcmp(type, "PDF") == 0) {
        strcpy(pg_type, "TEXT");  // Change to BYTEA for binary data
        snprintf(comment, comment_size, "PDF file path (e.g., '/docs/report.pdf')");
        snprintf(check_constraint, check_size, "mime_type = 'application/pdf'");
    } else if (strcmp(type, "Document") == 0) {
        strcpy(pg_type, "TEXT");  // Change to BYTEA for binary data
        snprintf(comment, comment_size, "Document file path (e.g., '/docs/note.docx')");
        snprintf(check_constraint, check_size, "mime_type IN ('application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain')");
    } else if (strcmp(type, "Video") == 0) {
        strcpy(pg_type, "TEXT");  // Change to BYTEA for binary data
        snprintf(comment, comment_size, "Video file path (e.g., '/videos/clip.mp4')");
        snprintf(check_constraint, check_size, "mime_type IN ('video/mp4', 'video/webm', 'video/ogg')");
    } else if (strcmp(type, "Audio") == 0) {
        strcpy(pg_type, "TEXT");  // Change to BYTEA for binary data
        snprintf(comment, comment_size, "Audio file path (e.g., '/audio/song.mp3')");
        snprintf(check_constraint, check_size, "mime_type IN ('audio/mpeg', 'audio/wav', 'audio/ogg')");
    } else if (strcmp(type, "Text") == 0) {
        strcpy(pg_type, "TEXT");
        comment[0] = '\0';
        check_constraint[0] = '\0';
    } else if (strcmp(type, "Json") == 0) {
        strcpy(pg_type, "JSON");
        comment[0] = '\0';
        check_constraint[0] = '\0';
    } else if (strcmp(type, "Jsonb") == 0) {
        strcpy(pg_type, "JSONB");
        comment[0] = '\0';
        check_constraint[0] = '\0';
    } else if (strncmp(type, "Foreign", 7) == 0) {
        strcpy(pg_type, "INTEGER");
        comment[0] = '\0';
        check_constraint[0] = '\0';
    } else if (strstr(type, "[]") != NULL) {
        char base_type[50];
        sscanf(type, "%[^[]", base_type);
        map_type_to_postgres(base_type, pg_type, pg_type_size, comment, comment_size, check_constraint, check_size);
        strcat(pg_type, "[]");
    } else if (strncmp(type, "Generated", 9) == 0) {
        char expression[100];
        sscanf(type, "Generated(%[^)]", expression);
        snprintf(pg_type, pg_type_size, "GENERATED ALWAYS AS (%s) STORED", expression);
        comment[0] = '\0';
        check_constraint[0] = '\0';
    } else {
        strcpy(pg_type, "TEXT");  // Default fallback, might be an enum
        comment[0] = '\0';
        check_constraint[0] = '\0';
    }
    return pg_type;
}

/* Generates PostgreSQL schema from JSON */
void generate_schema(json_t *root) {
    json_t *database_obj = json_object_get(root, "database");
    json_t *schema_obj = json_object_get(root, "schema");
    json_t *types_obj = json_object_get(root, "types");
    json_t *table_obj = json_object_get(root, "table");
    
    if (!json_is_string(database_obj) || !json_is_object(table_obj)) {
        fprintf(stderr, "Invalid JSON structure\n");
        return;
    }
    
    const char *database = json_string_value(database_obj);
    const char *schema = schema_obj && json_is_string(schema_obj) ? json_string_value(schema_obj) : "public";
    printf("-- AutoSchema for database: %s\n\n", database);
    printf("CREATE SCHEMA IF NOT EXISTS %s;\n\n", schema);
    
    // Generate custom types (enums)
    if (types_obj && json_is_object(types_obj)) {
        const char *type_name;
        json_t *type_values;
        json_object_foreach(types_obj, type_name, type_values) {
            if (json_is_array(type_values)) {
                printf("CREATE TYPE %s.%s AS ENUM (", schema, type_name);
                size_t index;
                json_t *value;
                int first = 1;
                json_array_foreach(type_values, index, value) {
                    if (!first) printf(", ");
                    printf("'%s'", json_string_value(value));
                    first = 0;
                }
                printf(");\n\n");
            }
        }
    }
    
    // Generate tables
    const char *table_name;
    json_t *table_def;
    json_object_foreach(table_obj, table_name, table_def) {
        json_t *columns = json_object_get(table_def, "columns");
        json_t *constraints = json_object_get(table_def, "constraints");
        json_t *indexes = json_object_get(table_def, "indexes");
        json_t *comments = json_object_get(table_def, "comments");
        
        printf("CREATE TABLE %s.%s (\n", schema, table_name);
        printf("    id SERIAL,\n");
        printf("    hide BOOLEAN DEFAULT FALSE,\n");
        printf("    delete BOOLEAN DEFAULT FALSE,\n");
        
        const char *column_name;
        json_t *column_def;
        int first = 1;
        
        json_object_foreach(columns, column_name, column_def) {
            if (!first) printf(",\n");
            first = 0;
            
            const char *type_str = json_string_value(column_def);
            char type[100];
            char constraint[200] = "";
            char pg_type[200];
            char col_comment[200];
            char check_constraint[200];
            
            // Parse type and constraints
            if (strstr(type_str, "unique") != NULL) {
                sscanf(type_str, "%[^,],unique", type);
                strcat(constraint, " UNIQUE");
            } else if (strstr(type_str, "notnull") != NULL) {
                sscanf(type_str, "%[^,],notnull", type);
                strcat(constraint, " NOT NULL");
            } else if (strstr(type_str, "DEFAULT") != NULL) {
                char default_val[100];
                sscanf(type_str, "%[^ ] DEFAULT %s", type, default_val);
                sprintf(constraint, " DEFAULT %s", default_val);
            } else if (strncmp(type_str, "Foreign", 7) == 0) {
                strcpy(type, "INTEGER");
                char ref_table[50], cascade[50] = "";
                if (sscanf(type_str, "Foreign(%[^)]) ON %s", ref_table, cascade) == 2) {
                    sprintf(constraint, " REFERENCES %s(id) ON %s", ref_table, cascade);
                } else {
                    sscanf(type_str, "Foreign(%[^)]", ref_table);
                    sprintf(constraint, " REFERENCES %s(id)", ref_table);
                }
                strcpy(pg_type, type);
                col_comment[0] = '\0';
                check_constraint[0] = '\0';
            } else {
                strcpy(type, type_str);
                map_type_to_postgres(type, pg_type, sizeof(pg_type), col_comment, sizeof(col_comment), check_constraint, sizeof(check_constraint));
            }
            
            if (!strncmp(type_str, "Foreign", 7) == 0) {
                map_type_to_postgres(type, pg_type, sizeof(pg_type), col_comment, sizeof(col_comment), check_constraint, sizeof(check_constraint));
            }
            
            printf("    %s %s%s", column_name, pg_type, constraint);
            if (check_constraint[0] != '\0') {
                printf(",\n    %s_mime_type VARCHAR(50)", column_name);
                printf(",\n    CHECK (%s_mime_type IS NULL OR (%s))", column_name, check_constraint);
            }
            if (col_comment[0] != '\0') {
                printf("  -- %s", col_comment);
            }
        }
        
        // Handle additional constraints
        if (constraints) {
            json_t *pk = json_object_get(constraints, "primary_key");
            json_t *uniq = json_object_get(constraints, "unique");
            json_t *fk = json_object_get(constraints, "foreign_key");
            json_t *chk = json_object_get(constraints, "check");
            
            if (pk && json_is_array(pk)) {
                printf(",\n    PRIMARY KEY (");
                size_t index;
                json_t *value;
                int first_pk = 1;
                json_array_foreach(pk, index, value) {
                    if (!first_pk) printf(", ");
                    printf("%s", json_string_value(value));
                    first_pk = 0;
                }
                printf(")");
            }
            
            if (uniq && json_is_array(uniq)) {
                printf(",\n    UNIQUE (");
                size_t index;
                json_t *value;
                int first_uniq = 1;
                json_array_foreach(uniq, index, value) {
                    if (!first_uniq) printf(", ");
                    printf("%s", json_string_value(value));
                    first_uniq = 0;
                }
                printf(")");
            }
            
            if (fk && json_is_object(fk)) {
                const char *fk_col;
                json_t *fk_ref;
                json_object_foreach(fk, fk_col, fk_ref) {
                    printf(",\n    FOREIGN KEY (%s) %s", fk_col, json_string_value(fk_ref));
                }
            }
            
            if (chk && json_is_string(chk)) {
                printf(",\n    CHECK (%s)", json_string_value(chk));
            }
        }
        
        printf("\n);\n");
        
        // Generate indexes
        if (indexes && json_is_object(indexes)) {
            const char *idx_name;
            json_t *idx_cols;
            json_object_foreach(indexes, idx_name, idx_cols) {
                printf("CREATE INDEX %s ON %s.%s (%s);\n", idx_name, schema, table_name, json_string_value(idx_cols));
            }
        }
        
        // Generate comments
        if (comments && json_is_object(comments)) {
            json_t *table_comment = json_object_get(comments, "table");
            if (table_comment && json_is_string(table_comment)) {
                printf("COMMENT ON TABLE %s.%s IS '%s';\n", schema, table_name, json_string_value(table_comment));
            }
            const char *col_name;
            json_t *col_comment;
            json_object_foreach(comments, col_name, col_comment) {
                if (strcmp(col_name, "table") != 0 && json_is_string(col_comment)) {
                    printf("COMMENT ON COLUMN %s.%s.%s IS '%s';\n", schema, table_name, col_name, json_string_value(col_comment));
                }
            }
        }
        printf("\n");
    }
}

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