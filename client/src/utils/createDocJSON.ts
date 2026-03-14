import type {
  AgentDocInput,
  FileverseDocJSON,
  ProseMirrorHeadingNode,
  ProseMirrorParagraphNode,
  ProseMirrorTextNode,
} from "../types/doc";

function textNode(value: string): ProseMirrorTextNode {
  const normalized = String(value ?? "").trim();
  return {
    type: "text",
    text: normalized.length > 0 ? normalized : "Not provided",
  };
}

function heading(level: number, value: string): ProseMirrorHeadingNode {
  return {
    type: "heading",
    attrs: { level },
    content: [textNode(value)],
  };
}

function paragraph(value: string): ProseMirrorParagraphNode {
  return {
    type: "paragraph",
    content: [textNode(value)],
  };
}

export function createAgentDoc(agent: AgentDocInput): FileverseDocJSON {
  return {
    type: "doc",
    content: [
      heading(1, agent.name),
      heading(2, "Description"),
      paragraph(agent.description),
      heading(2, "Model"),
      paragraph(agent.model),
      heading(2, "Strategy"),
      paragraph(agent.strategy),
    ],
  };
}
