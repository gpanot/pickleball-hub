import type { Metadata } from "next";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { SettingsForm } from "./SettingsForm";
import { AiChatSettingsSection } from "./AiChatSettingsSection";

export const metadata: Metadata = { title: "Admin Settings" };
export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  if (!(await isAdminAuthenticated())) {
    redirect("/admin/login?next=/admin/settings");
  }

  const [settings, aiChatSettings] = await Promise.all([
    prisma.adminSettings.upsert({
      where: { id: "singleton" },
      create: { id: "singleton" },
      update: {},
    }),
    prisma.aiChatSettings.upsert({
      where: { id: "singleton" },
      create: { id: "singleton" },
      update: {},
    }),
  ]);

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-12">
      {/* Content generation settings */}
      <div>
        <div className="mb-8">
          <h1 className="text-lg font-semibold">Settings</h1>
          <p className="text-xs text-gray-500 mt-0.5">LLM model configuration and budget for content generation</p>
        </div>
        <SettingsForm settings={JSON.parse(JSON.stringify(settings))} />
      </div>

      {/* Divider */}
      <div className="border-t border-gray-800" />

      {/* AI Chat settings */}
      <div>
        <div className="mb-8">
          <h1 className="text-lg font-semibold">AI Chat</h1>
          <p className="text-xs text-gray-500 mt-0.5">Configure the AI assistant behavior, context window, and cost controls</p>
        </div>
        <AiChatSettingsSection initial={JSON.parse(JSON.stringify(aiChatSettings))} />
      </div>
    </div>
  );
}
