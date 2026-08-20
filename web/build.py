#!/usr/bin/env python3
"""Assemble the three source files into one self-contained index.html."""
import pathlib

root = pathlib.Path(__file__).parent

css = (root / "style.css").read_text()
gen = (root / "generator.js").read_text()
lint = (root / "lint.js").read_text()
ui = (root / "ui.js").read_text()
schema = (root / ".." / "schema.json").read_text().strip()

ui = ui.replace("__FULL_SCHEMA__", schema)

html = (root / "template.html").read_text()
html = html.replace("/*__CSS__*/", css)
html = html.replace("/*__GENERATOR__*/", gen)
html = html.replace("/*__LINT__*/", lint)
html = html.replace("/*__UI__*/", ui)

(root / "index.html").write_text(html)
print("built index.html —", len(html), "bytes")
