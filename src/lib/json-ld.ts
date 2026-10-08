/**
 * JSON for an inline <script type="application/ld+json">. The output is still valid JSON, but
 * "<", ">", "&" and U+2028/U+2029 are written as \u escapes, so a title like
 * "</script><script>..." can never close the script tag (TanStack/React inject this text unescaped).
 */
export function jsonLdString(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
