; --- Top-level declarations (unexported) ---
(program (function_declaration name: (identifier) @symbol.function))
(program (class_declaration name: (type_identifier) @symbol.class))
(program (interface_declaration name: (type_identifier) @symbol.interface))
(program (type_alias_declaration name: (type_identifier) @symbol.type))
(program (enum_declaration name: (identifier) @symbol.enum))
(program (lexical_declaration (variable_declarator name: (identifier) @symbol.const)))

; --- Exported declarations ---
(program (export_statement declaration: (function_declaration name: (identifier) @symbol.function.exported)))
(program (export_statement declaration: (class_declaration name: (type_identifier) @symbol.class.exported)))
(program (export_statement declaration: (interface_declaration name: (type_identifier) @symbol.interface.exported)))
(program (export_statement declaration: (type_alias_declaration name: (type_identifier) @symbol.type.exported)))
(program (export_statement declaration: (enum_declaration name: (identifier) @symbol.enum.exported)))
(program (export_statement declaration: (lexical_declaration (variable_declarator name: (identifier) @symbol.const.exported))))

; --- Default export (identifier reference): export default someVar ---
; Note: export default function/class are already captured by the exported variants above
; via the `declaration:` field which tree-sitter-typescript uses for default declarations too.
(program (export_statement value: (identifier) @symbol.default.ref))

; --- Imports ---
(import_statement source: (string) @import.source)
