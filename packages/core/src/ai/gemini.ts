import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { BriefingSummary, ExtractedFacts, Recommendation, WrapUp } from "../schemas";
import type { AiProvider } from "./provider";
import { briefingPrompt, extractPrompt, recommendPrompt, wrapUpPrompt } from "./prompts";

const TIMEOUT_MS = 20_000;

/** The JSON Schema sent to Gemini as `responseJsonSchema`. Exported so tests can check it without a key. */
export function jsonSchemaFor(schema: z.ZodType) {
  const { $schema: _ignored, ...rest } = z.toJSONSchema(schema) as Record<string, unknown>;
  return rest;
}

/**
 * Gemini via the Google Gen AI SDK. Works with either a Gemini API key
 * (AI Studio) or Vertex AI (GOOGLE_GENAI_USE_VERTEXAI=true + project/location).
 */
export class GeminiProvider implements AiProvider {
  readonly name = "gemini" as const;
  private client: Pick<GoogleGenAI, "models">;

  constructor(
    readonly model: string,
    opts: {
      apiKey?: string;
      vertexai?: boolean;
      project?: string;
      location?: string;
      /** Injected in tests so the request and response handling run without a key. */
      client?: Pick<GoogleGenAI, "models">;
    },
  ) {
    this.client =
      opts.client ??
      (opts.vertexai
        ? new GoogleGenAI({ vertexai: true, project: opts.project, location: opts.location ?? "global" })
        : new GoogleGenAI({ apiKey: opts.apiKey }));
  }

  private async generate<S extends z.ZodType>(
    schema: S,
    prompt: { system: string; user: string },
  ): Promise<z.infer<S>> {
    const response = await this.client.models.generateContent({
      model: this.model,
      contents: [{ role: "user", parts: [{ text: prompt.user }] }],
      config: {
        systemInstruction: prompt.system,
        temperature: 0.2,
        responseMimeType: "application/json",
        responseJsonSchema: jsonSchemaFor(schema),
        abortSignal: AbortSignal.timeout(TIMEOUT_MS),
      },
    });
    const text = response.text;
    if (!text) throw new Error("Gemini returned an empty response");
    return schema.parse(JSON.parse(text));
  }

  briefing(input: Parameters<AiProvider["briefing"]>[0]) {
    return this.generate(BriefingSummary, briefingPrompt(input));
  }
  extractFacts(input: Parameters<AiProvider["extractFacts"]>[0]) {
    return this.generate(ExtractedFacts, extractPrompt(input));
  }
  recommend(input: Parameters<AiProvider["recommend"]>[0]) {
    return this.generate(Recommendation, recommendPrompt(input));
  }
  wrapUp(input: Parameters<AiProvider["wrapUp"]>[0]) {
    return this.generate(WrapUp, wrapUpPrompt(input));
  }
}
