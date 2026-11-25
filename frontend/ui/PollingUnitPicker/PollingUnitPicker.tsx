"use client";

import { useMemo, useState } from "react";
import type { StateAreasResponse } from "../../lib/api/types";
import { useT } from "../../lib/i18n/client";
import { Banner } from "../Banner/Banner";
import { Button } from "../Button/Button";
import { Select } from "../Field/Select";
import { normalise, SearchSelect, type SearchOption } from "../SearchSelect/SearchSelect";
import { Sheet } from "../Sheet/Sheet";
import { ChevronRightIcon, RetryIcon } from "../icons";
import styles from "./PollingUnitPicker.module.css";

export type PlaceValue = {
  state_code: string | null;
  lga_code: string | null;
  ward_code: string | null;
  polling_unit_code: string | null;
  /** "I don't know the polling unit": ward only. */
  unknown_unit: boolean;
};

export type PlaceChange = PlaceValue & {
  /** "Unit name, Ward, LGA" or "Ward, LGA", as officially written. */
  label: string | null;
  ward_name: string | null;
};

export type StateListStatus =
  | { kind: "ready" }
  | { kind: "downloading"; percent: number | null }
  | { kind: "missing" }
  | { kind: "error" };

export type PollingUnitPickerProps = {
  /** States from REF-01.index (cached). null when the index itself is not on the phone. */
  states: Array<{ state_code: string; name: string }> | null;
  /** State files already on the phone (REF-01.state). */
  areas: Record<string, StateAreasResponse>;
  /** Status of the chosen state's file. */
  status: StateListStatus;
  value: PlaceValue;
  onChange: (next: PlaceChange) => void;
  onRetry: () => void;
  error?: string;
  /** "Selected: …" confirmation, shown directly under the search field. */
  selected?: string;
  "data-testid"?: string;
};

/** Codes compared with dashes and spaces removed (codes stay opaque strings, contract 1.1). */
export function compactCode(text: string): string {
  return text.replace(/[\s\-_.]/g, "").toLowerCase();
}

type UnitOption = SearchOption & { state: string; lga: string; ward: string; compact: string; haystack: string };

function describe(areas: Record<string, StateAreasResponse>, value: PlaceValue): { label: string | null; ward_name: string | null } {
  const state = value.state_code ? areas[value.state_code] : undefined;
  const lga = state?.lgas.find((item) => item.lga_code === value.lga_code);
  const ward = lga?.wards.find((item) => item.ward_code === value.ward_code);
  if (!lga || !ward) return { label: null, ward_name: null };
  const unit = value.polling_unit_code ? ward.units.find(([code]) => code === value.polling_unit_code) : undefined;
  return {
    label: unit ? `${unit[1]}, ${ward.name}, ${lga.name}` : `${ward.name}, ${lga.name}`,
    ward_name: ward.name,
  };
}

/**
 * Where did it happen? Search by polling-unit code or name across the state
 * lists on this phone. State → LGA → Ward → Unit lives in a sheet behind a quiet
 * link, and "I don't know the polling unit" opens the same sheet for the ward
 * only. Before any list is on the phone, the state is chosen first, inline,
 * because search needs that state's list. Never GPS.
 */
