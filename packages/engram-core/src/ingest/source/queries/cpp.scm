; --- Top-level function definitions ---
(translation_unit (function_definition
  declarator: (function_declarator
    declarator: (identifier) @symbol.function_definition)))

; --- Top-level class specifiers ---
(translation_unit (class_specifier
  name: (type_identifier) @symbol.class_specifier))

; --- Top-level struct specifiers ---
(translation_unit (struct_specifier
  name: (type_identifier) @symbol.struct_specifier))

; --- Top-level enum specifiers ---
(translation_unit (enum_specifier
  name: (type_identifier) @symbol.enum_specifier))

; --- Top-level namespace definitions ---
(translation_unit (namespace_definition
  name: (namespace_identifier) @symbol.namespace_definition))

; --- #include directives ---
(preproc_include
  path: [
    (string_literal) @import.source
    (system_lib_string) @import.source
  ])
