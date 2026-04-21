; --- Top-level function definitions ---
(source_file (function_item (visibility_modifier) name: (identifier) @symbol.fn.exported))
(source_file (function_item name: (identifier) @symbol.fn))

; --- Top-level struct definitions ---
(source_file (struct_item (visibility_modifier) name: (type_identifier) @symbol.struct.exported))
(source_file (struct_item name: (type_identifier) @symbol.struct))

; --- Top-level enum definitions ---
(source_file (enum_item (visibility_modifier) name: (type_identifier) @symbol.enum.exported))
(source_file (enum_item name: (type_identifier) @symbol.enum))

; --- Top-level trait definitions ---
(source_file (trait_item (visibility_modifier) name: (type_identifier) @symbol.trait.exported))
(source_file (trait_item name: (type_identifier) @symbol.trait))

; --- Top-level type aliases ---
(source_file (type_item (visibility_modifier) name: (type_identifier) @symbol.type_alias.exported))
(source_file (type_item name: (type_identifier) @symbol.type_alias))

; --- Top-level const declarations ---
(source_file (const_item (visibility_modifier) name: (identifier) @symbol.const.exported))
(source_file (const_item name: (identifier) @symbol.const))

; --- Top-level static declarations ---
(source_file (static_item (visibility_modifier) name: (identifier) @symbol.static.exported))
(source_file (static_item name: (identifier) @symbol.static))

; --- Use declarations (imports) ---
(use_declaration argument: (scoped_identifier) @import.source)
(use_declaration argument: (identifier) @import.source)
(use_declaration argument: (scoped_use_list) @import.source)
(use_declaration argument: (use_wildcard) @import.source)
