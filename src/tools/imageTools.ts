/**
 * chatgpt_generate_image: create images with OpenAI's image models and
 * return them to Claude as real image content (Claude can see them).
 */
import { z } from "zod";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { assertModelAllowed } from "../config.js";
import { safe, type ToolContext } from "./shared.js";

export function registerImageTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "chatgpt_generate_image",
    {
      title: "Generate an image with OpenAI",
      description:
        "Create an image from a text description using OpenAI's image model (the same family ChatGPT uses). " +
        "The image is returned so Claude can see and describe it. If IMAGE_OUTPUT_DIR is set, it is also saved to disk.",
      inputSchema: {
        prompt: z.string().min(1).max(32_000).describe("A detailed description of the image."),
        size: z
          .enum(["auto", "1024x1024", "1536x1024", "1024x1536"])
          .optional()
          .describe("Image size. 1536x1024 is landscape, 1024x1536 is portrait. Default: auto."),
        quality: z.enum(["auto", "low", "medium", "high"]).optional().describe("Quality. Higher costs more."),
        count: z.number().int().min(1).max(4).optional().describe("How many images (1 to 4). Default 1."),
        model: z.string().optional().describe("Image model. Default: OPENAI_IMAGE_MODEL (gpt-image-2)."),
      },
      annotations: { readOnlyHint: false, openWorldHint: true },
    },
    safe(ctx, "chatgpt_generate_image", async (args) => {
      const model = args.model?.trim() || ctx.config.imageModel;
      assertModelAllowed(ctx.config, model);
      const res = await ctx.backend.generateImage({
        model,
        prompt: args.prompt,
        size: args.size,
        quality: args.quality,
        n: args.count ?? 1,
      });

      const saved: string[] = [];
      if (ctx.config.imageOutputDir) {
        const dir = resolve(ctx.config.imageOutputDir);
        mkdirSync(dir, { recursive: true });
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        res.images.forEach((img, i) => {
          const file = join(dir, `chatgpt-image-${stamp}-${i + 1}.png`);
          writeFileSync(file, Buffer.from(img.base64, "base64"));
          saved.push(file);
        });
      }

      const content: CallToolResult["content"] = res.images.map((img) => ({
        type: "image" as const,
        data: img.base64,
        mimeType: img.mimeType,
      }));
      const notes = [`Generated ${res.images.length} image(s) with ${res.model}.`];
      res.images.forEach((img, i) => {
        if (img.revisedPrompt) notes.push(`Image ${i + 1} revised prompt: ${img.revisedPrompt}`);
      });
      if (saved.length) notes.push(`Saved to:\n${saved.map((s) => `- ${s}`).join("\n")}`);
      else notes.push("Tip: set IMAGE_OUTPUT_DIR in the server config to also save images to disk.");
      content.push({ type: "text", text: notes.join("\n") });
      return { content };
    }),
  );
}
