; --- Top-level function definitions ---
(module (function_definition name: (identifier) @symbol.function))

; --- Top-level class definitions ---
(module (class_definition name: (identifier) @symbol.class))

; --- Decorated top-level definitions ---
(module (decorated_definition (function_definition name: (identifier) @symbol.function)))
(module (decorated_definition (class_definition name: (identifier) @symbol.class)))

; --- Imports ---
; Simple: import os
(import_statement (dotted_name) @import.source)
; Aliased: import os as o
(import_statement (aliased_import (dotted_name) @import.source))
; From: from pathlib import Path
(import_from_statement (dotted_name) @import.source)
; Relative: from . import foo
(import_from_statement (relative_import) @import.source)
; Aliased from: from os import path as p
(import_from_statement (aliased_import (dotted_name) @import.source))
