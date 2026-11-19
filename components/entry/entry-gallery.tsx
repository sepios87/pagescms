"use client";

import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useWatch } from "react-hook-form";
import { Camera, CheckSquare, FolderOpen, GripVertical, ImagePlus, RefreshCw, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Thumbnail } from "@/components/thumbnail";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { MediaDialog } from "@/components/media/media-dialog";
import { MediaUpload } from "@/components/media/media-upload";
import { useStagedMedia } from "@/contexts/staged-media-context";
import { getFileName } from "@/lib/utils/file";
import { cn } from "@/lib/utils";
import type { FileSaveData } from "@/types/api";
import type { Field } from "@/types/field";

type GalleryRow = { id: string; name: string; index: number; invalid: boolean };
type GalleryMedia = {
  name: string;
  path: string;
  extensions?: string[];
  rename?: boolean | "safe" | "random";
};

type GalleryProps = {
  rows: GalleryRow[];
  imageField: string;
  captions: Field[];
  media: GalleryMedia;
  readonly: boolean;
  remaining: number;
  onAdd: (paths: string[]) => Promise<void>;
  onReplace: (ids: string[], paths: string[]) => Promise<boolean>;
  onRemove: (ids: string[]) => Promise<void>;
};

function RemovePhotos({ count, onRemove, children }: {
  count: number;
  onRemove: () => Promise<void>;
  children: React.ReactElement;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{count === 1 ? "Remove this photo?" : `Remove ${count} photos?`}</AlertDialogTitle>
          <AlertDialogDescription>The photos will be removed from the gallery when you save this entry.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => void onRemove().catch(reportGalleryError)}>Remove</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function reportGalleryError(error: unknown) {
  toast.error(error instanceof Error ? error.message : "Could not update the gallery.");
}

function GalleryCaption({ row, field, readonly }: { row: GalleryRow; field: Field; readonly: boolean }) {
  const label = field.label || (field.name === "alt" ? "Alt text" : "Caption");
  return (
    <FormField name={`${row.name}.${field.name}`} render={({ field: input }) => (
      <FormItem className="gap-1">
        <FormLabel className="sr-only">{label} · Photo {row.index + 1}</FormLabel>
        <FormControl>
          <Input
            {...input}
            value={input.value ?? ""}
            readOnly={readonly || !!field.readonly}
            aria-required={field.required || undefined}
            placeholder={label}
            title={input.value || undefined}
            className="h-8 text-sm"
          />
        </FormControl>
        <FormMessage className="text-xs" />
      </FormItem>
    )} />
  );
}

function PhotoCard({
  row, imageField, media, captions, isReadonly, single, selecting, selected, onSelect, onReplace, onRemove,
}: {
  row: GalleryRow;
  imageField: string;
  media: GalleryMedia;
  captions: Field[];
  isReadonly: boolean;
  single: boolean;
  selecting: boolean;
  selected: boolean;
  onSelect: () => void;
  onReplace: (paths: string[]) => Promise<boolean>;
  onRemove: () => Promise<void>;
}) {
  const value = useWatch({ name: `${row.name}.${imageField}` });
  const path = typeof value === "string" ? value : null;
  const pending = useStagedMedia()?.get(path ?? "");
  const filename = getFileName(pending?.path ?? path ?? "");
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: row.id, disabled: isReadonly || single || selecting,
  });
  const overlay = "absolute top-2 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100";
  const overlayButton = "bg-background/95 shadow-sm";
  const thumbnail = <Thumbnail name={media.name} path={path} className={single ? "size-16 rounded-md" : "aspect-[4/3]"} />;
  const photoActions = !isReadonly && (
    <div className={cn("flex shrink-0 gap-1", !single && overlay, !single && "right-2")}>
      <MediaUpload media={media.name} path={media.path} extensions={media.extensions} rename={media.rename}
        requiredCount={1} onBatchUpload={async (files) => { await onReplace(getPaths(files)); }}>
        <MediaUpload.Trigger>
          <Button type="button" variant={single ? "ghost" : "secondary"} size={single ? "icon-sm" : "icon-xs"}
            className={single ? undefined : overlayButton}
            aria-label={`Replace photo ${row.index + 1}`} title="Replace photo"><RefreshCw /></Button>
        </MediaUpload.Trigger>
      </MediaUpload>
      <RemovePhotos count={1} onRemove={onRemove}>
        <Button type="button" variant={single ? "ghost" : "secondary"} size={single ? "icon-sm" : "icon-xs"}
          className={single ? undefined : overlayButton}
          aria-label={`Remove photo ${row.index + 1}`} title="Remove photo"><Trash2 /></Button>
      </RemovePhotos>
    </div>
  );
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "group relative min-w-0 overflow-hidden rounded-lg border bg-card transition-colors",
        single && "flex items-center gap-2 p-2 sm:gap-3",
        selected && "border-primary ring-1 ring-primary",
        row.invalid && "border-destructive",
        isDragging && "z-10 opacity-60",
      )}
      data-gallery-photo={row.index + 1}
      style={{ transform: CSS.Translate.toString(transform), transition }}
    >
      <div className="relative shrink-0">
        {selecting ? (
          <>
            <button type="button" onClick={onSelect} tabIndex={-1} aria-hidden="true" className="block w-full">
              {thumbnail}
            </button>
            <div className="absolute left-2 top-2 flex rounded-md bg-background p-1.5 shadow-sm">
              <Checkbox checked={selected} onCheckedChange={onSelect} aria-label={`Select photo ${row.index + 1}`} />
            </div>
          </>
        ) : (
          <>
            {thumbnail}
            {!isReadonly && !single && (
              <>
                <div className={cn(overlay, "left-2")}>
                  <Button type="button" variant="secondary" size="icon-xs" className={cn(overlayButton, "cursor-grab")}
                    {...attributes} {...listeners} aria-label={`Reorder photo ${row.index + 1}`}>
                    <GripVertical />
                  </Button>
                </div>
                {photoActions}
              </>
            )}
          </>
        )}
      </div>
      {captions.length > 0 ? (
        <div className={cn("min-w-0 space-y-2", single ? "flex-1" : "p-2")}>
          {captions.map((field) => <GalleryCaption key={field.name} row={row} field={field} readonly={isReadonly} />)}
        </div>
      ) : (
        <p className={cn("min-w-0 truncate text-sm text-muted-foreground", single ? "flex-1" : "px-2.5 py-2")}
          title={filename}>{filename || `Photo ${row.index + 1}`}</p>
      )}
      {single && photoActions}
    </div>
  );
}

