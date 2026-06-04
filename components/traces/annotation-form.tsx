"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { toast } from "sonner";
import type { Annotation, Tag } from "@/lib/db/types";

export function AnnotationForm({
  traceId,
  latestAnnotation,
  onSaved,
}: {
  traceId: string;
  latestAnnotation: Annotation | null;
  onSaved: () => void;
}) {
  const [rating, setRating] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [tagSearch, setTagSearch] = useState("");
  const [tagPopoverOpen, setTagPopoverOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (latestAnnotation) {
      setRating(latestAnnotation.rating);
      setReason(latestAnnotation.reason || "");
      setSelectedTags(latestAnnotation.tags || []);
    } else {
      setRating(null);
      setReason("");
      setSelectedTags([]);
    }
  }, [latestAnnotation]);

  useEffect(() => {
    if (tagPopoverOpen) {
      fetch("/api/tags")
        .then((r) => r.json())
        .then((data) => { if (Array.isArray(data)) setAllTags(data); });
    }
  }, [tagPopoverOpen]);

  function toggleTag(name: string) {
    setSelectedTags((prev) =>
      prev.includes(name) ? prev.filter((t) => t !== name) : [...prev, name]
    );
  }

  function createAndAddTag(name: string) {
    setSelectedTags((prev) => [...prev, name]);
    fetch("/api/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }).then(() => {
      setAllTags((prev) => [...prev, { name, description: null, created_at: new Date().toISOString() }]);
    });
    setTagSearch("");
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/annotations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trace_id: traceId,
          rating: rating || undefined,
          reason: reason || undefined,
          tags: selectedTags.length > 0 ? selectedTags : undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Failed to save annotation");
        return;
      }

      toast.success("Annotation saved");
      onSaved();
    } catch {
      toast.error("Failed to save annotation");
    } finally {
      setSaving(false);
    }
  }

  const tagNames = allTags.map((t) => t.name);
  const filteredTags = tagSearch
    ? tagNames.filter((t) => t.toLowerCase().includes(tagSearch.toLowerCase()))
    : tagNames;
  const canCreateTag = tagSearch.trim().length > 0 && !tagNames.includes(tagSearch.trim());

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs text-muted-foreground mb-1.5">Rating</p>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <Button
              key={n}
              size="sm"
              variant={rating === n ? "default" : "outline"}
              className="w-9 h-9"
              onClick={() => setRating(rating === n ? null : n)}
            >
              {n}
            </Button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs text-muted-foreground mb-1.5">Reason</p>
        <Textarea
          placeholder="why this rating? what went wrong / right?"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
        />
      </div>

      <div>
        <p className="text-xs text-muted-foreground mb-1.5">Tags</p>
        <div className="flex flex-wrap gap-1 mb-2">
          {selectedTags.map((tag) => (
            <Badge
              key={tag}
              variant="secondary"
              className="cursor-pointer"
              onClick={() => toggleTag(tag)}
            >
              {tag} ×
            </Badge>
          ))}
        </div>
        <Popover open={tagPopoverOpen} onOpenChange={setTagPopoverOpen}>
          <PopoverTrigger className="inline-flex h-7 items-center justify-center rounded-md border border-input bg-transparent px-2.5 text-xs font-medium transition-colors hover:bg-muted dark:border-input dark:bg-input/30 dark:hover:bg-input/50">
            + Add tag
          </PopoverTrigger>
          <PopoverContent className="w-56 p-0" align="start">
            <Command>
              <CommandInput
                placeholder="Search or create tag…"
                value={tagSearch}
                onValueChange={setTagSearch}
              />
              <CommandList>
                <CommandEmpty>
                  {canCreateTag ? null : "No tags found."}
                </CommandEmpty>
                <CommandGroup>
                  {filteredTags.map((tag) => (
                    <CommandItem
                      key={tag}
                      onSelect={() => toggleTag(tag)}
                    >
                      <span className="flex-1">{tag}</span>
                      {selectedTags.includes(tag) && (
                        <span className="text-foreground">✓</span>
                      )}
                    </CommandItem>
                  ))}
                  {canCreateTag && (
                    <CommandItem onSelect={() => createAndAddTag(tagSearch.trim())}>
                      Create &ldquo;{tagSearch.trim()}&rdquo;
                    </CommandItem>
                  )}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      <Button onClick={handleSave} className="w-full" disabled={saving}>
        {saving ? "Saving…" : latestAnnotation ? "Update annotation" : "Save annotation"}
      </Button>
    </div>
  );
}
