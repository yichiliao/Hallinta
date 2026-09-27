"use client";

import { useEffect, useMemo, useRef } from "react";
import CodeMirror, { EditorView, Prec, keymap } from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";

export default function MarkdownEditor({
  value,
  onChange,
  onSave,
  onCancel,
}: {
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const handlers = useRef({ onSave, onCancel });
  useEffect(() => {
    handlers.current = { onSave, onCancel };
  });

  const extensions = useMemo(
    () => [
      markdown(),
      EditorView.lineWrapping,
      Prec.highest(
        keymap.of([
          {
            key: "Mod-s",
            preventDefault: true,
            run: () => {
              handlers.current.onSave();
              return true;
            },
          },
          {
            key: "Escape",
            run: () => {
              handlers.current.onCancel();
              return true;
            },
          },
        ]),
      ),
    ],
    [],
  );

  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      extensions={extensions}
      autoFocus
      minHeight="10rem"
      basicSetup={{
        lineNumbers: false,
        foldGutter: false,
        highlightActiveLine: false,
        highlightActiveLineGutter: false,
      }}
      className="hallinta-editor overflow-hidden rounded-md border border-stone-300 bg-white focus-within:border-stone-500"
    />
  );
}
