; Capture the `name` keyword argument of any top-level rule call.
; @rule.name is the string_content node inside the name= string value.
(module
  (expression_statement
    (call
      (argument_list
        (keyword_argument
          name: (identifier) @_name_key
          value: (string
            (string_content) @rule.name))
        (#eq? @_name_key "name")))))

; Capture individual string-literal entries inside a `deps` list.
; @dep.entry is the string_content node for each string dep.
; Non-string entries (select(), variables, concatenation) are not matched and silently skipped.
(module
  (expression_statement
    (call
      (argument_list
        (keyword_argument
          name: (identifier) @_deps_key
          value: (list
            (string
              (string_content) @dep.entry)))
        (#eq? @_deps_key "deps")))))