const getPaths = (files: FileSaveData[]) => files.flatMap((file) => file.path ? [file.path] : []);

export function EntryGallery({ rows, imageField, captions, media, readonly, remaining, onAdd, onReplace, onRemove }: GalleryProps) {
  const [selecting, setSelecting] = useState(false);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const selected = rows.filter((row) => selection.has(row.id));
  const count = selected.length;
  const single = rows.length === 1;
  const isSelecting = selecting && rows.length > 1;
  const allSelected = count > 0 && count === rows.length;

  const finishSelection = () => {
    setSelection(new Set());
    setSelecting(false);
  };

  const toggle = (id: string) => setSelection((previous) => {
    const next = new Set(previous);
    if (!next.delete(id)) next.add(id);
    return next;
  });

  return (
    <div className="space-y-3">
      {!readonly && (
        isSelecting ? (
          <div className="flex min-h-8 flex-wrap items-center gap-2 text-sm" role="toolbar" aria-label="Actions on selected photos">
            <Checkbox aria-label="Select all photos" checked={allSelected || (count > 0 ? "indeterminate" : false)}
              onCheckedChange={() => setSelection(allSelected ? new Set() : new Set(rows.map(({ id }) => id)))} />
            <span aria-live="polite" className="mr-auto font-medium">{count} selected</span>
            <MediaUpload media={media.name} path={media.path} extensions={media.extensions} rename={media.rename} multiple
              requiredCount={count} disabled={count === 0} onBatchUpload={async (files) => {
                if (await onReplace(selected.map(({ id }) => id), getPaths(files))) finishSelection();
              }}>
              <MediaUpload.Trigger>
                <Button type="button" variant="outline" size="sm" disabled={count === 0} title="Choose one file per photo, in gallery order">
                  <RefreshCw /> Replace
                </Button>
              </MediaUpload.Trigger>
            </MediaUpload>
            <RemovePhotos count={count} onRemove={async () => {
              await onRemove(selected.map(({ id }) => id));
              finishSelection();
            }}>
              <Button type="button" variant="outline" size="sm" disabled={count === 0}><Trash2 /> Remove</Button>
            </RemovePhotos>
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Exit photo selection" onClick={finishSelection}><X /></Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {remaining > 0 && (
              <>
                <MediaUpload media={media.name} path={media.path} extensions={media.extensions} rename={media.rename}
                  multiple={remaining > 1} maxCount={remaining} onBatchUpload={(files) => onAdd(getPaths(files))}>
                  <MediaUpload.Trigger>
                    <Button type="button" variant="outline" size="sm"><ImagePlus /> {remaining === 1 ? "Add photo" : "Add photos"}</Button>
                  </MediaUpload.Trigger>
                </MediaUpload>
                <MediaDialog media={media.name} initialPath={media.path} extensions={media.extensions} maxSelected={remaining} onSubmit={onAdd}>
                  <Button type="button" variant="ghost" size="sm"><FolderOpen /> From library</Button>
                </MediaDialog>
              </>
            )}
            {rows.length > 1 && (
              <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={() => setSelecting(true)}>
                <CheckSquare /> Select photos
              </Button>
            )}
          </div>
        )
      )}
      {isSelecting && count > 0 && (
        <p className="text-sm text-muted-foreground">Replacement files follow gallery order. Existing alt text is kept.</p>
      )}
      {rows.length === 0 && (
        <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed py-8 text-sm text-muted-foreground">
          <Camera className="size-4" /> No photos
        </div>
      )}
      <div className={single ? undefined : "grid grid-cols-2 gap-3 sm:grid-cols-3"}>
        {rows.map((row) => (
          <PhotoCard key={row.id} row={row} imageField={imageField} media={media} captions={captions}
            isReadonly={readonly} single={single} selecting={isSelecting} selected={isSelecting && selection.has(row.id)}
            onSelect={() => toggle(row.id)} onReplace={(paths) => onReplace([row.id], paths)} onRemove={() => onRemove([row.id])} />
        ))}
      </div>
    </div>
  );
}
