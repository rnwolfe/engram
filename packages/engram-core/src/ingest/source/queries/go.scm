; --- Top-level function declarations ---
(source_file (function_declaration name: (identifier) @symbol.function))

; --- Type declarations (struct, interface, type alias) ---
(source_file (type_declaration (type_spec name: (type_identifier) @symbol.type)))

; --- Const declarations (single and block) ---
(source_file (const_declaration (const_spec name: (identifier) @symbol.const)))

; --- Imports (both quoted and backtick forms include surrounding delimiters) ---
(import_spec path: [
  (interpreted_string_literal)
  (raw_string_literal)
] @import.source)

; --- SetupWithManager method declarations (controller-runtime) ---
; Captures the full method_declaration node for SetupWithManager methods so the
; extractor can walk the body and emit controller_watches / controller_owns edges.
(method_declaration
  receiver: (parameter_list) @setup.receiver
  name: (field_identifier) @setup.name
  (#eq? @setup.name "SetupWithManager")
  body: (block) @setup.body)

; --- Struct type declarations at file scope (kubebuilder RBAC markers) ---
; Captures the name of each struct type so the extractor can walk preceding sibling
; comments to find adjacent // +kubebuilder:rbac: markers.
(source_file
  (type_declaration
    (type_spec
      name: (type_identifier) @rbac.struct.name
      type: (struct_type))))
