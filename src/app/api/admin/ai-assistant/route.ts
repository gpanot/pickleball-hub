import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { sendAiMessage, type ChatMessage } from "@/lib/ai-assistant/chat";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { messages: ChatMessage[]; sessionId: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { messages, sessionId } = body;
  if (!messages?.length || !sessionId) {
    return NextResponse.json(
      { error: "messages and sessionId are required" },
      { status: 400 },
    );
  }

  // The last message is the new user message; everything before is history.
  const lastMsg = messages[messages.length - 1];
  if (!lastMsg || lastMsg.role !== "user") {
    return NextResponse.json({ error: "Last message must be from user" }, { status: 400 });
  }

  try {
    const result = await sendAiMessage({
      sessionId,
      message: lastMsg.content,
      history: messages.slice(0, -1) as ChatMessage[],
    });

    return NextResponse.json({
      content: result.content,
      usage: result.usage,
      contextMeta: result.contextMeta,
    });
  } catch (e) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}
