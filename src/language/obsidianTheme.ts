import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import type { Extension } from "@codemirror/state";

const themedView = EditorView.theme({
  "&": {
    backgroundColor: "var(--background-primary)",
    color: "var(--text-normal)",
    height: "100%",
    fontFamily: "var(--font-monospace)",
    fontSize: "var(--font-text-size)",
  },
  ".cm-scroller": {
    fontFamily: "var(--font-monospace)",
    overflow: "auto",
  },
  ".cm-content": {
    caretColor: "var(--text-normal)",
  },
  ".cm-gutters": {
    backgroundColor: "var(--background-secondary)",
    color: "var(--text-faint)",
    border: "none",
    borderRight: "1px solid var(--background-modifier-border)",
  },
  ".cm-activeLine": {
    backgroundColor: "var(--background-modifier-hover)",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "var(--background-modifier-hover)",
    color: "var(--text-normal)",
  },
  ".cm-selectionBackground, ::selection": {
    backgroundColor: "var(--text-selection) !important",
  },
  ".cm-cursor": { display: "none" },
  ".cm-matchingBracket": {
    backgroundColor: "var(--background-modifier-active-hover)",
    outline: "1px solid var(--text-accent)",
  },
  ".cm-searchMatch": {
    backgroundColor: "var(--text-highlight-bg)",
  },
  ".cm-searchMatch.cm-searchMatch-selected": {
    backgroundColor: "var(--text-accent)",
    color: "var(--text-on-accent)",
  },
  ".cm-foldPlaceholder": {
    backgroundColor: "var(--background-secondary-alt)",
    color: "var(--text-muted)",
    border: "1px solid var(--background-modifier-border)",
    borderRadius: "3px",
    padding: "0 4px",
  },
});

const highlightStyle = HighlightStyle.define([
  { tag: t.keyword, color: "var(--code-keyword, var(--text-accent))" },
  { tag: [t.name, t.deleted, t.character, t.macroName], color: "var(--text-normal)" },
  { tag: [t.propertyName], color: "var(--code-property, var(--text-normal))" },
  { tag: [t.string, t.special(t.string)], color: "var(--code-string, #98c379)" },
  { tag: [t.function(t.variableName), t.labelName], color: "var(--code-function, var(--text-accent))" },
  { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: "var(--code-keyword, var(--text-accent))" },
  { tag: [t.definition(t.name), t.separator], color: "var(--text-normal)" },
  { tag: [t.typeName], color: "var(--code-type, var(--text-accent-hover))" },
  { tag: [t.className], color: "var(--code-type, var(--text-accent-hover))" },
  { tag: [t.number, t.bool, t.null], color: "var(--code-value, #d19a66)" },
  { tag: [t.operator, t.operatorKeyword], color: "var(--code-operator, var(--text-muted))" },
  { tag: [t.url, t.escape, t.regexp, t.link], color: "var(--code-string, #98c379)" },
  { tag: [t.meta, t.comment], color: "var(--code-comment, var(--text-faint))", fontStyle: "italic" },
  { tag: t.tagName, color: "var(--code-tag, var(--text-accent))" },
  { tag: t.attributeName, color: "var(--code-property, var(--text-accent-hover))" },
  { tag: t.attributeValue, color: "var(--code-string, #98c379)" },
  { tag: t.heading, fontWeight: "bold" },
  { tag: t.strong, fontWeight: "bold" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strikethrough, textDecoration: "line-through" },
  { tag: t.invalid, color: "var(--text-error)" },
]);

export function obsidianTheme(): Extension {
  return [themedView, syntaxHighlighting(highlightStyle)];
}
