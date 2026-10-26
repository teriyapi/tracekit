"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { TagPicker } from "./tag-picker";
import { toast } from "sonner";
import type { Annotation } from "@/lib/db/types";

export function AnnotationForm({
  traceId,
  latestAnnotation,
  onSaved,
  disabled = false,
}: {
  traceId: string;
  latestAnnotation: Annotation | null;
  onSaved: () => void;
  disabled?: boolean;
}) {
  const [rating, setRating] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
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

  function removeTag(name: string) {
    setSelectedTags((prev) => prev.filter((t) => t !== name));
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
              disabled={disabled}
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
          disabled={disabled}
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
              onClick={() => removeTag(tag)}
            >
              {tag} ×
            </Badge>
          ))}
        </div>
        <TagPicker value={selectedTags} onChange={setSelectedTags} disabled={disabled} />
      </div>

      <Button
        onClick={handleSave}
        className="w-full"
        disabled={saving || disabled}
        title={disabled ? "Read-only demo" : undefined}
      >
        {saving ? "Saving…" : latestAnnotation ? "Update annotation" : "Save annotation"}
      </Button>
    </div>
  );
}
