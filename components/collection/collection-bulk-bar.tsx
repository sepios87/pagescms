"use client"

import { Copy, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

// Actions on the entries ticked in a collection (delete, duplicate). It takes the
// place of the header of the list as soon as an entry is ticked, so nothing moves.
export function CollectionBulkBar({
  count,
  allChecked,
  onToggleAll,
  canDelete,
  canDuplicate,
  busy,
  onDelete,
  onDuplicate,
  onClear,
}: {
  count: number;
  // State of the "select all" checkbox (the entries of the page)
  allChecked: boolean | "indeterminate";
  onToggleAll: (checked: boolean) => void;
  canDelete: boolean;
  canDuplicate: boolean;
  busy: boolean;
  onDelete: () => void;
  onDuplicate: () => void;
  onClear: () => void;
}) {
  return (
    <div
      className="flex min-h-8 w-full items-center gap-2 text-sm"
      role="toolbar"
      aria-label="Actions on the selected entries"
    >
      <Checkbox
        checked={allChecked}
        onCheckedChange={(value) => onToggleAll(!!value)}
        aria-label="Select all the entries of the page"
      />
      <span className="mr-auto font-medium">
        {count} {count === 1 ? "entry" : "entries"} selected
      </span>
      {canDuplicate && (
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onDuplicate}>
          <Copy />
          Duplicate
        </Button>
      )}
      {canDelete && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button type="button" variant="outline" size="sm" disabled={busy}>
              <Trash2 />
              Delete
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Delete {count} {count === 1 ? "entry" : "entries"}?
              </AlertDialogTitle>
              <AlertDialogDescription>
                {count === 1 ? "This entry" : "These entries"} will be deleted in a single
                commit. You can get {count === 1 ? "it" : "them"} back from the Git history.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={onDelete}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        disabled={busy}
        onClick={onClear}
        aria-label="Clear the selection"
        title="Clear the selection"
      >
        <X />
      </Button>
    </div>
  );
}
