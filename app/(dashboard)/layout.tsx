"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SelectionProvider, useSelection } from "@/lib/context/selection";
import { ExportModal } from "@/components/export-modal";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";

function useWorkspace() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);
  // segments[0] is the workspace (e.g. "bartleby", "all")
  return segments[0] || "all";
}

function SelectionActions() {
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
        disabled={selectedTraceIds.size === 0 || deleting}
        onClick={handleDelete}
      >
        {deleting ? "Deleting…" : `Delete${selectedTraceIds.size > 0 ? ` (${selectedTraceIds.size})` : ""}`}
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={totalCount === 0}
        onClick={() => setModalOpen(true)}
      >
        Export{totalCount > 0 ? ` (${totalCount})` : ""}
      </Button>
      <ExportModal open={modalOpen} onOpenChange={setModalOpen} />
    </div>
  );
}

function DashboardNav() {
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
    <header className="border-b border-border px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-6">
        <WorkspaceSwitcher workspace={workspace} />
        <nav ref={navRef} className="relative flex items-center gap-1 rounded-lg bg-muted p-[3px]">
          <div
            className="absolute top-[3px] bottom-[3px] rounded-md bg-background shadow-sm transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
            style={{ left: indicator.left, width: indicator.width }}
          />
          {tabs.map((tab, i) => (
            <Link
              key={tab.href}
              href={tab.href}
              data-tab-index={i}
              className={cn(
                "relative z-10 inline-flex items-center justify-center rounded-md px-3 py-1 text-sm font-medium transition-colors duration-200",
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
      <div className="flex items-center gap-4">
        <SelectionActions />
        <Link
          href={`/${workspace}/settings`}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          settings
        </Link>
        <a
          href="/api/auth/logout"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          logout
        </a>
      </div>
    </header>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SelectionProvider>
      <div className="min-h-screen bg-background flex flex-col">
        <DashboardNav />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </SelectionProvider>
  );
}
