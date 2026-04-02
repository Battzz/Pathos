import "./App.css";
import {
  type KeyboardEvent,
  type MouseEvent,
  useEffect,
  useState,
} from "react";
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
          className="relative flex min-h-screen flex-1 flex-col bg-app-canvas"
        >
          <div
            aria-label="Workspace panel drag region"
            className="absolute inset-x-0 top-0 z-10 h-12 bg-transparent"
            data-tauri-drag-region
          />

          <div
            aria-label="Workspace viewport"
            className="flex-1 bg-app-elevated"
          />
        </section>
      </div>
    </main>
  );
}

export default App;
