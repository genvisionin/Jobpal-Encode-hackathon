import { redirect } from "next/navigation";

/** Entry point — sign-in is handled upstream, so land in the dashboard. */
export default function Home() {
  redirect("/customize");
}
