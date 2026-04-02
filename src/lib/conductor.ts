export type GroupTone = "done" | "review" | "progress" | "backlog" | "canceled";

export type WorkspaceRow = {
  id: string;
  title: string;
  avatar: string;
  active?: boolean;
  directoryName?: string;
  repoName?: string;
  state?: string;
  derivedStatus?: string;
  manualStatus?: string | null;
  branch?: string | null;
  activeSessionId?: string | null;
  activeSessionTitle?: string | null;
  activeSessionAgentType?: string | null;
  activeSessionStatus?: string | null;
  prTitle?: string | null;
  sessionCount?: number;
  messageCount?: number;
  attachmentCount?: number;
};

export type WorkspaceGroup = {
  id: string;
  label: string;
  tone: GroupTone;
  rows: WorkspaceRow[];
};

export type ConductorFixtureInfo = {
  dataMode: string;
  fixtureRoot: string;
  dbPath: string;
  archiveRoot: string;
};

const DEFAULT_WORKSPACE_GROUPS: WorkspaceGroup[] = [
  {
    id: "done",
    label: "Done",
    tone: "done",
    rows: [
      {
        id: "task-detail",
        title: "feat: task detail window with e...",
        avatar: "F",
      },
    ],
  },
  {
    id: "review",
    label: "In review",
    tone: "review",
    rows: [
      {
        id: "coda-publish",
        title: "feat: add Coda publish function...",
        avatar: "F",
      },
      {
        id: "marketing-site",
        title: "Implement new marketing site ...",
        avatar: "I",
      },
      {
        id: "gitlab-publish",
        title: "feat: add GitLab publish suppor...",
        avatar: "F",
      },
    ],
  },
  {
    id: "progress",
    label: "In progress",
    tone: "progress",
    rows: [
      {
        id: "cambridge",
        title: "Cambridge",
        avatar: "C",
      },
      {
        id: "project-paths",
        title: "Show project paths",
        avatar: "S",
        active: true,
      },
      {
        id: "mermaid",
        title: "Investigate mermaid confluence",
        avatar: "I",
      },
      {
        id: "seo",
        title: "Feat seo optimization",
        avatar: "F",
      },
      {
        id: "autoresearch",
        title: "Explore autoresearch",
        avatar: "E",
      },
      {
        id: "chat-list",
        title: "Fix chat list pending",
        avatar: "F",
      },
      {
        id: "doc-sync",
        title: "Investigate doc sync",
        avatar: "I",
      },
    ],
  },
  {
    id: "backlog",
    label: "Backlog",
    tone: "backlog",
    rows: [],
  },
  {
    id: "canceled",
    label: "Canceled",
    tone: "canceled",
    rows: [],
  },
];

type TauriInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

async function getTauriInvoke(): Promise<TauriInvoke | null> {
  try {
    const api = await import("@tauri-apps/api/core");
    return api.invoke as TauriInvoke;
  } catch {
    return null;
  }
}

export async function loadWorkspaceGroups(): Promise<WorkspaceGroup[]> {
  const invoke = await getTauriInvoke();

  if (!invoke) {
    return DEFAULT_WORKSPACE_GROUPS;
  }

  try {
    return await invoke<WorkspaceGroup[]>("list_workspace_groups");
  } catch {
    return DEFAULT_WORKSPACE_GROUPS;
  }
}

export async function loadFixtureInfo(): Promise<ConductorFixtureInfo | null> {
  const invoke = await getTauriInvoke();

  if (!invoke) {
    return null;
  }

  try {
    return await invoke<ConductorFixtureInfo>("get_conductor_fixture_info");
  } catch {
    return null;
  }
}

export { DEFAULT_WORKSPACE_GROUPS };
