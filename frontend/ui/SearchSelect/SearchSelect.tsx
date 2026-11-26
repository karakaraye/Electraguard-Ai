"use client";

import { useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useT } from "../../lib/i18n/client";
import { FieldFrame } from "../Field/FieldFrame";
import fieldStyles from "../Field/Field.module.css";
import { CheckIcon, CloseIcon, SearchIcon } from "../icons";
import styles from "./SearchSelect.module.css";

export type SearchOption = {
  value: string;
  label: string;
  /** Second line, also searched (a polling-unit code, the LGA). */
  detail?: string;
};

export type SearchSelectProps = {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  optional?: boolean;
  options: SearchOption[];
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  /** Most options to list at once; type more to narrow. */
  limit?: number;
  /** Custom match (for example codes typed without dashes). Defaults to label + detail, ignoring case and tone marks. */
  filter?: (option: SearchOption, query: string) => boolean;
  /** Text when nothing matches (receives the typed query). */
  noMatchesText?: (query: string) => string;
  disabled?: boolean;
  id?: string;
  "data-testid"?: string;
};

/** Lower-case and strip tone marks, so "oyo" finds "Ọ̀yọ́" and "kano" finds "KANO". */
export function normalise(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Searchable list (ARIA combobox with a listbox popup). Filters as you type,
 * ignoring case and tone marks; arrow keys move, Enter chooses, Escape closes.
 */
export function SearchSelect({
  label,
  hint,
  error,
  optional,
  options,
  value,
  onChange,
  placeholder,
  limit = 50,
  filter,
  noMatchesText,
  disabled,
  id,
  "data-testid": testId = "search-select",
}: SearchSelectProps) {
  const t = useT();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const selected = options.find((option) => option.value === value) ?? null;
  const [query, setQuery] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const text = query ?? selected?.label ?? "";
  const matches = useMemo(() => {
    const needle = normalise(query ?? "");
    const found = needle
      ? options.filter((option) =>
          filter ? filter(option, query ?? "") : normalise(`${option.label} ${option.detail ?? ""}`).includes(needle),
        )
      : options;
    return found.slice(0, limit);
  }, [options, query, limit, filter]);
  const activeIndex = Math.min(active, Math.max(0, matches.length - 1));
  const activeId = open && matches.length ? `${listId}-opt-${activeIndex}` : undefined;

  function choose(option: SearchOption) {
    onChange(option.value);
    setQuery(null);
    setOpen(false);
  }

  function scrollIntoView(index: number) {
    const element = document.getElementById(`${listId}-opt-${index}`);
    element?.scrollIntoView({ block: "nearest" });
  }

  function move(next: number) {
    if (!matches.length) return;
    const index = (next + matches.length) % matches.length;
    setActive(index);
    setOpen(true);
    requestAnimationFrame(() => scrollIntoView(index));
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (!open) {
          setOpen(true);
          return;
        }
        move(activeIndex + 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        move(open ? activeIndex - 1 : matches.length - 1);
        break;
      case "Home":
        if (open) {
          event.preventDefault();
          move(0);
        }
        break;
      case "End":
        if (open) {
          event.preventDefault();
          move(matches.length - 1);
        }
        break;
      case "Enter":
        if (open && matches[activeIndex]) {
          event.preventDefault();
          choose(matches[activeIndex]);
        }
        break;
      case "Escape":
        if (open) {
          event.preventDefault();
          setOpen(false);
          setQuery(null);
        }
        break;
    }
  }

  const emptyText = noMatchesText ? noMatchesText(query ?? "") : t("ui.search.noMatches");
  return (
    <FieldFrame label={label} hint={hint} error={error} optional={optional} id={id}>
      {({ id: controlId, describedBy, invalid }) => (
        <div
          className={styles.wrap}
          data-testid={testId}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
              setOpen(false);
              setQuery(null);
            }
          }}
        >
          <SearchIcon className={styles.searchIcon} />
          <input
            ref={inputRef}
            id={controlId}
            className={`${fieldStyles.control} ${styles.input}`}
            type="text"
            role="combobox"
            aria-expanded={open}
            aria-controls={`${listId}-list`}
            aria-autocomplete="list"
            aria-activedescendant={activeId}
            aria-describedby={[describedBy, `${listId}-help`].filter(Boolean).join(" ")}
            aria-invalid={invalid || undefined}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            enterKeyHint="search"
            placeholder={placeholder}
            disabled={disabled}
            value={text}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
              setOpen(true);
            }}
            onClick={() => setOpen(true)}
            onKeyDown={onKeyDown}
          />
          {text && !disabled ? (
            <button
              type="button"
              className={styles.clear}
              onClick={() => {
                onChange(null);
                setQuery("");
                setOpen(true);
                inputRef.current?.focus();
              }}
              data-testid={`${testId}-clear`}
            >
              <CloseIcon size={20} />
              <span className="eg-sr-only">{t("ui.search.clear")}</span>
            </button>
          ) : null}
          <span id={`${listId}-help`} className="eg-sr-only">
            {t("ui.search.instructions")}
          </span>
          <ul
            id={`${listId}-list`}
            role="listbox"
            className={styles.list}
            hidden={!open || matches.length === 0}
            aria-label={typeof label === "string" ? label : undefined}
          >
            {matches.map((option, index) => {
              const isSelected = option.value === value;
              return (
                <li
                  key={option.value}
                  id={`${listId}-opt-${index}`}
                  role="option"
                  aria-selected={isSelected}
                  className={styles.option}
                  data-active={index === activeIndex || undefined}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(option)}
                  onMouseMove={() => setActive(index)}
                >
                  <span className={styles.optionText}>
                    <span className={styles.optionLabel}>{option.label}</span>
                    {option.detail ? <span className={`${styles.optionDetail} eg-tnum`}>{option.detail}</span> : null}
                  </span>
                  {isSelected ? <CheckIcon className={styles.check} /> : null}
                </li>
              );
            })}
          </ul>
          {/* No matches: a plain panel, not an empty listbox, and the hint is what gets announced. */}
          {open && matches.length === 0 ? (
            <p className={`${styles.list} ${styles.empty}`} aria-hidden="true" data-testid={`${testId}-empty`}>
              {emptyText}
            </p>
          ) : null}
          <span className="eg-sr-only" role="status" aria-live="polite">
            {open && query !== null ? (matches.length === 0 ? emptyText : t("ui.search.results", { count: matches.length })) : ""}
          </span>
        </div>
      )}
    </FieldFrame>
  );
}
