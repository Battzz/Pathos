import { cva } from "class-variance-authority";
import { useState, type ReactNode } from "react";
import {
  Archive,
  CheckCircle2,
  ChevronDown,
  Circle,
  CircleDashed,
  CircleX,
  FilePlus2,
  GitBranch,
  ListFilter,
  Plus,
} from "lucide-react";
import { cn } from "../lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";

type GroupTone = "done" | "review" | "progress" | "backlog" | "canceled";

type WorkspaceRow = {
  id: string;
  title: string;
  avatar: string;
  active?: boolean;
};

type WorkspaceGroup = {
  id: string;
  label: string;
  tone: GroupTone;
  rows: WorkspaceRow[];
};

const groups: WorkspaceGroup[] = [
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

const rowVariants = cva(
  "group relative flex h-9 items-center gap-2 rounded-md px-3 text-[13px] cursor-pointer",
  {
    variants: {
      active: {
        true: "bg-app-row-selected text-app-foreground",
        false: "text-app-foreground-soft hover:bg-app-row-hover",
      },
    },
    defaultVariants: {
      active: false,
    },
  },
);

const groupToneClasses: Record<GroupTone, string> = {
  done: "text-app-done",
  review: "text-app-review",
  progress: "text-app-progress",
  backlog: "text-app-backlog",
  canceled: "text-app-canceled",
};

function ShortcutHint({ keys }: { keys: string }) {
  return (
    <span className="ml-4 shrink-0 text-[13px] tracking-[0.04em] text-app-foreground-soft/70">
      {keys}
    </span>
  );
}

function ToolbarButton({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cn(
        "flex size-8 items-center justify-center rounded-lg text-app-foreground-soft/80 hover:bg-app-toolbar-hover hover:text-app-foreground",
        className,
      )}
    >
      {children}
    </button>
  );
}

function GroupIcon({ tone }: { tone: GroupTone }) {
  const className = cn("size-[14px] shrink-0", groupToneClasses[tone]);

  switch (tone) {
    case "done":
      return <CheckCircle2 className={className} strokeWidth={1.9} />;
    case "review":
      return <CheckCircle2 className={className} strokeWidth={1.9} />;
    case "progress":
      return <Circle className={className} strokeWidth={2.2} />;
    case "backlog":
      return <CircleDashed className={className} strokeWidth={1.8} />;
    case "canceled":
      return <CircleX className={className} strokeWidth={1.8} />;
  }
}

function WorkspaceAvatar({ letter }: { letter: string }) {
  return (
    <span
      aria-hidden="true"
      data-slot="workspace-avatar"
      className="flex size-4 shrink-0 items-center justify-center rounded-[5px] border border-app-border-strong bg-app-sidebar-strong text-[9px] font-semibold uppercase tracking-[0.02em] text-app-foreground-soft"
    >
      {letter}
    </span>
  );
}

function WorkspaceRowItem({ row }: { row: WorkspaceRow }) {
  return (
    <div
      aria-label={row.title}
      data-active={row.active ? "true" : "false"}
      className={cn(rowVariants({ active: row.active }))}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <WorkspaceAvatar letter={row.avatar} />
        <GitBranch className="size-[13px] shrink-0 text-app-warm" strokeWidth={1.9} />
        <span
          className={cn(
            "truncate leading-none",
            row.active ? "font-semibold text-app-foreground" : "font-medium",
          )}
        >
          {row.title}
        </span>
      </div>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="Archive workspace"
            className="invisible flex size-6 shrink-0 items-center justify-center rounded-md text-app-muted hover:bg-app-toolbar-hover hover:text-app-foreground group-hover:visible"
          >
            <Archive className="size-3.5" strokeWidth={1.9} />
          </button>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          className="flex items-center rounded-md px-1.5 py-1 text-[11px] leading-none"
        >
          <span>Archive workspace</span>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

export function WorkspacesSidebar() {
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    done: true,
    review: true,
    progress: true,
    backlog: true,
    canceled: true,
  });

  return (
    <TooltipProvider>
      <div className="flex h-full min-h-screen flex-col pb-4">
        <div
          data-slot="window-safe-top"
          className="flex h-11 shrink-0 items-center pr-3"
        >
          <div data-tauri-drag-region className="h-full w-[94px] shrink-0" />

          <div data-tauri-drag-region className="h-full flex-1" />
        </div>

        <div className="flex items-center justify-between px-3">
          <h2 className="text-[13px] font-medium tracking-[-0.01em] text-app-foreground-soft">
            Workspaces
          </h2>

          <div className="flex items-center gap-1 text-app-foreground-soft/80">
            <ToolbarButton label="Filter workspaces">
              <ListFilter className="size-3.5" strokeWidth={1.9} />
            </ToolbarButton>

            <Tooltip>
              <TooltipTrigger asChild>
                <ToolbarButton
                  label="Add repository"
                  className="border border-app-border bg-app-sidebar-strong text-app-foreground"
                >
                  <FilePlus2 className="size-4" strokeWidth={1.9} />
                </ToolbarButton>
              </TooltipTrigger>
              <TooltipContent side="top" className="flex items-center">
                <span>Add repository</span>
                <ShortcutHint keys="⌘⇧A" />
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <ToolbarButton label="New workspace">
                  <Plus className="size-4" strokeWidth={2.1} />
                </ToolbarButton>
              </TooltipTrigger>
              <TooltipContent side="top" className="flex items-center">
                <span>New workspace</span>
                <ShortcutHint keys="⌘N" />
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-4 px-2">
          {groups.map((group) => {
            const isOpen = openGroups[group.id];
            const canCollapse = group.rows.length > 0;

            return (
              <section key={group.id} aria-label={group.label} className="space-y-1.5">
                <button
                  type="button"
                  aria-label={group.label}
                  onClick={() => {
                    if (!canCollapse) return;
                    setOpenGroups((current) => ({
                      ...current,
                      [group.id]: !current[group.id],
                    }));
                  }}
                  className="flex w-full items-center justify-between rounded-xl px-1 py-1 text-[13px] font-semibold tracking-[-0.01em] text-app-foreground hover:bg-app-toolbar-hover/70"
                >
                  <span className="flex items-center gap-2">
                    <GroupIcon tone={group.tone} />
                    <span>{group.label}</span>
                  </span>

                  {canCollapse ? (
                    <ChevronDown
                      className={cn(
                        "size-4 shrink-0 text-app-foreground-soft transition-transform",
                        !isOpen && "-rotate-90",
                      )}
                      strokeWidth={2}
                    />
                  ) : null}
                </button>

                {isOpen && group.rows.length > 0 ? (
                  <div className="space-y-0.5">
                    {group.rows.map((row) => (
                      <WorkspaceRowItem key={row.id} row={row} />
                    ))}
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      </div>
    </TooltipProvider>
  );
}
