import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { sendAiMessage, type ChatMessage } from "@/lib/ai-assistant/chat";

const testSessionId = `test-prompt-${Date.now()}`;

afterAll(async () => {
  await prisma.aiAssistantLog.deleteMany({ where: { sessionId: testSessionId } });
  await prisma.$disconnect();
});

describe("AI assistant system prompt behavior", () => {
  it("answers with specific session data, not generic advice", async () => {
    const response = await sendAiMessage({
      sessionId: testSessionId,
      message: "when can I play today?",
    });

    expect(response.content.length).toBeGreaterThan(50);

    // Should either name a specific time or acknowledge no sessions are available today.
    // Covers: "19:00", "1:30 PM", "19h00", "7h30", "13h"
    const hasTime = /\d{1,2}[h:]\d{2}|\d{1,2}:\d{2}\s*(AM|PM)/i.test(response.content);
    const acknowledgesNoData =
      /no (session|upcoming|available)|không có buổi|hôm nay không|don't have.*time/i.test(
        response.content,
      );

    expect(hasTime || acknowledgesNoData).toBe(true);
  }, 30000);

  it("does not retract a correct answer when challenged", async () => {
    const sessionId = `test-prompt-retract-${Date.now()}`;
    try {
      // First message: get a recommendation
      const first = await sendAiMessage({
        sessionId,
        message: "what sessions are available this afternoon?",
      });
      expect(first.content.length).toBeGreaterThan(20);

      // Challenge the answer
      const history: ChatMessage[] = [
        { role: "user", content: "what sessions are available this afternoon?" },
        { role: "assistant", content: first.content },
      ];

      const second = await sendAiMessage({
        sessionId,
        message: "are you sure that session exists? I don't think that's correct.",
        history,
      });

      // Should NOT immediately capitulate with a blanket apology
      const capitulates =
        /I apologize.*I should not have|I'm sorry.*doesn't exist|I was wrong.*there (is|are) no/i.test(
          second.content,
        );
      expect(capitulates).toBe(false);

      // Should re-check the data — either maintain the answer or explain what it finds
      expect(second.content.length).toBeGreaterThan(20);
    } finally {
      await prisma.aiAssistantLog.deleteMany({ where: { sessionId } });
    }
  }, 60000);

  it("admits when data is genuinely missing", async () => {
    const sessionId = `test-prompt-missing-${Date.now()}`;
    try {
      const response = await sendAiMessage({
        sessionId,
        message:
          "what is the parking situation at the main venue? how many parking spots does it have?",
      });

      // Parking data is not in context — AI should acknowledge this
      const acknowledgesMissing =
        /don't have|not in.*data|no information|cannot confirm|không có thông tin|không biết về bãi đỗ/i.test(
          response.content,
        );
      expect(acknowledgesMissing).toBe(true);
    } finally {
      await prisma.aiAssistantLog.deleteMany({ where: { sessionId } });
    }
  }, 30000);

  it("responds in Vietnamese when asked in Vietnamese", async () => {
    const sessionId = `test-prompt-vi-${Date.now()}`;
    try {
      const response = await sendAiMessage({
        sessionId,
        message: "hôm nay có buổi chơi nào không?",
      });

      // Vietnamese diacritics regex
      const vietnameseChars =
        /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
      expect(response.content).toMatch(vietnameseChars);
    } finally {
      await prisma.aiAssistantLog.deleteMany({ where: { sessionId } });
    }
  }, 30000);
});
