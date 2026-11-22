"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { LegacyFrame } from "../legacy-frame";
import { SignOut } from "./[role]/sign-out";

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  const content = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const workspace = content.current;
    if (!workspace) return;

    function hide() {
      if (workspace) workspace.hidden = true;
    }
    function restore(event: PageTransitionEvent) {
      if (event.persisted) window.location.reload();
    }

    window.addEventListener("pagehide", hide);
    window.addEventListener("pageshow", restore);
    window.addEventListener("workspace-access-lost", hide);
    return () => {
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("pageshow", restore);
      window.removeEventListener("workspace-access-lost", hide);
    };
  }, []);

  return (
    <LegacyFrame>
      <div ref={content}>
        <div className="workspace-session"><SignOut /></div>
        {children}
      </div>
    </LegacyFrame>
  );
}
