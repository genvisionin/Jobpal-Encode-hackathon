"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  getTracker,
  connectTracker,
  syncTracker,
  disconnectTracker,
  getBilling,
  ApiError,
  type TrackerSnapshot,
} from "@/lib/api-client";
import { TrackerList } from "./TrackerList";
import { TrackerSkeleton } from "./TrackerSkeleton";
import { lowestPlanWith } from "@/lib/billing/plans";

const EMPTY_SNAPSHOT: TrackerSnapshot = {
  status: { connected: false, gmailConfigured: false },
  applications: [],
  stats: null,
};

export function TrackerView() {
  const router = useRouter();
  const params = useSearchParams();
  const [snapshot, setSnapshot] = useState<TrackerSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncNote, setSyncNote] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);

  const load = useCallback(async () => {
    try {
      const [snap, billing] = await Promise.all([
        getTracker(),
        getBilling().catch(() => null),
      ]);
      setSnapshot(snap);
      if (billing) setLocked(!billing.features.includes("gmail_tracker"));
    } catch {
      setSnapshot(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (params.get("connect")) {
      router.replace("/tracker");
      void load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  async function handleConnect() {
    setConnecting(true);
    setConnectError(null);
    try {
      const res = await connectTracker();
      window.location.href = res.authUrl;
    } catch (err) {
      if (err instanceof ApiError && err.code === "FEATURE_LOCKED") {
        setLocked(true);
        setConnecting(false);
        return;
      }
      const message =
        err instanceof ApiError ? err.message : "Couldn't start the connection. Please try again.";
      setConnectError(message);
      setConnecting(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    setSyncNote(null);
    try {
      const res = await syncTracker();
      setSnapshot((prev) =>
        prev
          ? { ...prev, status: { ...prev.status, lastSyncedAt: new Date().toISOString() }, applications: res.applications, stats: res.stats }
          : prev,
      );
      const { scanned, created, updated } = res.summary;
      if (created || updated) {
        setSyncNote(
          `Synced — ${created} new, ${updated} updated from ${scanned} email${scanned === 1 ? "" : "s"}.`,
        );
      } else if (scanned > 0) {
        setSyncNote(`Scanned ${scanned} email${scanned === 1 ? "" : "s"} — no new applications found.`);
      } else {
        setSyncNote("No new job-related emails since the last sync.");
      }
    } catch (err) {
      setSyncNote(
        err instanceof ApiError ? `Sync failed: ${err.message}` : "Sync failed. Please try again.",
      );
    } finally {
      setSyncing(false);
    }
  }

  async function handleDisconnect() {
    await disconnectTracker();
    await load();
  }

  if (loading) {
    return <TrackerSkeleton />;
  }

  const data = snapshot ?? EMPTY_SNAPSHOT;
  const connected = data.status.connected;
  const gmailConfigured = data.status.gmailConfigured;

  return (
    <TrackerList
      snapshot={data}
      connected={connected}
      locked={locked}
      gmailConfigured={gmailConfigured}
      connecting={connecting}
      connectError={connectError}
      syncing={syncing}
      syncNote={syncNote}
      requiredPlanName={lowestPlanWith("gmail_tracker").name}
      onConnect={handleConnect}
      onSync={handleSync}
      onDisconnect={handleDisconnect}
      onApplicationsChange={(applications, stats) =>
        setSnapshot((prev) =>
          prev
            ? { ...prev, applications, stats }
            : { status: { connected: false, gmailConfigured }, applications, stats },
        )
      }
    />
  );
}
