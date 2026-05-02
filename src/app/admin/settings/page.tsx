import type { Metadata } from "next";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { SettingsForm } from "./SettingsForm";

export const metadata: Metadata = { title: "Admin Settings" };
export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  if (!(await isAdminAuthenticated())) {
    redirect("/admin/login?next=/admin/settings");
  }

  const settings = await prisma.adminSettings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton" },
    update: {},
  });

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-lg font-semibold">Settings</h1>
        <p className="text-xs text-gray-500 mt-0.5">LLM model configuration and budget</p>
      </div>
      <SettingsForm settings={JSON.parse(JSON.stringify(settings))} />
    </div>
  );
}
