"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { SelectionProvider, useSelection } from "@/lib/context/selection";
import { ExportModal } from "@/components/export-modal";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import type { Role } from "@/lib/auth/session";
import { ReadOnlyProvider } from "@/lib/context/read-only";
import { SUNSET_AGENTS } from "@/lib/agents";

function useWorkspace() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);
  // segments[0] is the workspace (e.g. "bartleby", "all")
  return segments[0] || "all";
}

function SelectionActions({ readOnly }: { readOnly: boolean }) {
  const { selectedTraceIds, totalCount, clearAll } = useSelection();
  const [modalOpen, setModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    const ids = Array.from(selectedTraceIds);
    if (ids.length === 0) return;
    if (!confirm(`Delete ${ids.length} selected trace${ids.length !== 1 ? "s" : ""}? This cannot be undone.`)) return;

    setDeleting(true);
    const res = await fetch("/api/traces/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trace_ids: ids }),
    });
    setDeleting(false);

    if (res.ok) {
      const { toast } = await import("sonner");
      toast.success(`Deleted ${ids.length} traces`);
      clearAll();
      window.location.reload();
    } else {
      const { toast } = await import("sonner");
      toast.error("Failed to delete");
    }
  }

  return (
    <div className="flex items-center gap-2">
      {totalCount > 0 && (
        <Button variant="ghost" size="sm" onClick={clearAll} className="text-xs text-muted-foreground">
          Clear
        </Button>
      )}
      <Button
        variant="destructive"
        size="sm"
        disabled={selectedTraceIds.size === 0 || deleting || readOnly}
        title={readOnly ? "Read-only demo" : undefined}
        onClick={handleDelete}
      >
        {deleting ? "Deleting…" : `Delete${selectedTraceIds.size > 0 ? ` (${selectedTraceIds.size})` : ""}`}
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={totalCount === 0 || readOnly}
        title={readOnly ? "Read-only demo" : undefined}
        onClick={() => setModalOpen(true)}
      >
        Export{totalCount > 0 ? ` (${totalCount})` : ""}
      </Button>
      <ExportModal open={modalOpen} onOpenChange={setModalOpen} />
    </div>
  );
}

function DashboardNav({ role }: { role: Role | null }) {
  const pathname = usePathname();
  const workspace = useWorkspace();
  const navRef = useRef<HTMLElement>(null);
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });

  const tabs = [
    { href: `/${workspace}/traces`, label: "Live Traces", match: (p: string) => p.includes("/traces") },
    { href: `/${workspace}/experiments`, label: "Experiments", match: (p: string) => p.includes("/experiments") },
  ];

  const activeIndex = tabs.findIndex((t) => t.match(pathname));

  const measure = useCallback(() => {
    if (!navRef.current) return;
    const activeEl = navRef.current.querySelector<HTMLElement>(`[data-tab-index="${activeIndex}"]`);
    if (activeEl) {
      const navRect = navRef.current.getBoundingClientRect();
      const elRect = activeEl.getBoundingClientRect();
      setIndicator({
        left: elRect.left - navRect.left,
        width: elRect.width,
      });
    }
  }, [activeIndex]);

  useEffect(() => {
    measure();
  }, [measure]);

  return (
    <header className="border-b border-border px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div className="flex items-center gap-3 sm:gap-6">
        <WorkspaceSwitcher workspace={workspace} />
        <nav ref={navRef} className="relative flex items-center gap-1 rounded-lg bg-muted p-[3px]">
          <div
            className="absolute top-[3px] bottom-[3px] rounded-sm bg-background shadow-sm transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
            style={{ left: indicator.left, width: indicator.width }}
          />
          {tabs.map((tab, i) => (
            <Link
              key={tab.href}
              href={tab.href}
              data-tab-index={i}
              className={cn(
                "relative z-10 inline-flex items-center justify-center rounded-sm px-3 py-1 text-sm font-medium transition-colors duration-200",
                activeIndex === i
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="flex items-center gap-2">
        {role === "demo" && (
          <span className="rounded-md border border-border px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
            Demo · read only
          </span>
        )}
        <SelectionActions readOnly={role !== "owner"} />
        <Link
          href={`/${workspace}/settings`}
          className={buttonVariants({ variant: "ghost", size: "sm", className: "text-muted-foreground" })}
        >
          settings
        </Link>
        <a
          href="/api/auth/logout"
          className={buttonVariants({ variant: "ghost", size: "sm", className: "text-muted-foreground" })}
        >
          logout
        </a>
      </div>
    </header>
  );
}


function SunsetBanner() {
  const pathname = usePathname();
  const workspace = useWorkspace();
  const replacement = SUNSET_AGENTS[workspace];
  if (!replacement) return null;
  // Same tab, on the replacement agent
  const href = `/${replacement}${pathname.slice(workspace.length + 1)}`;
  return (
    <div role="status" className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-border bg-muted/40 px-4 py-2 text-sm sm:px-6">
      <p className="text-muted-foreground">
        <span className="font-medium text-foreground">{workspace}</span> is now sunset. To run experiments, switch to{" "}
        {replacement}.
      </p>
      <Link href={href} className={buttonVariants({ variant: "outline", size: "xs" })}>
        Go to {replacement}
      </Link>
    </div>
  );
}

export function DashboardShell({
  role,
  children,
}: {
  role: Role | null;
  children: React.ReactNode;
}) {
  return (
    <ReadOnlyProvider value={role !== "owner"}>
      <SelectionProvider>
        <div className="min-h-screen bg-background flex flex-col">
          <DashboardNav role={role} />
          <SunsetBanner />
          <main className="flex-1 p-4 sm:p-6">{children}</main>
        </div>
      </SelectionProvider>
    </ReadOnlyProvider>
  );
}
