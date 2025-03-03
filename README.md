# AutoSchema

AutoSchema generates PostgreSQL schema DDL from a JSON file (`autoschema.json`). It supports a wide range of data types, relationships, and file variations with MIME type checking.

## Features
- **Data Types**: `Char(n)`, `Int`, `Bool`, `DateTime`, `File`, `Image`, `PDF`, `Document`, `Video`, `Audio`, etc.
- **Relationships**: Primary keys, foreign keys, unique constraints, many-to-many via junction tables.
- **Extras**: Enums, arrays, JSON/JSONB, generated columns, indexes, comments.
- **File Variations**: Each file field (`File`, `Image`, etc.) includes a `mime_type` column with `CHECK` constraints for valid MIME types.
- **Automatic Fields**: `id SERIAL`, `hide BOOLEAN`, `delete BOOLEAN`.

## Requirements
- `libjansson` (JSON parsing library)
  - Install on Ubuntu: `sudo apt-get install libjansson-dev`

## Compilation
```bash
gcc -o autoschema autoschema.c -ljansson
```
## Usage

  1. Edit autoschema.json to define your schema.
  2. Run the generator:
  ```bash
  
  ./autoschema > autoschema.sql
  ```
  3. Use autoschema.sql with PostgreSQL:
```bash

psql -U your_user -d your_db -f autoschema.sql
```
## File Fields
- File fields (File, Image, PDF, Document, Video, Audio) are stored as TEXT (file paths) with a companion mime_type column.

- MIME types are validated via CHECK constraints:
  - **File**: Any valid MIME type (e.g., application/*, image/*).

  - **Image**: image/jpeg, image/png, image/gif, image/webp.

  - **PDF **: application/pdf.

  - **Document**: application/msword, application/vnd.openxmlformats-officedocument.wordprocessingml.document, text/plain.

  - **Video**: video/mp4, video/webm, video/ogg.

  - **Audio**: audio/mpeg, audio/wav, audio/ogg.

* To store binary data instead of paths, edit map_type_to_postgres in autoschema.c to use BYTEA for file types.

## Example
See autoschema.json for a comprehensive example including file variations with MIME type checking and relationships.
## Notes
- The generated schema assumes file paths in TEXT. For binary data, modify map_type_to_postgres to use BYTEA.

- Application logic should populate mime_type columns based on file content.

- Contributions welcome!


### GitHub Repository Structure
```
autoschema/
├── autoschema.c      # The C source code
├── autoschema.json   # The example JSON schema
├── README.md         # Instructions and documentation
└── autoschema.sql    # Optional: Generated output (for reference)
```
