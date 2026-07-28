import { describe, expect, it } from "vitest";
import { z } from "zod";

/**
 * Mirrors the ChatMessageSchema used by sites POST/PATCH routes.
 * Keeps schema regressions covered without spinning up Next request handlers.
 */
const ChatMessageSchema = z
  .object({
    id: z.string(),
    role: z.enum(["user", "assistant"]),
    content: z.string(),
    timestamp: z.string(),
  })
  .passthrough();

const SiteChatPatch = z.object({
  chatHistoryJson: z.array(ChatMessageSchema).optional(),
});

describe("site chatHistoryJson schema", () => {
  it("accepts ChatMessage arrays with optional extras", () => {
    const parsed = SiteChatPatch.parse({
      chatHistoryJson: [
        {
          id: "m1",
          role: "user",
          content: "Gym in Jaipur",
          timestamp: "2026-07-24T10:00:00.000Z",
          attachments: [{ id: "a1", name: "logo.png" }],
        },
      ],
    });
    expect(parsed.chatHistoryJson).toHaveLength(1);
  });

  it("rejects invalid roles", () => {
    expect(() =>
      SiteChatPatch.parse({
        chatHistoryJson: [
          {
            id: "m1",
            role: "system",
            content: "nope",
            timestamp: "2026-07-24T10:00:00.000Z",
          },
        ],
      }),
    ).toThrow();
  });
});
