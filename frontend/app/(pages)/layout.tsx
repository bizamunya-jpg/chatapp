import { AppShell } from "@/components/layout/app-shell";

export default function PagesLayout({ children }: LayoutProps<"/">) {
  return <AppShell>{children}</AppShell>;
}
