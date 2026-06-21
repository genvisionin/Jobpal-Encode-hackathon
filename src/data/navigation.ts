import type { NavItem } from "@/types";

/** Primary navigation rail items for the authenticated app. */
export const navItems: NavItem[] = [
  { id: "customize", label: "Customize CV", icon: "sparkle", href: "/customize" },
  { id: "alerts", label: "Job Alerts", icon: "bell", href: "/alerts" },
  { id: "tracker", label: "Tracker", icon: "list", href: "/tracker" },
  { id: "resumes", label: "My Resumes", icon: "doc", href: "/resumes" },
  { id: "profile", label: "My Profile", icon: "user", href: "/profile" },
];
