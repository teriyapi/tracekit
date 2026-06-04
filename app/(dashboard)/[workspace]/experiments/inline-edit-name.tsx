"use client";

import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function InlineEditName({
  value,
  onSave,
  experimentId,
  className,
}: {
  value: string;
  onSave: (name: string) => void;
  experimentId: string;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEditValue(value);
  }, [value]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  async function save() {
    const trimmed = editValue.trim();
    if (!trimmed || trimmed === value) {
      setEditing(false);
      setEditValue(value);
      return;
    }

    const res = await fetch(`/api/experiments/${experimentId}/rename`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });

    if (res.ok) {
      onSave(trimmed);
      toast.success("Renamed");
    } else {
      toast.error("Failed to rename");
      setEditValue(value);
    }
    setEditing(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      save();
    } else if (e.key === "Escape") {
      setEditing(false);
      setEditValue(value);
    }
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={save}
        onKeyDown={handleKeyDown}
        className={cn(
          "bg-transparent border-b border-primary outline-none text-foreground",
          className
        )}
      />
    );
  }

  return (
    <span
      onDoubleClick={() => setEditing(true)}
      className={cn("cursor-default select-none truncate", className)}
      title="Double-click to rename"
    >
      {value}
    </span>
  );
}
