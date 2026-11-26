"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

type HeaderState = {
  /** A page-supplied heading, such as a case reference, in place of the section title. */
  title: string | null;
  setTitle: (title: string | null) => void;
  /** The text last submitted in the header search; the queue narrows its rows to it. */
  search: string;
  setSearch: (search: string) => void;
};

const HeaderContext = createContext<HeaderState>({ title: null, setTitle: () => {}, search: "", setSearch: () => {} });

export function StaffHeaderProvider({ children }: { children: ReactNode }) {
  const [title, setTitle] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const value = useMemo(() => ({ title, setTitle, search, setSearch }), [title, search]);
  return <HeaderContext.Provider value={value}>{children}</HeaderContext.Provider>;
}

export function useStaffHeaderState(): HeaderState {
  return useContext(HeaderContext);
}

/** A page calls this to put its own heading (for example the case reference) in the shell header. */
export function useStaffTitle(title: string | null | undefined): void {
  const { setTitle } = useContext(HeaderContext);
  useEffect(() => {
    setTitle(title ?? null);
    return () => setTitle(null);
  }, [title, setTitle]);
}
