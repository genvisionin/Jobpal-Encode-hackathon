/**
 * Shared UI types for Jobpal.
 *
 * Domain/data shapes live with their features:
 *  - resume/JD/tailoring → `src/lib/schema`
 *  - persisted records    → `src/lib/db/types`
 *  - jobs                 → `src/lib/jobs/types`
 *
 * This module holds only small, cross-cutting UI types.
 */

import type { IconName } from "@/lib/icon-paths";

/** Resume thumbnail/template layout family. */
export type ResumeLayout = "modern" | "classic" | "sidebar";

/** Tracker decision outcome (shared by the stepper + rows). */
export type ApplicationOutcome = "offer" | "rejected" | null;

/** A primary navigation rail item. */
export interface NavItem {
  id: string;
  label: string;
  icon: IconName;
  href: string;
  badge?: string;
}
