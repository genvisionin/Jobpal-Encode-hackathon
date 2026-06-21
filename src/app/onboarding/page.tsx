import Link from "next/link";
import { redirect } from "next/navigation";
import { Aurora, Logo, Icon } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { getProfile } from "@/lib/services/profile-service";
import { ChoiceTile } from "./_components/ChoiceTile";

export const metadata = { title: "Welcome · Jobpal" };
export const dynamic = "force-dynamic";

const STEPS: [Parameters<typeof Icon>[0]["name"], string, "done" | "now" | "next"][] = [
  ["check", "Create your account", "done"],
  ["user", "Tell us your name", "done"],
  ["doc", "Add your experience", "now"],
  ["sparkle", "Tailor to any job", "next"],
];

/**
 * Onboarding — split-stage first run. The editorial left panel shows
 * progress; the right offers the two paths: upload or build.
 */
export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const profile = await getProfile(user.id);
  const displayName = (profile?.resume.contact.name || user.name || "").trim();
  const greeting = displayName ? `Welcome, ${displayName.split(" ")[0]}.` : "Welcome.";

  return (
    <div className="onb-root" style={{ position: "fixed", inset: 0, display: "flex" }}>
      {/* left editorial */}
      <div
        className="onb-aside"
        style={{
          width: "42%",
          minWidth: 360,
          position: "relative",
          overflow: "hidden",
          background: "linear-gradient(160deg,#5E5CE6,#4845c4 55%,#3a2f9e)",
        }}
      >
        <div
          style={{
            position: "absolute",
            width: 500,
            height: 500,
            borderRadius: "50%",
            right: -160,
            top: -120,
            background: "radial-gradient(circle,rgba(255,107,157,.6),transparent 70%)",
            filter: "blur(40px)",
          }}
        />
        <div
          style={{
            position: "absolute",
            width: 460,
            height: 460,
            borderRadius: "50%",
            left: -140,
            bottom: -160,
            background: "radial-gradient(circle,rgba(52,196,214,.5),transparent 70%)",
            filter: "blur(40px)",
          }}
        />
        <div
          style={{
            position: "relative",
            zIndex: 2,
            padding: "56px 52px",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            color: "#fff",
          }}
        >
          <Logo size={22} mono />
          <div style={{ marginTop: "auto" }}>
            <div className="mono" style={{ fontSize: 12, opacity: 0.7, marginBottom: 18 }}>
              SETTING UP YOUR STUDIO
            </div>
            <h1 style={{ fontSize: 56, lineHeight: 1.02, fontWeight: 800, letterSpacing: "-0.04em" }}>
              One profile.
              <br />
              Infinite tailored
              <br />
              resumes.
            </h1>
            <div style={{ marginTop: 40, display: "flex", flexDirection: "column", gap: 16 }}>
              {STEPS.map(([icon, label, state]) => (
                <div
                  key={label}
                  style={{ display: "flex", alignItems: "center", gap: 14, opacity: state === "next" ? 0.5 : 1 }}
                >
                  <div
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: state === "done" ? "rgba(255,255,255,.95)" : "rgba(255,255,255,.18)",
                      border: "1px solid rgba(255,255,255,.4)",
                      color: state === "done" ? "var(--accent)" : "#fff",
                    }}
                  >
                    <Icon name={state === "done" ? "check" : icon} size={16} stroke={2.4} />
                  </div>
                  <span style={{ fontSize: 16, fontWeight: state === "now" ? 600 : 400 }}>{label}</span>
                  {state === "now" && (
                    <span
                      className="mono"
                      style={{
                        fontSize: 10,
                        marginLeft: "auto",
                        background: "rgba(255,255,255,.2)",
                        padding: "3px 8px",
                        borderRadius: 99,
                      }}
                    >
                      YOU&apos;RE HERE
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* right interactive */}
      <div className="onb-main" style={{ flex: 1, position: "relative" }}>
        <Aurora />
        <div
          className="onb-panel"
          style={{
            position: "relative",
            zIndex: 2,
            height: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "56px 64px",
            maxWidth: 620,
          }}
        >
          {/* brand mark — only shown on phones, where the editorial panel is hidden */}
          <Link href="/customize" aria-label="Jobpal home" className="onb-mobile-logo">
            <Logo size={21} />
          </Link>
          <h2 className="onb-title" style={{ fontSize: 32, fontWeight: 600, letterSpacing: "-0.025em" }}>
            {greeting} Do you have a resume?
          </h2>
          <p style={{ fontSize: 16, color: "var(--ink-2)", marginTop: 10 }}>
            Choose how you&apos;d like to start. We&apos;ll build your profile from here.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 30 }}>
            <Link href="/intake">
              <ChoiceTile
                icon="upload"
                accent
                title="Yes — upload it"
                body="Drop a PDF or DOCX. We extract your details and you review them in seconds."
              />
            </Link>
            <Link href="/builder">
              <ChoiceTile
                icon="sparkle"
                title="No — help me build one"
                body="Talk it through or fill a guided form. Great for first resumes and big rewrites."
              />
            </Link>
          </div>
          <Link
            href="/customize"
            className="btn btn-ghost btn-sm"
            style={{ marginTop: 24, alignSelf: "flex-start" }}
          >
            Skip for now — I&apos;ll do this later
          </Link>
        </div>
      </div>
    </div>
  );
}
