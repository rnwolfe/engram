; --- Top-level class declarations ---
(compilation_unit (class_declaration
  (modifier)* @symbol.class_declaration.vis
  name: (identifier) @symbol.class_declaration))

; --- Top-level interface declarations ---
(compilation_unit (interface_declaration
  (modifier)* @symbol.interface_declaration.vis
  name: (identifier) @symbol.interface_declaration))

; --- Top-level enum declarations ---
(compilation_unit (enum_declaration
  (modifier)* @symbol.enum_declaration.vis
  name: (identifier) @symbol.enum_declaration))

; --- Top-level struct declarations ---
(compilation_unit (struct_declaration
  (modifier)* @symbol.struct_declaration.vis
  name: (identifier) @symbol.struct_declaration))

; --- Top-level record declarations ---
(compilation_unit (record_declaration
  (modifier)* @symbol.record_declaration.vis
  name: (identifier) @symbol.record_declaration))

; --- Methods inside top-level class bodies ---
(compilation_unit (class_declaration body: (declaration_list
  (method_declaration
    (modifier)* @symbol.method_declaration.vis
    name: (identifier) @symbol.method_declaration))))

; --- Using directives ---
(using_directive [(identifier) (qualified_name)] @import.source)
