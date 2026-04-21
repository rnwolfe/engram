; --- Top-level class definitions ---
(program (class
  name: [(constant) (scope_resolution)] @symbol.class))

; --- Top-level module definitions ---
(program (module
  name: [(constant) (scope_resolution)] @symbol.module))

; --- Top-level method definitions (def) ---
(program (method
  name: [(identifier) (operator)] @symbol.method))

; --- Top-level singleton method definitions ---
(program (singleton_method
  name: [(identifier) (operator)] @symbol.singleton_method))

; --- Require / require_relative calls ---
(call
  method: (identifier) @_fn
  arguments: (argument_list (string
    (string_content) @import.source))
  (#match? @_fn "^require(_relative)?$"))
