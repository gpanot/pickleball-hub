import type { Metadata } from "next";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { redirect } from "next/navigation";
import { AiAssistantClient } from "./AiAssistantClient";

export const metadata: Metadata = { title: "AI Assistant (Experimental)" };
export const dynamic = "force-dynamic";

export default async function AdminAiAssistantPage() {
  if (!(await isAdminAuthenticated())) {
    redirect("/admin/login?next=/admin/ai-assistant");
  }

  return <AiAssistantClient />;
}
