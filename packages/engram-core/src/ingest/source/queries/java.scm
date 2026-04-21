; --- Top-level class declarations ---
(program (class_declaration
  (modifiers)? @symbol.class.vis
  name: (identifier) @symbol.class))

; --- Top-level interface declarations ---
(program (interface_declaration
  (modifiers)? @symbol.interface.vis
  name: (identifier) @symbol.interface))

; --- Top-level enum declarations ---
(program (enum_declaration
  (modifiers)? @symbol.enum.vis
  name: (identifier) @symbol.enum))

; --- Top-level record declarations ---
(program (record_declaration
  (modifiers)? @symbol.record.vis
  name: (identifier) @symbol.record))

; --- Top-level method declarations (inside class body, depth 1) ---
(program (class_declaration body: (class_body
  (method_declaration
    (modifiers)? @symbol.method.vis
    name: (identifier) @symbol.method))))

; --- Top-level field declarations (inside class body, depth 1) ---
(program (class_declaration body: (class_body
  (field_declaration
    (modifiers)? @symbol.field.vis
    declarator: (variable_declarator
      name: (identifier) @symbol.field)))))

; --- Import declarations ---
(import_declaration (scoped_identifier) @import.source)
