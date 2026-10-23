"use client"

import { Copy, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
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

// Actions on the entries ticked in a collection (delete, duplicate)
export function CollectionBulkBar({
  count,
  canDelete,
  canDuplicate,
  busy,
  onDelete,
  onDuplicate,
  onClear,
}: {
  count: number;
  canDelete: boolean;
  canDuplicate: boolean;
  busy: boolean;
  onDelete: () => void;
  onDuplicate: () => void;
  onClear: () => void;
}) {
  return (
    <div
      className="sticky bottom-4 z-30 flex flex-wrap items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm shadow-lg"
      role="toolbar"
      aria-label="Actions on the selected entries"
    >
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
