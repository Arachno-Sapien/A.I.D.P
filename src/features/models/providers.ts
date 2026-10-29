import type { ConnectionKind } from "../../lib/bindings";

export interface ProviderPreset {
  id: string;
  label: string;
  kind: ConnectionKind;
  baseUrl: string;
}

export const CUSTOM_ID = "custom";

export const PROVIDERS: ProviderPreset[] = [
  {
    id: "openai",
    label: "OpenAI",
    kind: "openaiCompat",
    baseUrl: "https://api.openai.com/v1",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    kind: "openaiCompat",
    baseUrl: "https://openrouter.ai/api/v1",
  },
  {
    id: "groq",
    label: "Groq",
    kind: "openaiCompat",
    baseUrl: "https://api.groq.com/openai/v1",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    kind: "openaiCompat",
    baseUrl: "https://api.deepseek.com/v1",
  },
  {
    id: "gemini",
    label: "Gemini",
    kind: "openaiCompat",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    kind: "anthropic",
    baseUrl: "https://api.anthropic.com/v1",
  },
];
