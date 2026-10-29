export type Provider = {
  kind: "chatgpt" | "claude" | "openai-api" | "anthropic-api" | "bedrock";
  model: string;
  keyEnv: string;
  region: string;
  profile: string;
};
export const defaultProvider: Provider = {
  kind: "chatgpt",
  model: "",
  keyEnv: "",
  region: "",
  profile: "",
};
export const isClaude = (p: Provider) =>
  ["claude", "anthropic-api", "bedrock"].includes(p.kind);
export const providerLabel = (p: Provider) =>
  ({
    chatgpt: "ChatGPT subscription",
    claude: "Claude subscription",
    "openai-api": "OpenAI API",
    "anthropic-api": "Claude API",
    bedrock: "Amazon Bedrock",
  })[p.kind];
export function codexProviderOptions(p: Provider) {
  if (p.kind !== "openai-api") return p.model ? { model: p.model } : {};
  if (!p.model.trim())
    throw Error("Choose a model for OpenAI API in Workflow settings");
  const key = p.keyEnv || "OPENAI_API_KEY";
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key))
    throw Error("Use an environment variable name for the API key");
  return {
    model: p.model,
    modelProvider: "workflow_api",
    config: {
      "model_providers.workflow_api": {
        name: "OpenAI API",
        base_url: "https://api.openai.com/v1",
        env_key: key,
        wire_api: "responses",
        requires_openai_auth: false,
      },
    },
  };
}
