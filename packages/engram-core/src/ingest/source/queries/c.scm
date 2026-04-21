; --- Top-level function definitions ---
(translation_unit (function_definition
  declarator: (function_declarator
    declarator: (identifier) @symbol.function_definition)))

; --- Top-level struct specifiers with a name ---
(translation_unit (struct_specifier
  name: (type_identifier) @symbol.struct_specifier))

; --- Top-level enum specifiers with a name ---
(translation_unit (enum_specifier
  name: (type_identifier) @symbol.enum_specifier))

; --- Top-level typedef declarations (struct/union/named alias) ---
(translation_unit (type_definition
  declarator: (type_identifier) @symbol.typedef_declaration))

; --- Top-level typedef of primitive types
;     e.g. typedef unsigned int uint32_t; ---
(translation_unit (type_definition
  (primitive_type) @symbol.typedef_declaration .))

; --- #include directives ---
(preproc_include
  path: [
    (string_literal) @import.source
    (system_lib_string) @import.source
  ])
