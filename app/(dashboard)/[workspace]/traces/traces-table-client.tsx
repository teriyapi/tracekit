"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RoseLoader } from "@/components/ui/rose-loader";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import type { TraceWithLatestAnnotation } from "@/lib/db/types";
import { relativeTime, cn } from "@/lib/utils";
import { TraceSheet } from "./trace-sheet";
import { TagFilter } from "./tag-filter";
import { useSelection } from "@/lib/context/selection";

function getInputPreview(input: Record<string, unknown>): string {
  if (input.user_message && typeof input.user_message === "string") {
    return input.user_message.slice(0, 80);
  }
  const firstValue = Object.values(input)[0];
  if (typeof firstValue === "string") return firstValue.slice(0, 80);
  return JSON.stringify(firstValue).slice(0, 80);
}

export function TracesTableClient({
  initialTraces,
  workspace,
}: {
  initialTraces: TraceWithLatestAnnotation[];
  workspace: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toggleTrace, isTraceSelected, isLastSelected } = useSelection();

  const isAllWorkspace = workspace === "all";

  const [traces, setTraces] = useState(initialTraces);
  const [agents, setAgents] = useState<string[]>([]);
  const [selectedTrace, setSelectedTrace] = useState<TraceWithLatestAnnotation | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchInput, setSearchInput] = useState(searchParams.get("q") || "");

  // Current filter values from URL
  const agentFilter = searchParams.get("agent") || "";
  const ratingFilter = searchParams.get("rating") || "";
  const tagFilter = searchParams.getAll("tag");
  const qFilter = searchParams.get("q") || "";

  const hasFilters = agentFilter || ratingFilter || tagFilter.length > 0 || qFilter;

  // Fetch agents list (only needed for "all" workspace)
  useEffect(() => {
    if (!isAllWorkspace) return;
    fetch("/api/agents")
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setAgents(data); });
  }, [isAllWorkspace]);

  // Fetch traces when filters change
  const fetchTraces = useCallback(async (cursor?: string) => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("workspace", workspace);
    if (agentFilter) params.set("agent", agentFilter);
    if (ratingFilter) params.set("rating", ratingFilter);
    tagFilter.forEach((t) => params.append("tag", t));
    if (qFilter) params.set("q", qFilter);
    if (cursor) params.set("cursor", cursor);

    const res = await fetch(`/api/traces?${params.toString()}`);
    const data = await res.json();
    if (Array.isArray(data)) {
      if (cursor) {
        setTraces((prev) => [...prev, ...data]);
      } else {
        setTraces(data);
      }
    }
    setLoading(false);
  }, [workspace, agentFilter, ratingFilter, tagFilter, qFilter]);

  // Re-fetch on filter change (but not on initial mount since we have initialTraces)
  useEffect(() => {
    const paramsString = searchParams.toString();
    if (paramsString) {
      fetchTraces();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.toString()]);

  const basePath = `/${workspace}/traces`;

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.delete("cursor");
    router.replace(`${basePath}?${params.toString()}`);
  }

  function updateTags(tags: string[]) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("tag");
    tags.forEach((t) => params.append("tag", t));
    params.delete("cursor");
    router.replace(`${basePath}?${params.toString()}`);
  }

  function clearFilters() {
    router.replace(basePath);
  }

  // Debounced search
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (searchInput !== qFilter) {
        updateParam("q", searchInput);
      }
    }, 300);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  function handleLoadMore() {
    if (traces.length === 0) return;
    const oldest = traces[traces.length - 1].created_at;
    fetchTraces(oldest);
  }

  function handleRowClick(trace: TraceWithLatestAnnotation) {
    setSelectedTrace(trace);
    setSheetOpen(true);
  }

  function handleAnnotationSaved() {
    fetchTraces();
  }

  if (traces.length === 0 && !loading && !hasFilters) {
    return (
      <Card className="mt-8">
        <CardContent className="py-12 text-center space-y-4">
          <p className="text-muted-foreground">
            No traces yet. Send some traces to <code className="text-foreground">/api/ingest</code> from your agent to see them here.
          </p>
          <pre className="text-left text-xs bg-muted p-4 rounded-md inline-block mx-auto overflow-auto max-h-48">
{`curl -X POST http://localhost:3000/api/ingest \\
  -H "x-tracekit-token: <YOUR_TOKEN>" \\
  -H "Content-Type: application/json" \\
  -d '{"agent":"my-agent","source":"live","input":{"user_message":"hello"},"output":"hi!"}'`}
          </pre>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap gap-3 items-center">
        {isAllWorkspace && (
          <Select value={agentFilter || "all"} onValueChange={(v: string | null) => updateParam("agent", !v || v === "all" ? "" : v)}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="All agents" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All agents</SelectItem>
              {agents.map((a) => (
                <SelectItem key={a} value={a}>{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select value={ratingFilter || "all"} onValueChange={(v: string | null) => updateParam("rating", !v || v === "all" ? "" : v)}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="All ratings" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All ratings</SelectItem>
            <SelectItem value="unrated">Unrated</SelectItem>
            <SelectItem value="1">1</SelectItem>
            <SelectItem value="2">2</SelectItem>
            <SelectItem value="3">3</SelectItem>
            <SelectItem value="4">4</SelectItem>
            <SelectItem value="5">5</SelectItem>
          </SelectContent>
        </Select>

        <TagFilter selectedTags={tagFilter} onTagsChange={updateTags} />

        <Input
          placeholder="search input/output…"
          className="flex-1 min-w-48"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Clear all
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10"></TableHead>
              <TableHead className="w-24">Time</TableHead>
              {isAllWorkspace && <TableHead className="w-28">Agent</TableHead>}
              <TableHead>Input</TableHead>
              <TableHead>Output</TableHead>
              <TableHead className="w-20">Model</TableHead>
              <TableHead className="w-16">Rating</TableHead>
              <TableHead className="w-36">Tags</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {traces.map((trace) => (
              <TableRow
                key={trace.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => handleRowClick(trace)}
              >
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={isTraceSelected(trace.id)}
                    onChange={() => toggleTrace(trace.id)}
                    className={cn(isLastSelected(trace.id) && "ring-1 ring-foreground ring-offset-1 ring-offset-background")}
                  />
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {relativeTime(trace.created_at)}
                </TableCell>
                {isAllWorkspace && (
                  <TableCell>
                    <Badge variant="secondary">{trace.agent}</Badge>
                  </TableCell>
                )}
                <TableCell className="font-mono text-xs max-w-48 truncate">
                  {getInputPreview(trace.input)}
                </TableCell>
                <TableCell className="text-xs max-w-48 truncate">
                  {trace.output.slice(0, 80)}
                  {trace.output.length > 80 && "…"}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {trace.model ?? "—"}
                </TableCell>
                <TableCell>
                  {trace.latest_rating ? (
                    <Badge variant="outline">{trace.latest_rating}★</Badge>
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1 flex-wrap">
                    {(trace.latest_tags || []).slice(0, 3).map((tag) => (
                      <Badge key={tag} variant="outline" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                    {(trace.latest_tags || []).length > 3 && (
                      <span className="text-xs text-muted-foreground">
                        +{(trace.latest_tags || []).length - 3}
                      </span>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Load more */}
      {traces.length > 0 && traces.length % 100 === 0 && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={handleLoadMore} disabled={loading}>
            {loading ? <span className="inline-flex items-center gap-2"><RoseLoader size={16} color="currentColor" /> Loading…</span> : "Load more"}
          </Button>
        </div>
      )}

      {traces.length === 0 && hasFilters && !loading && (
        <div className="text-center py-8 text-muted-foreground">
          No traces match the current filters.
        </div>
      )}

      {/* Trace detail sheet */}
      <TraceSheet
        trace={selectedTrace}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onAnnotationSaved={handleAnnotationSaved}
        traces={traces}
        onNavigate={(t) => { setSelectedTrace(t); }}
      />
    </div>
  );
}
