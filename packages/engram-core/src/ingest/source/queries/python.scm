; --- Top-level function definitions ---
(module (function_definition name: (identifier) @symbol.function))

; --- Top-level class definitions ---
(module (class_definition name: (identifier) @symbol.class))

; --- Decorated top-level definitions ---
(module (decorated_definition (function_definition name: (identifier) @symbol.function)))
(module (decorated_definition (class_definition name: (identifier) @symbol.class)))

; --- Imports (dotted_name text has no quotes) ---
(import_statement (dotted_name) @import.source)
(import_from_statement (dotted_name) @import.source)
