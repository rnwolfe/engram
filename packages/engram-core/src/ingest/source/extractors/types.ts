/** A top-level symbol found in a source file. */
export interface ExtractedSymbol {
  name: string;
  kind:
    | "function"
    | "class"
    | "interface"
    | "type"
    | "enum"
    | "const"
    | "default";
  exported: boolean;
  startByte: number;
  endByte: number;
}

/** The result of extracting symbols and imports from a single file. */
export interface ExtractedFile {
  symbols: ExtractedSymbol[];
  /** Raw import specifier strings. Format is language-specific. */
  rawImports: string[];
}
