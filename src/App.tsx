import "./App.css";
import {
  type ButtonHTMLAttributes,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  useEffect,
  useState,
} from "react";
import {
  ArrowUp,
  BookOpen,
  BrainCircuit,
  LoaderCircle,
  Plus,
  Sparkles,
  Zap,
} from "lucide-react";
import { cn } from "./lib/utils";
import { WorkspacesSidebar } from "./components/workspaces-sidebar";

const SIDEBAR_WIDTH_STORAGE_KEY = "helmor.workspaceSidebarWidth";
const DEFAULT_SIDEBAR_WIDTH = 288;
const MIN_SIDEBAR_WIDTH = 220;
const MAX_SIDEBAR_WIDTH = 520;
const SIDEBAR_RESIZE_STEP = 16;

function clampSidebarWidth(width: number) {
  return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, width));
}

function getInitialSidebarWidth() {
  if (typeof window === "undefined") {
    return DEFAULT_SIDEBAR_WIDTH;
  }

  try {
    const storedWidth = window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);

    if (!storedWidth) {
      return DEFAULT_SIDEBAR_WIDTH;
    }

    const parsedWidth = Number.parseInt(storedWidth, 10);

    return Number.isFinite(parsedWidth)
      ? clampSidebarWidth(parsedWidth)
      : DEFAULT_SIDEBAR_WIDTH;
  } catch {
    return DEFAULT_SIDEBAR_WIDTH;
  }
}

type ComposerButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  className?: string;
};

function ComposerButton({
  children,
  className,
  ...props
}: ComposerButtonProps) {
  return (
    <button
      {...props}
      type="button"
      className={cn(
        "flex items-center gap-1.5 rounded-lg text-app-foreground-soft transition-colors hover:text-app-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-app-border-strong",
        className,
      )}
    >
      {children}
    </button>
  );
}

