"use client";

import { useEffect, useState } from "react";
import { api } from "../../../../lib/api/client";
import type { HideReason, ModerationFlag } from "../../../../lib/api/types";
import { useT } from "../../../../lib/i18n/client";
import { DiscussionModView } from "../_views/DiscussionModView";

export default function DiscussionModerationPage() {
  const t = useT();

  const [flags, setFlags] = useState<ModerationFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await api("DIS-05.flags", { query: { status: "open" } });
        if (cancelled) return;
        if (!res.ok) {
          if (res.status === 404) {
            setError(t("staff.endpointNotReady"));
          } else {
            setError(res.error?.message || t("staff.networkError"));
          }
          return;
        }
        setFlags(res.data.items);
      } catch {
        if (!cancelled) setError(t("staff.networkError"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);

  const handleHidePost = async (
    discussionId: string,
    postId: string,
    reason: HideReason,
    note?: string
  ) => {
    try {
      const res = await api("DIS-05.hide_post", {
        params: { id: discussionId, post_id: postId },
        body: { reason, note },
      });
      if (res.ok) {
        setFlags(
          flags.map((f) =>
            f.post.id === postId
              ? { ...f, post: { ...f.post, state: "hidden", hidden_reason: reason } }
              : f
          )
        );
      }
    } catch {
      // Ignored
    }
  };

  const handleUnhidePost = async (discussionId: string, postId: string) => {
    try {
      const res = await api("DIS-05.unhide_post", {
        params: { id: discussionId, post_id: postId },
        body: {},
      });
      if (res.ok) {
        setFlags(
          flags.map((f) =>
            f.post.id === postId
              ? { ...f, post: { ...f.post, state: "visible", hidden_reason: null } }
              : f
          )
        );
      }
    } catch {
      // Ignored
    }
  };

  const handleRemoveMember = async (
    discussionId: string,
    observerCode: string,
    reason: string
  ) => {
    try {
      await api("DIS-05.remove_member", {
        params: { id: discussionId, observer_code: observerCode },
        body: { reason },
      });
    } catch {
      // Ignored
    }
  };

  const handleCloseDiscussion = async (discussionId: string) => {
    try {
      await api("DIS-05.close", {
        params: { id: discussionId },
        body: {},
      });
      setFlags(flags.filter((f) => f.discussion_id !== discussionId));
    } catch {
      // Ignored
    }
  };

  const handleCreateDiscussion = async (title: string, topic: string, lgaCode: string) => {
    try {
      await api("DIS-05.create", {
        body: { title, topic, lga_code: lgaCode },
      });
    } catch {
      // Ignored
    }
  };

  return (
    <DiscussionModView
      flags={flags}
      loading={loading}
      error={error}
      onHidePost={handleHidePost}
      onUnhidePost={handleUnhidePost}
      onRemoveMember={handleRemoveMember}
      onCloseDiscussion={handleCloseDiscussion}
      onCreateDiscussion={handleCreateDiscussion}
    />
  );
}
