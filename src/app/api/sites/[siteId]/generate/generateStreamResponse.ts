/** SSE response helper for streamed site content generation. */
import type { ContentStreamEvent } from "@/server/services/contentAgentStream";
import * as contentAgentService from "@/server/services/contentAgentService";
import * as imageResolver from "@/server/services/imageResolverService";
import * as sitesRepo from "@/server/repos/sitesRepo";
import * as tokenService from "@/server/services/tokenService";

/**
 * Format one SSE event frame.
 */
function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * Client-safe error detail — avoid leaking env var names / provider URLs.
 */
function publicErrorDetail(err: unknown): string {
  if (err instanceof tokenService.InsufficientTokensError) return err.message;
  if (err instanceof Error) {
    const msg = err.message;
    if (/is not set|api[_ ]?key|authorization/i.test(msg)) {
      return "generation temporarily unavailable";
    }
    return msg.slice(0, 200);
  }
  return "generation failed";
}

/**
 * Refund with one retry; throws if still failing so callers can surface holdOrphaned.
 */
async function refundWithRetry(
  transactionId: string,
  userId: string,
): Promise<void> {
  try {
    await tokenService.refundTokens(transactionId, userId);
  } catch (first) {
    try {
      await tokenService.refundTokens(transactionId, userId);
    } catch (second) {
      console.error("token refund failed after retry", {
        transactionId,
        userId,
        error: second instanceof Error ? second.message : String(second),
        first: first instanceof Error ? first.message : String(first),
      });
      throw second;
    }
  }
}

/**
 * Run streamed generate under a token hold spanning the full SSE lifetime.
 * Persists partial contentJson on each section; injects images once on done.
 */
export function createGenerateSseResponse(input: {
  siteId: string;
  userId: string;
  templateId: string | null;
  sectionSchema: Record<string, unknown>;
  idempotencyKey: string;
  profile: Record<string, unknown>;
  theme: Record<string, unknown>;
  moderation: unknown;
}): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(sseEvent(event, data)));
      };

      let hold: {
        transactionId: string;
        status: "pending" | "committed" | "refunded";
        cost: number;
      } | null = null;
      let usedFallback = false;
      let finalContent: Record<string, unknown> = {};
      let holdPending = false;

      try {
        hold = await tokenService.reserveTokens({
          userId: input.userId,
          actionType: "full_generation",
          idempotencyKey: input.idempotencyKey,
          siteId: input.siteId,
        });

        // Empty transactionId = unlimited / zero-cost — always run generate.
        // Non-empty + committed = idempotent replay — return cached site, no LLM.
        // Non-empty + refunded = refuse (caller must use a new key).
        if (hold.transactionId && hold.status === "committed") {
          const site = await sitesRepo.get(input.siteId);
          send("ready", {
            siteId: input.siteId,
            templateId: input.templateId,
            moderation: input.moderation,
            replay: true,
          });
          send("done", {
            usedFallback: false,
            cost: 0,
            replay: true,
            contentPresent: Boolean(site?.contentJson),
          });
          return;
        }
        if (hold.transactionId && hold.status === "refunded") {
          send("error", {
            detail: "idempotency key already refunded — use a new key",
            status: 409,
          });
          return;
        }
        if (hold.transactionId && hold.status !== "pending") {
          send("error", {
            detail: "invalid token hold state",
            status: 409,
          });
          return;
        }
        holdPending = Boolean(hold.transactionId);

        send("ready", {
          siteId: input.siteId,
          templateId: input.templateId,
          moderation: input.moderation,
        });

        const accumulated: Record<string, unknown> = {
          ...(((await sitesRepo.get(input.siteId))?.contentJson as Record<string, unknown>) ??
            {}),
        };

        const agentStream: AsyncGenerator<ContentStreamEvent> =
          contentAgentService.generateSiteContentStreaming({
            businessProfile: input.profile,
            sectionSchema: input.sectionSchema,
          });

        for await (const evt of agentStream) {
          if (evt.type === "section") {
            accumulated[evt.key] = evt.content;
            await sitesRepo.updateFields(input.siteId, { contentJson: { ...accumulated } });
            send("section", { key: evt.key, content: evt.content });
          } else if (evt.type === "done") {
            usedFallback = evt.usedFallback;
            finalContent = evt.content;
          }
        }

        const withImages = imageResolver.injectResolvedImagesIntoContent({
          content: finalContent,
          theme: input.theme,
          businessProfile: input.profile,
        });

        await sitesRepo.updateFields(input.siteId, {
          contentJson: withImages.content,
          themeJson: withImages.theme,
          businessProfileJson: input.profile,
        });

        if (holdPending && hold.transactionId) {
          if (usedFallback) {
            await refundWithRetry(hold.transactionId, input.userId);
          } else {
            await tokenService.commitTokens(hold.transactionId);
          }
          holdPending = false;
        }

        send("done", {
          usedFallback,
          cost: tokenService.actionCost("full_generation"),
        });
      } catch (err) {
        let holdOrphaned = false;
        if (holdPending && hold?.transactionId) {
          try {
            await refundWithRetry(hold.transactionId, input.userId);
            holdPending = false;
          } catch {
            holdOrphaned = true;
          }
        }
        const status =
          err instanceof tokenService.InsufficientTokensError ? 402 : 500;
        send("error", {
          detail: publicErrorDetail(err),
          status,
          ...(holdOrphaned ? { holdOrphaned: true } : {}),
          ...(err instanceof tokenService.InsufficientTokensError
            ? { balance: err.balance, cost: err.cost }
            : {}),
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
