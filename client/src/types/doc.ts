export interface StoredDoc {
  _id?: string;
  title: string;
  currentCID: string;
  cid?: string;
  versions: DocumentVersion[];
  createdAt?: string;
  updatedAt?: string;
}

export interface DocumentVersion {
  cid: string;
  timestamp: string;
  author?: string;
}

export interface AgentDocInput {
  name: string;
  description: string;
  model: string;
  strategy: string;
}

export interface ProseMirrorTextNode {
  type: "text";
  text: string;
}

export interface ProseMirrorHeadingNode {
  type: "heading";
  attrs: {
    level: number;
  };
  content: ProseMirrorTextNode[];
}

export interface ProseMirrorParagraphNode {
  type: "paragraph";
  content: ProseMirrorTextNode[];
}

export type ProseMirrorNode =
  | ProseMirrorHeadingNode
  | ProseMirrorParagraphNode;

export interface FileverseDocJSON {
  type: "doc";
  content: ProseMirrorNode[];
}
