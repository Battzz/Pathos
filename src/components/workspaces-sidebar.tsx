import { cva } from "class-variance-authority";
import {
  IssueClosedIcon,
  IssueDraftIcon,
  XCircleFillIcon,
} from "@primer/octicons-react";
import {
  useEffect,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import {
  Archive,
  ChevronDown,
  BookMarked,
  GitBranch,
  Plus,
} from "lucide-react";
import {
  DEFAULT_WORKSPACE_GROUPS,
  loadWorkspaceGroups,
  type GroupTone,
  type WorkspaceGroup,
  type WorkspaceRow,
} from "../lib/conductor";
import { cn } from "../lib/utils";
import { TooltipProvider } from "./ui/tooltip";
import { BaseTooltip } from "./ui/base-tooltip";

const rowVariants = cva(
  "group relative flex h-9 select-none items-center gap-2 rounded-md px-3 text-[13px] cursor-pointer",
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

type ToolbarButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  className?: string;
  children: ReactNode;
};

function ToolbarButton({ label, className, children, ...props }: ToolbarButtonProps) {
  return (
    <button
      {...props}
      type="button"
      aria-label={label}
      className={cn(
        "flex size-7 cursor-pointer items-center justify-center bg-transparent text-app-foreground-soft/72 transition-colors hover:bg-transparent hover:text-app-foreground focus-visible:text-app-foreground",
        className,
      )}
    >
      {children}
    </button>
  );
}

function PartialCircleIcon({
  tone,
  inset,
  variant,
}: {
  tone: Extract<GroupTone, "review" | "progress">;
  inset: number;
  variant: "half-right" | "three-quarters";
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative block size-[14px] shrink-0 rounded-full border border-current",
        groupToneClasses[tone],
      )}
    >
      {variant === "half-right" ? (
        <span
          className="absolute rounded-r-full bg-current"
          style={{
            top: `${inset}px`,
            right: `${inset}px`,
            bottom: `${inset}px`,
            width: "4px",
          }}
        />
      ) : (
        <span
          className="absolute rounded-full bg-current"
          style={{
            inset: `${inset}px`,
            clipPath: "polygon(50% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 50%, 50% 50%)",
          }}
        />
      )}
    </span>
  );
}

function GroupIcon({ tone }: { tone: GroupTone }) {
  const className = cn("shrink-0", groupToneClasses[tone]);
  const iconSize = 14;

  switch (tone) {
    case "done":
      return <IssueClosedIcon className={className} size={iconSize} />;
    case "review":
      return <PartialCircleIcon tone="review" inset={2.25} variant="three-quarters" />;
    case "progress":
      return <PartialCircleIcon tone="progress" inset={2.5} variant="half-right" />;
    case "backlog":
      return <IssueDraftIcon className={className} size={iconSize} />;
    case "canceled":
      return <XCircleFillIcon className={className} size={iconSize} />;
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

      <BaseTooltip
        side="top"
        content={<span>Archive workspace</span>}
      >
        <button
          type="button"
          aria-label="Archive workspace"
          className="invisible flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-app-muted hover:bg-app-toolbar-hover hover:text-app-foreground group-hover:visible"
        >
          <Archive className="size-3.5" strokeWidth={1.9} />
        </button>
      </BaseTooltip>
    </div>
  );
}

export function WorkspacesSidebar() {
  const [groups, setGroups] = useState<WorkspaceGroup[]>(DEFAULT_WORKSPACE_GROUPS);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    done: true,
    review: true,
    progress: true,
    backlog: true,
    canceled: true,
  });

  useEffect(() => {
    let isDisposed = false;

    void loadWorkspaceGroups().then((loadedGroups) => {
      if (isDisposed) {
        return;
      }

      setGroups(loadedGroups);
      setOpenGroups((current) =>
        Object.fromEntries(
          loadedGroups.map((group) => [group.id, current[group.id] ?? true]),
        ),
      );
    });

    return () => {
      isDisposed = true;
    };
  }, []);

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
            <BaseTooltip
              side="top"
              content={<span>Add repository</span>}
            >
              <ToolbarButton label="Add repository" className="text-app-foreground-soft/78">
                <BookMarked className="size-3.5" strokeWidth={2} />
              </ToolbarButton>
            </BaseTooltip>

            <BaseTooltip
              side="top"
              content={<span>Add workspace</span>}
            >
              <ToolbarButton label="New workspace">
                <Plus className="size-3.5" strokeWidth={2.4} />
              </ToolbarButton>
            </BaseTooltip>
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
                  className={cn(
                    "group flex w-full select-none items-center justify-between rounded-xl px-1 py-1 text-[13px] font-semibold tracking-[-0.01em] text-app-foreground hover:bg-app-toolbar-hover/70",
                    canCollapse ? "cursor-pointer" : "cursor-default",
                  )}
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
