"use client"

import type { ReactNode } from "react";
import Link from "next/link";
import { flexRender, type Row, type Table } from "@tanstack/react-table";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowUp, Folder, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Thumbnail } from "@/components/thumbnail";
import { safeAccess } from "@/lib/schema";
import { cn } from "@/lib/utils";

export type CardsThumbnail = {
  // Path of the image field (a path inside a list reads the first item)
  path: string;
  // Media configuration the image belongs to
  media: string;
};

export type CardsReorder = {
  enabled: boolean;
  hint: string;
  // Set when clicking the handle can bring the list back to the position order
  onSortByPosition?: () => void;
};

// The rows of the collection table (see collection-table.tsx)
type CardRow = Record<string, any>;

// Drag handle of a card, shown on top of its picture
const CardHandle = ({
  enabled,
  hint,
  onSortByPosition,
  activatorRef,
  attributes,
  listeners,
}: CardsReorder & {
  activatorRef: (element: HTMLElement | null) => void;
  attributes: Record<string, any>;
  listeners?: Record<string, any>;
}) => (
  <button
    type="button"
    ref={activatorRef}
    disabled={!enabled && !onSortByPosition}
    onClick={enabled ? undefined : onSortByPosition}
    title={enabled ? "Drag to reorder" : hint}
    aria-label={enabled ? "Drag to reorder" : hint}
    className={cn(
      "flex items-center rounded-md bg-background/90 p-1 text-muted-foreground shadow-sm",
      enabled
        ? "cursor-grab touch-none hover:text-foreground"
        : onSortByPosition
          ? "cursor-pointer opacity-70 hover:opacity-100"
          : "cursor-not-allowed opacity-40"
    )}
    {...attributes}
    {...listeners}
  >
    <GripVertical className="h-4 w-4" />
  </button>
);

const CardContent = ({
  row,
  thumbnail,
  primaryField,
  handle,
  selectable,
}: {
  row: Row<CardRow>;
  thumbnail: CardsThumbnail;
  primaryField?: string;
  handle?: ReactNode;
  // Show the checkbox that ticks the entry (for the bulk actions)
  selectable?: boolean;
}) => {
  const cells = row.getVisibleCells();
  const primaryCell = cells.find((cell) => cell.column.id === primaryField);
  const actionsCell = cells.find((cell) => cell.column.id === "actions");
  // The other columns, as small "label: value" lines (the picture is the card's own)
  const otherCells = cells.filter(
    (cell) =>
      cell !== primaryCell &&
      cell !== actionsCell &&
      cell.column.columnDef.meta?.fieldType !== "image"
  );

  const rawImage = safeAccess(row.original.fields ?? {}, thumbnail.path);
  const firstImage = Array.isArray(rawImage) ? rawImage[0] : rawImage;
  const imagePath = typeof firstImage === "string" && firstImage ? firstImage : null;

  return (
    <>
      <div className="relative">
        <Thumbnail name={thumbnail.media} path={imagePath} className="aspect-[4/3]" />
        {handle && <div className="absolute left-2 top-2 z-10">{handle}</div>}
        {selectable && (
          <div className="absolute right-2 top-2 z-10 rounded-md bg-background/90 p-1 shadow-sm">
            <Checkbox
              checked={row.getIsSelected()}
              onCheckedChange={(value) => row.toggleSelected(!!value)}
              aria-label="Select this entry"
            />
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1 p-3">
        {primaryCell && (
          <div className="min-w-0 text-sm">
            {flexRender(primaryCell.column.columnDef.cell, primaryCell.getContext())}
          </div>
        )}
        {otherCells.map((cell) => (
          <div key={cell.id} className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <span className="shrink-0">{String(cell.column.columnDef.header)}</span>
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </div>
        ))}
      </div>
      {actionsCell && (
        <div className="relative z-10 pointer-events-none [&_a]:pointer-events-auto [&_button]:pointer-events-auto flex justify-end border-t p-2">
          {flexRender(actionsCell.column.columnDef.cell, actionsCell.getContext())}
        </div>
      )}
    </>
  );
};

const selectedCardClassName = "ring-2 ring-primary";

const cardClassName = "group relative flex min-w-0 flex-col overflow-hidden rounded-lg border bg-card text-card-foreground";

const StaticCard = (props: {
  row: Row<CardRow>;
  thumbnail: CardsThumbnail;
  primaryField?: string;
  selectable?: boolean;
}) => (
  <li className={cn(cardClassName, props.row.getIsSelected() && selectedCardClassName)}>
    <CardContent {...props} />
  </li>
);

// A card that can be dragged to a new position
const SortableCard = ({
  row,
  thumbnail,
  primaryField,
  reorder,
  selectable,
}: {
  row: Row<CardRow>;
  thumbnail: CardsThumbnail;
  primaryField?: string;
  reorder: CardsReorder;
  selectable?: boolean;
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: row.original.path, disabled: !reorder.enabled });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(cardClassName, row.getIsSelected() && selectedCardClassName, isDragging && "z-10 shadow-lg")}
    >
      <CardContent
        row={row}
        thumbnail={thumbnail}
        primaryField={primaryField}
        selectable={selectable}
        handle={
          <CardHandle
            {...reorder}
            activatorRef={setActivatorNodeRef}
            attributes={attributes}
            listeners={listeners}
          />
        }
      />
    </li>
  );
};

