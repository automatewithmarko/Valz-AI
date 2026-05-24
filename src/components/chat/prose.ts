// Shared Tailwind prose classes for the assistant message bubble.
// Tuned for Claude's markdown habits — headings, nested lists, blockquotes,
// inline code, tables — so the bubble feels typeset rather than dumped.

export const assistantProseClass = [
  // Base typography
  "prose prose-sm prose-invert max-w-none text-white",
  // Paragraphs
  "prose-p:leading-relaxed prose-p:my-2 prose-p:text-white/95",
  // Strong / em
  "prose-strong:text-white prose-strong:font-semibold prose-em:text-white/95",
  // Headings — keep them inline-feeling rather than document-feeling
  "prose-headings:text-white prose-headings:font-semibold",
  "prose-headings:mt-4 prose-headings:mb-2 prose-headings:tracking-tight",
  "prose-h1:text-base prose-h2:text-base prose-h3:text-sm prose-h4:text-sm",
  "prose-h1:first:mt-0 prose-h2:first:mt-0 prose-h3:first:mt-0",
  // Lists
  "prose-ul:my-2 prose-ul:pl-5 prose-ol:my-2 prose-ol:pl-5",
  "prose-li:my-0.5 prose-li:text-white/95",
  "marker:text-[#c08967]",
  // Blockquotes — soft accent on the left, italic muted
  "prose-blockquote:border-l-2 prose-blockquote:border-[#c08967]/60",
  "prose-blockquote:pl-3 prose-blockquote:not-italic prose-blockquote:text-white/85",
  "prose-blockquote:my-2",
  // Inline code
  "prose-code:bg-white/10 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded",
  "prose-code:text-[#f2dacb] prose-code:font-mono prose-code:text-[0.85em]",
  "prose-code:before:hidden prose-code:after:hidden",
  // Code blocks
  "prose-pre:bg-black/30 prose-pre:border prose-pre:border-white/10",
  "prose-pre:my-3 prose-pre:rounded-lg prose-pre:p-3",
  // Links
  "prose-a:text-[#f2dacb] prose-a:underline prose-a:underline-offset-2 hover:prose-a:text-white",
  // Tables
  "prose-table:text-sm prose-th:py-2 prose-th:px-3 prose-th:text-white",
  "prose-th:border-b prose-th:border-white/20",
  "prose-td:py-2 prose-td:px-3 prose-td:text-white/90",
  "prose-tr:border-white/10",
  // HR
  "prose-hr:border-white/20 prose-hr:my-4",
].join(" ");