function WorkspaceComposer() {
  return (
    <div
      aria-label="Workspace composer"
      className="flex min-h-[132px] flex-col rounded-[14px] border border-app-border-strong bg-app-sidebar px-4 pb-3 pt-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
    >
      <label htmlFor="workspace-input" className="sr-only">
        Workspace input
      </label>

      <textarea
        id="workspace-input"
        aria-label="Workspace input"
        placeholder="Ask to make changes, @mention files, run /commands"
        className="min-h-[64px] flex-1 resize-none bg-transparent text-[14px] leading-5 tracking-[-0.01em] text-app-foreground outline-none placeholder:text-app-muted"
      />

      <div className="mt-2.5 flex items-end justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1">
          <ComposerButton
            aria-label="Model selector"
            className="gap-1.5 px-1 py-0.5 text-[13px] font-medium"
          >
            <Sparkles className="size-[14px]" strokeWidth={1.8} />
            <span>Opus 4.6</span>
          </ComposerButton>

          <ComposerButton
            aria-label="Quick command"
            className="justify-center p-1"
          >
            <Zap className="size-[15px]" strokeWidth={1.9} />
          </ComposerButton>

          <ComposerButton
            aria-label="Reasoning mode"
            className="gap-1.5 rounded-md bg-app-sidebar-strong px-2.5 py-1 text-[13px] font-medium text-app-foreground-soft hover:text-app-foreground"
          >
            <BrainCircuit className="size-[14px]" strokeWidth={1.8} />
            <span>Thinking</span>
          </ComposerButton>

          <ComposerButton
            aria-label="References"
            className="justify-center p-1"
          >
            <BookOpen className="size-[15px]" strokeWidth={1.8} />
          </ComposerButton>
        </div>

        <div className="flex items-center gap-1">
          <ComposerButton
            aria-label="Activity"
            className="justify-center p-1"
          >
            <LoaderCircle className="size-[15px]" strokeWidth={1.8} />
          </ComposerButton>

          <ComposerButton
            aria-label="Add attachment"
            className="justify-center p-1"
          >
            <Plus className="size-4" strokeWidth={1.8} />
          </ComposerButton>

          <button
            type="button"
            aria-label="Send"
            className="flex size-8 items-center justify-center rounded-[9px] border border-app-border-strong bg-app-sidebar-strong text-app-foreground transition-transform hover:-translate-y-px focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-app-border-strong"
          >
            <ArrowUp className="size-[15px]" strokeWidth={2.2} />
          </button>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [sidebarWidth, setSidebarWidth] = useState(getInitialSidebarWidth);
  const [resizeState, setResizeState] = useState<{
    pointerX: number;
    sidebarWidth: number;
  } | null>(null);
  const isResizing = resizeState !== null;

  useEffect(() => {
    try {
      window.localStorage.setItem(
        SIDEBAR_WIDTH_STORAGE_KEY,
        String(sidebarWidth),
      );
    } catch {
      // Ignore storage failures and keep the current in-memory width.
    }
  }, [sidebarWidth]);

  useEffect(() => {
    if (!resizeState) {
      return;
    }

    const handleMouseMove = (event: globalThis.MouseEvent) => {
      setSidebarWidth(
        clampSidebarWidth(
          resizeState.sidebarWidth + event.clientX - resizeState.pointerX,
        ),
      );
    };
    const handleMouseUp = () => {
      setResizeState(null);
    };
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [resizeState]);

  const handleResizeStart = (event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    setResizeState({
      pointerX: event.clientX,
      sidebarWidth,
    });
  };

  const handleResizeKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setSidebarWidth((currentWidth) =>
        clampSidebarWidth(currentWidth - SIDEBAR_RESIZE_STEP),
      );
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      setSidebarWidth((currentWidth) =>
        clampSidebarWidth(currentWidth + SIDEBAR_RESIZE_STEP),
      );
    }
  };

  return (
    <main
      aria-label="Application shell"
      className="relative min-h-screen overflow-hidden bg-app-base font-sans text-app-foreground antialiased"
      data-theme="volta-dark"
    >
      <div className="flex min-h-screen bg-app-base">
        <aside
          aria-label="Workspace sidebar"
          className="relative shrink-0 bg-app-sidebar"
          style={{ width: `${sidebarWidth}px` }}
        >
          <WorkspacesSidebar />

          <div
            role="separator"
            tabIndex={0}
            aria-label="Resize sidebar"
            aria-orientation="vertical"
            aria-valuemin={MIN_SIDEBAR_WIDTH}
            aria-valuemax={MAX_SIDEBAR_WIDTH}
            aria-valuenow={sidebarWidth}
            onMouseDown={handleResizeStart}
            onKeyDown={handleResizeKeyDown}
            className="group absolute inset-y-0 -right-2 z-30 w-4 cursor-col-resize touch-none outline-none"
          >
            <span
              aria-hidden="true"
              className={`absolute inset-y-0 left-1/2 -translate-x-1/2 transition-[width,background-color,box-shadow] ${
                isResizing
                  ? "w-[2px] bg-white shadow-[0_0_12px_rgba(255,255,255,0.38)]"
                  : "w-px bg-app-border group-hover:w-[2px] group-hover:bg-app-foreground-soft/75 group-hover:shadow-[0_0_10px_rgba(255,255,255,0.14)] group-focus-visible:w-[2px] group-focus-visible:bg-app-foreground-soft/75"
              }`}
            />
          </div>
        </aside>

        <section
          aria-label="Workspace panel"
          className="relative flex min-h-screen flex-1 flex-col bg-app-elevated"
        >
          <div
            aria-label="Workspace panel drag region"
            className="absolute inset-x-0 top-0 z-10 h-[2.4rem] bg-transparent"
            data-tauri-drag-region
          />

          {/* 这是内容区顶部 1 栏 */}
          <div className="h-[2.4rem] w-full border-b border-app-border bg-transparent text-xs text-red-300"/>

          {/* 这是内容区顶部 2 栏 */}
          <div className="h-[2.4rem] w-full border-b border-app-border bg-transparent text-xs text-red-300"/>

          <div
            aria-label="Workspace viewport"
            className="flex min-h-0 flex-1 flex-col bg-app-elevated"
          >
            <div className="mt-auto px-3 pb-3 pt-5">
              <WorkspaceComposer />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

export default App;
