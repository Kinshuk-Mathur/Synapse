import type { getGroqModelByKey } from "../groq.js";
import {
  classifyModelPrompt as classifyModelPromptJs,
  getAiRouterDecision as getAiRouterDecisionJs,
  PROMPT_TYPES,
  ROUTE_RULES,
  selectModelForPrompt as selectModelForPromptJs
} from "./router.js";

export type GroqModel = ReturnType<typeof getGroqModelByKey>;
export type PromptType = "general" | "reasoning" | "lightweight";

export function classifyModelPrompt(userPrompt: string): {
  promptType: PromptType;
  modelKey: string;
} {
  return classifyModelPromptJs(userPrompt);
}

export function getAiRouterDecision(userPrompt: string): {
  promptType: PromptType;
  modelKey: string;
  model: GroqModel;
} {
  return getAiRouterDecisionJs(userPrompt);
}

export function selectModelForPrompt(userPrompt: string): GroqModel {
  return selectModelForPromptJs(userPrompt);
}

export { PROMPT_TYPES, ROUTE_RULES };
