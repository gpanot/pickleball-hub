import OpenAI from "openai";

let _deepseekClient: OpenAI | null = null;

export function getDeepseekClient(): OpenAI {
  if (!_deepseekClient) {
    _deepseekClient = new OpenAI({
      baseURL: "https://api.deepseek.com",
      apiKey: process.env.DEEPSEEK_API_KEY ?? "placeholder",
    });
  }
  return _deepseekClient;
}

/** @deprecated use getDeepseekClient() */
export const deepseekClient = new Proxy({} as OpenAI, {
  get(_target, prop) {
    return getDeepseekClient()[prop as keyof OpenAI];
  },
});
