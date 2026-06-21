import { Suspense } from "react";
import { TrackerView } from "./_components/TrackerView";

export const metadata = { title: "Tracker · Jobpal" };

/** Application Tracker — connect Gmail, then watch applications update themselves. */
export default function TrackerPage() {
  return (
    <Suspense fallback={null}>
      <TrackerView />
    </Suspense>
  );
}
