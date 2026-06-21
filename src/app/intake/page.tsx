import { Aurora } from "@/components/ui";
import { IntakeFlow } from "./_components/IntakeFlow";

export const metadata = { title: "Upload your resume · Jobpal" };

/** Intake — upload a resume and review the extracted profile. */
export default function IntakePage() {
  return (
    <div style={{ position: "fixed", inset: 0, overflowY: "auto" }}>
      <Aurora />
      <IntakeFlow />
    </div>
  );
}
