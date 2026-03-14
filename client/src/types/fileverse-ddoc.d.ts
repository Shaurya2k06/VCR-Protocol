declare module "@fileverse-dev/ddoc" {
  import type { ComponentType } from "react";

  export interface DdocEditorProps {
    initialContent?: unknown;
    onChange?: (doc: unknown) => void;
    isPreviewMode?: boolean;
    editorCanvasClassNames?: string;
    documentStyling?: {
      canvasBackground?: string;
      textColor?: string;
      fontFamily?: string;
    };
  }

  export const DdocEditor: ComponentType<DdocEditorProps>;
}

declare module "@fileverse-dev/ddoc/styles";
