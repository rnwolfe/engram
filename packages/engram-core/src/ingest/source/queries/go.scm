; --- Top-level function declarations ---
(source_file (function_declaration name: (identifier) @symbol.function))

; --- Type declarations (struct, interface, type alias) ---
(source_file (type_declaration (type_spec name: (type_identifier) @symbol.type)))

; --- Const declarations (single and block) ---
(source_file (const_declaration (const_spec name: (identifier) @symbol.const)))

; --- Imports (interpreted string literals include surrounding quotes) ---
(import_spec path: (interpreted_string_literal) @import.source)
