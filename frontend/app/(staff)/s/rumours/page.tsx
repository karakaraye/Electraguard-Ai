"use client";

import { useEffect, useState } from "react";
import { api } from "../../../../lib/api/client";
import type { Claim, ClaimMatchesResponse, Language, SeenOn } from "../../../../lib/api/types";
import { useT } from "../../../../lib/i18n/client";
import { RumourView } from "../_views/RumourView";

export default function RumoursPage() {
  const t = useT();

  const [claims, setClaims] = useState<Claim[]>([]);
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null);
  const [matches, setMatches] = useState<ClaimMatchesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<string>("");

  // Get current user display name
  useEffect(() => {
    void (async () => {
      const res = await api("AUTH-07", {});
      if (res.ok && res.data.authenticated && res.data.user) {
        setCurrentUser(res.data.user.display_name || "");
      }
    })();
  }, []);

  // Fetch claims
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await api("RUM-01.list", { query: {} });
        if (cancelled) return;
        if (!res.ok) {
          if (res.status === 404) {
            setError(t("staff.endpointNotReady"));
          } else {
            setError(res.error?.message || t("staff.networkError"));
          }
          return;
        }

        setClaims(res.data.items);
        if (!selectedClaimId && res.data.items.length > 0) {
          setSelectedClaimId(res.data.items[0].id);
        }
      } catch {
        if (!cancelled) setError(t("staff.networkError"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedClaimId, t]);

  // Fetch matches when selectedClaimId changes
  useEffect(() => {
    if (!selectedClaimId) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await api("RUM-02", { params: { id: selectedClaimId } });
        if (!cancelled && res.ok) {
          setMatches(res.data);
        }
      } catch {
        // Ignored
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedClaimId]);

  const selectedClaim = claims.find((c) => c.id === selectedClaimId) || null;

  const refreshClaim = async (id: string) => {
    try {
      const res = await api("RUM-01.get", { params: { id } });
      if (res.ok) {
        setClaims(claims.map((c) => (c.id === id ? res.data : c)));
      }
    } catch {
      // Ignored
    }
  };

  const handleCreateClaim = async (text: string, seenOn: SeenOn, language: Language) => {
    try {
      const res = await api("RUM-01.create", {
        body: { text, seen_on: seenOn, language },
      });
      if (res.ok) {
        setClaims([res.data, ...claims]);
        setSelectedClaimId(res.data.id);
      }
    } catch {
      // Ignored
    }
  };

  const handleSaveDraft = async (id: string, text: string, version: number) => {
    try {
      const res = await api("RUM-03.save_draft", {
        params: { id },
        body: { text, language: "en", version },
      });
      if (res.ok) {
        refreshClaim(id);
      }
    } catch {
      // Ignored
    }
  };

  const handleApprove = async (id: string, version: number) => {
    try {
      const res = await api("RUM-03.approve", {
        params: { id },
        body: { version },
      });
      if (res.ok) {
        refreshClaim(id);
      }
    } catch {
      // Ignored
    }
  };

  const handleReject = async (id: string, note: string, version: number) => {
    try {
      const res = await api("RUM-03.reject", {
        params: { id },
        body: { note, version },
      });
      if (res.ok) {
        refreshClaim(id);
      }
    } catch {
      // Ignored
    }
  };

  const handleDismiss = async (id: string, note: string, version: number) => {
    try {
      const res = await api("RUM-03.dismiss", {
        params: { id },
        body: { note, version },
      });
      if (res.ok) {
        refreshClaim(id);
      }
    } catch {
      // Ignored
    }
  };

  return (
    <RumourView
      claims={claims}
      selectedClaim={selectedClaim}
      matches={matches}
      loading={loading}
      error={error}
      currentUserName={currentUser}
      onSelectClaim={setSelectedClaimId}
      onCreateClaim={handleCreateClaim}
      onSaveDraft={handleSaveDraft}
      onApprove={handleApprove}
      onReject={handleReject}
      onDismiss={handleDismiss}
    />
  );
}
