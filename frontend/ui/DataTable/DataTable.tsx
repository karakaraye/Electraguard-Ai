"use client";

import { useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useT } from "../../lib/i18n/client";
import { SortDownIcon, SortIcon, SortUpIcon } from "../icons";
import styles from "./DataTable.module.css";

export type Column<Row> = {
  key: string;
  header: string;
  /** Cell content. Defaults to row[key]. */
  render?: (row: Row) => ReactNode;
  /** Value used for sorting. Defaults to row[key]. */
  sortValue?: (row: Row) => string | number | null;
  sortable?: boolean;
  /** Right-aligned with tabular figures. */
  numeric?: boolean;
  /** Use this column's cell as the row header for screen readers. */
  rowHeader?: boolean;
};

export type SortState = { key: string; direction: "ascending" | "descending" } | null;

export type DataTableProps<Row> = {
  caption: string;
  /** Show the caption visually (default) or only to screen readers. */
  captionHidden?: boolean;
  columns: Column<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  /** Makes rows focusable; Enter opens. Arrow keys (and J/K) move between rows. */
  onRowActivate?: (row: Row) => void;
  /** Called when a row gains focus, for a preview beside the table. */
  onRowFocus?: (row: Row) => void;
  /** Key of the selected row (open case). */
  selectedKey?: string;
  initialSort?: SortState;
  emptyText?: string;
  "data-testid"?: string;
};

function defaultValue<Row>(row: Row, key: string): unknown {
  return (row as Record<string, unknown>)[key];
}

/** Sortable table with a sticky header, tabular numbers and keyboard row navigation. */
export function DataTable<Row>({
  caption,
  captionHidden,
  columns,
  rows,
  rowKey,
  onRowActivate,
  onRowFocus,
  selectedKey,
  initialSort = null,
  emptyText,
  "data-testid": testId = "data-table",
}: DataTableProps<Row>) {
  const t = useT();
  const [sort, setSort] = useState<SortState>(initialSort);
  const bodyRef = useRef<HTMLTableSectionElement>(null);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const column = columns.find((c) => c.key === sort.key);
    if (!column) return rows;
    const value = (row: Row) =>
      column.sortValue ? column.sortValue(row) : (defaultValue(row, column.key) as string | number | null);
    const factor = sort.direction === "ascending" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      if (va === vb) return 0;
      if (va === null || va === undefined) return 1;
      if (vb === null || vb === undefined) return -1;
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * factor;
      return String(va).localeCompare(String(vb), undefined, { numeric: true, sensitivity: "base" }) * factor;
    });
  }, [rows, columns, sort]);

  function toggle(key: string) {
    setSort((current) =>
      current?.key === key
        ? { key, direction: current.direction === "ascending" ? "descending" : "ascending" }
        : { key, direction: "ascending" },
    );
  }

  function onRowKey(event: KeyboardEvent<HTMLTableRowElement>, row: Row, index: number) {
    const focusRow = (next: number) => {
      const rowsEls = bodyRef.current?.querySelectorAll<HTMLTableRowElement>("tr[tabindex]");
      if (!rowsEls?.length) return;
      rowsEls[Math.max(0, Math.min(rowsEls.length - 1, next))].focus();
    };
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    switch (event.key) {
      case "Enter":
      case " ":
        event.preventDefault();
        onRowActivate?.(row);
        break;
      case "ArrowDown":
      case "j":
        event.preventDefault();
        focusRow(index + 1);
        break;
      case "ArrowUp":
      case "k":
        event.preventDefault();
        focusRow(index - 1);
        break;
      case "Home":
        event.preventDefault();
        focusRow(0);
        break;
      case "End":
        event.preventDefault();
        focusRow(sorted.length - 1);
        break;
    }
  }

  return (
    <div className={styles.scroller} data-testid={testId} tabIndex={0} role="region" aria-label={caption}>
      <table className={styles.table}>
        <caption className={captionHidden ? "eg-sr-only" : styles.caption}>{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => {
              const active = sort?.key === column.key ? sort.direction : undefined;
              return (
                <th
                  key={column.key}
                  scope="col"
                  className={column.numeric ? styles.numeric : undefined}
                  aria-sort={column.sortable ? (active ?? "none") : undefined}
                >
                  {column.sortable ? (
                    <button
                      type="button"
                      className={styles.sort}
                      onClick={() => toggle(column.key)}
                      data-testid={`${testId}-sort-${column.key}`}
                    >
                      <span>{column.header}</span>
                      {active === "ascending" ? (
                        <SortUpIcon size={16} />
                      ) : active === "descending" ? (
                        <SortDownIcon size={16} />
                      ) : (
                        <SortIcon size={16} className={styles.sortIdle} />
                      )}
                      <span className="eg-sr-only">
                        {active === "ascending"
                          ? `, ${t("ui.table.sortAscending")}`
                          : active === "descending"
                            ? `, ${t("ui.table.sortDescending")}`
                            : ""}
                      </span>
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody ref={bodyRef}>
          {sorted.length === 0 ? (
            <tr>
              <td className={styles.empty} colSpan={columns.length}>
                {emptyText ?? t("ui.table.empty")}
              </td>
            </tr>
          ) : (
            sorted.map((row, index) => {
              const key = rowKey(row);
              return (
                <tr
                  key={key}
                  tabIndex={onRowActivate ? 0 : undefined}
                  className={onRowActivate ? styles.interactive : undefined}
                  aria-selected={onRowActivate ? selectedKey === key : undefined}
                  onClick={onRowActivate ? () => onRowActivate(row) : undefined}
                  onKeyDown={onRowActivate ? (event) => onRowKey(event, row, index) : undefined}
                  onFocus={onRowFocus ? () => onRowFocus(row) : undefined}
                  data-row-key={key}
                >
                  {columns.map((column) => {
                    const content = column.render ? column.render(row) : (defaultValue(row, column.key) as ReactNode);
                    const className = column.numeric ? `${styles.numeric} eg-tnum` : undefined;
                    return column.rowHeader ? (
                      <th key={column.key} scope="row" className={`${styles.rowHeader} ${className ?? ""}`}>
                        {content}
                      </th>
                    ) : (
                      <td key={column.key} className={className}>
                        {content}
                      </td>
                    );
                  })}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
