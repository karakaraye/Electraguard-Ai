"use client";

import { useMemo } from "react";
import type { StateAreasResponse } from "../../lib/api/types";
import { useT } from "../../lib/i18n/client";
import { Banner } from "../Banner/Banner";
import { Button } from "../Button/Button";
import { Select } from "../Field/Select";
import { normalise, SearchSelect, type SearchOption } from "../SearchSelect/SearchSelect";
import { RetryIcon } from "../icons";
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
 * lists on this phone, or drill State → LGA → Ward → Unit. "I don't know the
 * polling unit" keeps the ward only. Never GPS.
 */
export function PollingUnitPicker({
  states,
  areas,
  status,
  value,
  onChange,
  onRetry,
  error,
  "data-testid": testId = "polling-unit-picker",
}: PollingUnitPickerProps) {
  const t = useT();
  const state = value.state_code ? areas[value.state_code] : undefined;
  const lga = state?.lgas.find((item) => item.lga_code === value.lga_code);
  const ward = lga?.wards.find((item) => item.ward_code === value.ward_code);
  const listReady = status.kind === "ready" && Boolean(state);

  const unitOptions = useMemo<UnitOption[]>(() => {
    const options: UnitOption[] = [];
    for (const data of Object.values(areas)) {
      for (const l of data.lgas) {
        for (const w of l.wards) {
          for (const [code, name] of w.units) {
            options.push({
              value: code,
              label: name,
              detail: `${code} · ${w.name} · ${l.name}`,
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

  const searchDisabled = unitOptions.length === 0;

  return (
    <div className={styles.picker} data-testid={testId}>
      <SearchSelect
        label={t("o07.searchLabel")}
        hint={searchDisabled ? t("o07.searchNeedsState") : t("o07.searchHint")}
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

      <p className={styles.divider}>
        <span>{t("o07.orChoose")}</span>
      </p>

      <div className={styles.drill}>
        <Select
          label={t("o07.state")}
          placeholder={t("o07.choose")}
          options={(states ?? []).map((item) => ({ value: item.state_code, label: item.name }))}
          value={value.state_code ?? ""}
          disabled={!states}
          onChange={(event) =>
            emit({ state_code: event.target.value || null, lga_code: null, ward_code: null, polling_unit_code: null, unknown_unit: false })
          }
          data-testid={`${testId}-state`}
        />
        <Select
          label={t("o07.lga")}
          placeholder={t("o07.choose")}
          options={(state?.lgas ?? []).map((item) => ({ value: item.lga_code, label: item.name }))}
          value={value.lga_code ?? ""}
          disabled={!listReady}
          onChange={(event) => emit({ ...value, lga_code: event.target.value || null, ward_code: null, polling_unit_code: null, unknown_unit: false })}
          data-testid={`${testId}-lga`}
        />
        <Select
          label={t("o07.ward")}
          placeholder={t("o07.choose")}
          options={(lga?.wards ?? []).map((item) => ({ value: item.ward_code, label: item.name }))}
          value={value.ward_code ?? ""}
          disabled={!listReady || !lga}
          onChange={(event) => emit({ ...value, ward_code: event.target.value || null, polling_unit_code: null })}
          data-testid={`${testId}-ward`}
        />
        <Select
          label={t("o07.unit")}
          placeholder={t("o07.choose")}
          options={(ward?.units ?? []).map(([code, name]) => ({ value: code, label: `${name} (${code})` }))}
          value={value.polling_unit_code ?? ""}
          disabled={!listReady || !ward || value.unknown_unit}
          onChange={(event) => emit({ ...value, polling_unit_code: event.target.value || null, unknown_unit: false })}
          data-testid={`${testId}-unit`}
        />
      </div>

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
          <span className={styles.unknownNote}>{t("o07.unknownUnitNote")}</span>
        </span>
      </label>

      {value.state_code && status.kind === "downloading" ? (
        <p className={styles.status} role="status" data-testid={`${testId}-downloading`}>
          {status.percent === null ? t("o07.listDownloadingNoPercent") : t("o07.listDownloading", { percent: status.percent })}
        </p>
      ) : null}
      {(value.state_code && (status.kind === "missing" || status.kind === "error")) || !states ? (
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
        </Banner>
      ) : null}
    </div>
  );
}
