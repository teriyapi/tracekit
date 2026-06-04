"use client";

import { useState, useEffect } from "react";
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
import type { Tag } from "@/lib/db/types";

export function TagFilter({
  selectedTags,
  onTagsChange,
}: {
  selectedTags: string[];
  onTagsChange: (tags: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [tags, setTags] = useState<Tag[]>([]);

  useEffect(() => {
    if (open) {
      fetch("/api/tags")
        .then((r) => r.json())
        .then((data) => { if (Array.isArray(data)) setTags(data); });
    }
  }, [open]);

  function toggleTag(name: string) {
    if (selectedTags.includes(name)) {
      onTagsChange(selectedTags.filter((t) => t !== name));
    } else {
      onTagsChange([...selectedTags, name]);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="inline-flex h-9 items-center justify-center rounded-lg border border-input bg-transparent px-3 text-sm font-medium whitespace-nowrap transition-colors hover:bg-muted dark:border-input dark:bg-input/30 dark:hover:bg-input/50">
        {selectedTags.length > 0 ? (
          <span className="flex gap-1 items-center">
            Tags
            <Badge variant="secondary" className="ml-1 text-xs">
              {selectedTags.length}
            </Badge>
          </span>
        ) : (
          "Tags"
        )}
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="start">
        <Command>
          <CommandInput placeholder="Filter tags…" />
          <CommandList>
            <CommandEmpty>No tags found.</CommandEmpty>
            <CommandGroup>
              {tags.map((tag) => (
                <CommandItem
                  key={tag.name}
                  onSelect={() => toggleTag(tag.name)}
                >
                  <span className="flex-1">{tag.name}</span>
                  {selectedTags.includes(tag.name) && (
                    <span className="text-foreground">✓</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
