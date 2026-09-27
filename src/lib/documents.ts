export const DOCUMENTS = [
  {
    id: "description",
    title: "Project Description",
    empty: "What is this project about? Problem, motivation, core idea, research questions.",
  },
  {
    id: "status",
    title: "Current Status",
    empty: "Where is the project right now? Latest findings, open questions, blockers.",
  },
  { id: "papers", title: "Related Papers", empty: "No papers yet." },
  { id: "resources", title: "Useful Links & Resources", empty: "No links or resources yet." },
  {
    id: "related-projects",
    title: "Related Projects",
    empty: "Link other projects with [[Project Name]].",
  },
  {
    id: "artifacts",
    title: "Artifacts",
    empty: "Track research outputs under ## Ongoing and ## Finished.",
  },
  { id: "todos", title: "Todos", empty: "Use Markdown checkboxes: - [ ] Calibrate the sensors" },
  { id: "timeline", title: "Timeline", empty: "Key events and milestones, past and future." },
] as const;

export type DocumentId = (typeof DOCUMENTS)[number]["id"];

const DOCUMENT_IDS = new Set<string>(DOCUMENTS.map((d) => d.id));

export function isDocumentId(value: string): value is DocumentId {
  return DOCUMENT_IDS.has(value);
}

export function getDocumentInfo(id: DocumentId) {
  return DOCUMENTS.find((d) => d.id === id)!;
}

/** Initial content for documents in a newly created project. */
export const DOCUMENT_TEMPLATES: Partial<Record<DocumentId, string>> = {
  artifacts: "## Ongoing\n\n## Finished\n",
};

export function meetingTemplate(date: string): string {
  return `# Weekly Meeting — ${date}

## Updates

## Discussion

## Decisions

## Todos

## Open Questions
`;
}