export function PollingUnitPicker({
  states,
  areas,
  status,
  value,
  onChange,
  onRetry,
  error,
  selected,
  "data-testid": testId = "polling-unit-picker",
}: PollingUnitPickerProps) {
  const t = useT();
  const state = value.state_code ? areas[value.state_code] : undefined;
  const lga = state?.lgas.find((item) => item.lga_code === value.lga_code);
  const ward = lga?.wards.find((item) => item.ward_code === value.ward_code);
  const listReady = status.kind === "ready" && Boolean(state);
  /** The area sheet: "area" drills to a unit, "ward" stops at the ward ("I don't know the polling unit"). */
  const [sheet, setSheet] = useState<"area" | "ward" | null>(null);

  const unitOptions = useMemo<UnitOption[]>(() => {
    const options: UnitOption[] = [];
    for (const data of Object.values(areas)) {
      for (const l of data.lgas) {
        for (const w of l.wards) {
          for (const [code, name] of w.units) {
            options.push({
              value: code,
              label: name,
              detail: `${code} · ${w.name}, ${l.name}`,
              state: data.state_code,
              lga: l.lga_code,
              ward: w.ward_code,
              compact: compactCode(code),
              haystack: normalise(`${name} ${w.name} ${l.name}`),
            });
          }
        }
      }
    }
    return options;
  }, [areas]);

  function emit(next: PlaceValue) {
    onChange({ ...next, ...describe(areas, next) });
  }

  function openSheet(wardOnly: boolean) {
    setSheet(wardOnly ? "ward" : "area");
    // Ward only: a ward already chosen is kept and the unit is dropped.
    if (wardOnly && ward && !value.unknown_unit) emit({ ...value, polling_unit_code: null, unknown_unit: true });
  }

  const searchDisabled = unitOptions.length === 0;
  /* Whether the state was first shown inline on this visit. It stays inline once shown, so a list that
     finishes downloading in the background never moves the select out from under someone choosing it. */
  const [startedInline] = useState(searchDisabled);
  /* The list is not on the phone: nothing can be searched or drilled, so say that first and hide what cannot work. */
  const listMissing = (Boolean(value.state_code) && (status.kind === "missing" || status.kind === "error")) || !states;

  const missingCard = listMissing ? (
    <Banner
      tone={status.kind === "error" ? "danger" : "wait"}
      title={t("o07.listMissing")}
      action={
        <Button variant="secondary" icon={<RetryIcon />} onClick={onRetry} data-testid={`${testId}-retry`}>
          {t("ui.retry")}
        </Button>
      }
      data-testid={`${testId}-missing`}
    >
      {status.kind === "error" ? t("common.error.server") : null}
      <span className={styles.missingNote}>{t("o07.listMissingKept")}</span>
    </Banner>
  ) : null;

  const unknownRow = (
    <label className={styles.unknown} data-checked={value.unknown_unit || undefined}>
      <input
        type="checkbox"
        className={styles.checkbox}
        checked={value.unknown_unit}
        disabled={!ward}
        onChange={(event) => emit({ ...value, unknown_unit: event.target.checked, polling_unit_code: null })}
        data-testid={`${testId}-unknown`}
      />
      <span className={styles.unknownText}>
        <span className={styles.unknownLabel}>{t("o07.unknownUnit")}</span>
        <span className={styles.unknownNote}>{t(listMissing ? "o07.unknownUnitNeedsList" : "o07.unknownUnitNote")}</span>
      </span>
    </label>
  );

  if (listMissing) {
    return (
      <div className={styles.picker} data-testid={testId}>
        {missingCard}
        {states ? (
          <Select
            label={t("o07.state")}
            aria-label={t("o07.state")}
            placeholder={t("o07.choose")}
            options={states.map((item) => ({ value: item.state_code, label: item.name }))}
            value={value.state_code ?? ""}
            onChange={(event) =>
              emit({ state_code: event.target.value || null, lga_code: null, ward_code: null, polling_unit_code: null, unknown_unit: false })
            }
            data-testid={`${testId}-state`}
          />
        ) : null}
        {error ? <p className={styles.missingError} role="alert">{error}</p> : null}
        {unknownRow}
      </div>
    );
  }

  /* Nothing on the phone can be searched yet: the state comes first, inline, and its list downloads. */
  const stateInline = searchDisabled || startedInline;
  const stateSelect = (
    <Select
      label={t("o07.state")}
      aria-label={t("o07.state")}
      hint={stateInline ? t("o07.stateFirst") : undefined}
      placeholder={t("o07.choose")}
      options={(states ?? []).map((item) => ({ value: item.state_code, label: item.name }))}
      value={value.state_code ?? ""}
      disabled={!states}
      onChange={(event) =>
        emit({ state_code: event.target.value || null, lga_code: null, ward_code: null, polling_unit_code: null, unknown_unit: false })
      }
      data-testid={`${testId}-state`}
    />
  );
  const downloading = Boolean(value.state_code) && status.kind === "downloading";

  return (
    <div className={styles.picker} data-testid={testId}>
      {stateInline ? stateSelect : null}

      <div className={styles.searchBlock}>
        <SearchSelect
          label={t("o07.searchLabel")}
          hint={t("o07.searchHint")}
          options={unitOptions}
          value={value.polling_unit_code}
          limit={20}
          disabled={searchDisabled}
          error={error}
          filter={(option, query) => {
            const unit = option as UnitOption;
            const code = compactCode(query);
            return (code.length >= 2 && unit.compact.includes(code)) || unit.haystack.includes(normalise(query));
          }}
          noMatchesText={(query) => t("o07.noResults", { query })}
          onChange={(code) => {
            const unit = unitOptions.find((option) => option.value === code);
            if (!unit) {
              emit({ ...value, polling_unit_code: null });
              return;
            }
            emit({ state_code: unit.state, lga_code: unit.lga, ward_code: unit.ward, polling_unit_code: unit.value, unknown_unit: false });
          }}
          data-testid={`${testId}-search`}
        />
        {downloading ? (
          <div className={styles.progress} role="status" data-testid={`${testId}-downloading`}>
            <span className={styles.track} aria-hidden="true">
              <span
                className={styles.bar}
                data-indeterminate={status.percent === null || undefined}
                style={status.percent === null ? undefined : { transform: `scaleX(${Math.max(4, Math.min(100, status.percent)) / 100})` }}
              />
            </span>
            <span className={styles.progressText}>
              {status.percent === null ? t("o07.listDownloadingNoPercent") : t("o07.listDownloading", { percent: status.percent })}
            </span>
          </div>
        ) : null}
      </div>
      <p className={styles.selected} aria-live="polite" data-testid="o07-summary">
        {selected ?? ""}
      </p>

      <div className={styles.links}>
        <button type="button" className={styles.link} onClick={() => openSheet(false)} data-testid={`${testId}-by-area`}>
          <span>{t("o07.byArea")}</span>
          <ChevronRightIcon size={20} aria-hidden="true" />
        </button>
        <button type="button" className={styles.link} onClick={() => openSheet(true)} data-testid={`${testId}-unknown-link`}>
          <span>{t("o07.unknownUnit")}</span>
          <ChevronRightIcon size={20} aria-hidden="true" />
        </button>
      </div>

      <Sheet
        open={sheet !== null}
        onClose={() => setSheet(null)}
        title={t(sheet === "ward" ? "o07.unknownUnit" : "o07.byArea")}
        description={sheet === "ward" ? <p>{t("o07.unknownUnitNote")}</p> : undefined}
        footer={
          <Button block onClick={() => setSheet(null)} data-testid={`${testId}-done`}>
            {t("common.done")}
          </Button>
        }
        data-testid={`${testId}-sheet`}
      >
        <div className={styles.drill}>
          {stateInline ? null : stateSelect}
          <Select
            label={t("o07.lga")}
            aria-label={t("o07.lga")}
            placeholder={t("o07.choose")}
            options={(state?.lgas ?? []).map((item) => ({ value: item.lga_code, label: item.name }))}
            value={value.lga_code ?? ""}
            disabled={!listReady}
            onChange={(event) =>
              emit({ ...value, lga_code: event.target.value || null, ward_code: null, polling_unit_code: null, unknown_unit: sheet === "ward" })
            }
            data-testid={`${testId}-lga`}
          />
          <Select
            label={t("o07.ward")}
            aria-label={t("o07.ward")}
            placeholder={t("o07.choose")}
            options={(lga?.wards ?? []).map((item) => ({ value: item.ward_code, label: item.name }))}
            value={value.ward_code ?? ""}
            disabled={!listReady || !lga}
            onChange={(event) => emit({ ...value, ward_code: event.target.value || null, polling_unit_code: null, unknown_unit: sheet === "ward" })}
            data-testid={`${testId}-ward`}
          />
          {value.unknown_unit ? null : (
            <Select
              label={t("o07.unit")}
              aria-label={t("o07.unit")}
              placeholder={t("o07.choose")}
              options={(ward?.units ?? []).map(([code, name]) => ({ value: code, label: `${name} (${code})` }))}
              value={value.polling_unit_code ?? ""}
              disabled={!listReady || !ward}
              onChange={(event) => emit({ ...value, polling_unit_code: event.target.value || null, unknown_unit: false })}
              data-testid={`${testId}-unit`}
            />
          )}
        </div>
        {unknownRow}
      </Sheet>
    </div>
  );
}
