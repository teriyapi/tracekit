"use client";

import { useEffect, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import type { Tag } from "@/lib/db/types";
import { isVerdict } from "@/lib/verdicts";
import { cn } from "@/lib/utils";

/** Search, toggle and create tags. Verdict names are reserved, so they never show up here. */
export function TagPicker({
  value,
  onChange,
  disabled = false,
  label = "+ Add tag",
  className,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  disabled?: boolean;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open) return;
    fetch("/api/tags")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setAllTags(data);
      });
  }, [open]);

  function toggle(name: string) {
    onChange(value.includes(name) ? value.filter((t) => t !== name) : [...value, name]);
  }

  function create(name: string) {
    onChange([...value, name]);
    fetch("/api/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }).then(() => {
      setAllTags((prev) => [...prev, { name, description: null, created_at: new Date().toISOString() }]);
    });
    setSearch("");
  }

  const names = allTags.map((t) => t.name).filter((t) => !isVerdict(t));
  const filtered = search ? names.filter((t) => t.toLowerCase().includes(search.toLowerCase())) : names;
  const trimmed = search.trim();
  const canCreate = trimmed.length > 0 && !names.includes(trimmed) && !isVerdict(trimmed);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        className={cn(
          "inline-flex h-7 items-center justify-center gap-1 rounded-md border border-input bg-transparent px-2.5 text-xs font-medium whitespace-nowrap transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 dark:bg-input/30 dark:hover:bg-input/50",
          className
        )}
      >
        {label}
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="end">
        <Command>
          <CommandInput placeholder="Search or create tag…" value={search} onValueChange={setSearch} />
          <CommandList>
            <CommandEmpty>{canCreate ? null : "No tags found."}</CommandEmpty>
            <CommandGroup>
              {filtered.map((tag) => (
                <CommandItem key={tag} onSelect={() => toggle(tag)}>
                  <span className="flex-1">{tag}</span>
                  {value.includes(tag) && <span className="text-foreground">✓</span>}
                </CommandItem>
              ))}
              {canCreate && (
                <CommandItem onSelect={() => create(trimmed)}>Create &ldquo;{trimmed}&rdquo;</CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