// The entries of a collection as cards with a picture. Sorting, search and
// pagination come from the table instance, so they are shared with the list.
export function CollectionCards({
  table,
  thumbnail,
  primaryField,
  pathname,
  reorder,
  selectable,
  bulkBar,
}: {
  table: Table<CardRow>;
  thumbnail: CardsThumbnail;
  primaryField?: string;
  pathname: string;
  reorder?: CardsReorder;
  // Let the user tick the cards (for the bulk actions)
  selectable?: boolean;
  // Shown instead of the sort line while cards are ticked
  bulkBar?: ReactNode;
}) {
  const sortableColumns = table
    .getAllLeafColumns()
    .filter((column) => column.getCanSort() && typeof column.columnDef.header === "string");
  const sort = table.getState().sorting[0];
  const rows = table.getRowModel().rows;

  return (
    <div className="space-y-4">
      {bulkBar ? (
        <div className="flex min-h-8 items-center">{bulkBar}</div>
      ) : (sortableColumns.length > 0 || selectable) && (
        <div className="flex min-h-8 flex-wrap items-center gap-2 text-sm">
          {selectable && (
            <label className="mr-2 flex items-center gap-2 text-muted-foreground">
              <Checkbox
                checked={
                  table.getIsAllPageRowsSelected()
                    ? true
                    : table.getIsSomePageRowsSelected()
                      ? "indeterminate"
                      : false
                }
                onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
                aria-label="Select all the entries of the page"
              />
              Select all
            </label>
          )}
          {sortableColumns.length > 0 && (
            <label htmlFor="cards-sort" className="text-muted-foreground">Sort by</label>
          )}
          {sortableColumns.length > 0 && (
          <select
            id="cards-sort"
            className="h-8 rounded-md border bg-background px-2 text-sm"
            value={sort?.id ?? ""}
            onChange={(event) =>
              table.setSorting([{ id: event.target.value, desc: sort?.desc ?? false }])
            }
          >
            {!sort && <option value="" disabled>Choose…</option>}
            {sortableColumns.map((column) => (
              <option key={column.id} value={column.id}>
                {String(column.columnDef.header)}
              </option>
            ))}
          </select>
          )}
          {sortableColumns.length > 0 && sort && (
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label={sort.desc ? "Descending order" : "Ascending order"}
              title={sort.desc ? "Descending order" : "Ascending order"}
              onClick={() => table.setSorting([{ id: sort.id, desc: !sort.desc }])}
            >
              {sort.desc ? <ArrowDown /> : <ArrowUp />}
            </Button>
          )}
        </div>
      )}
      {rows.length === 0 ? (
        <p className="p-6 text-center text-sm text-muted-foreground">No entries</p>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {rows.map((row) =>
            row.original.type === "dir" ? (
              <li key={row.id} className={cn(cardClassName, "justify-center")}>
                <Link
                  className="flex aspect-[4/3] items-center justify-center gap-2 p-3 font-medium"
                  href={`${pathname}?path=${encodeURIComponent(row.original.path)}`}
                >
                  <Folder className="h-4 w-4" />
                  <span className="truncate">{row.original.name}</span>
                </Link>
              </li>
            ) : reorder ? (
              <SortableCard
                key={row.id}
                row={row}
                thumbnail={thumbnail}
                primaryField={primaryField}
                reorder={reorder}
                selectable={selectable}
              />
            ) : (
              <StaticCard key={row.id} row={row} thumbnail={thumbnail} primaryField={primaryField} selectable={selectable} />
            )
          )}
        </ul>
      )}
    </div>
  );
}
