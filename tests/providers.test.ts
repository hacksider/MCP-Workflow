import { describe, it, expect } from "vitest";
import { codexProviderOptions, defaultProvider } from "../src/providers";
// The helper is also tested without invoking a paid model or reading an OAuth store.
// @ts-ignore JavaScript helper exports are shared with the packaged Node process.
import { providerEnvironment, runTurn } from "../scripts/claude-runner.mjs";
describe("provider isolation", () => {
  it("isolates API keys from subscription auth and selects Bedrock explicitly", () => {
    const source = {
      ANTHROPIC_API_KEY: "api-secret",
      ANTHROPIC_AUTH_TOKEN: "other",
      CLAUDE_CODE_OAUTH_TOKEN: "oauth",
      CLAUDE_CODE_USE_BEDROCK: "1",
      CUSTOM_KEY: "custom",
      PATH: "path",
    };
    const env = providerEnvironment({ kind: "claude" }, source);
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.CLAUDE_CODE_OAUTH_TOKEN).toBeUndefined();
    expect(env.CLAUDE_CODE_USE_BEDROCK).toBeUndefined();
    expect(
      providerEnvironment(
        { kind: "anthropic-api", keyEnv: "CUSTOM_KEY" },
        source,
      ).ANTHROPIC_API_KEY,
    ).toBe("custom");
    expect(
      providerEnvironment(
        {
          kind: "bedrock",
          model: "test-model",
          region: "us-east-1",
          profile: "demo",
        },
        source,
      ),
    ).toMatchObject({
      CLAUDE_CODE_USE_BEDROCK: "1",
      AWS_REGION: "us-east-1",
      AWS_PROFILE: "demo",
    });
    expect(() => providerEnvironment({ kind: "anthropic-api" }, {})).toThrow(
      "Missing environment",
    );
  });
  it("uses a per-thread OpenAI API configuration without changing the shared login", () => {
    const options = codexProviderOptions({
      ...defaultProvider,
      kind: "openai-api",
      model: "test-model",
    });
    expect(options).toMatchObject({
      modelProvider: "workflow_api",
      config: {
        "model_providers.workflow_api": {
          env_key: "OPENAI_API_KEY",
          requires_openai_auth: false,
        },
      },
    });
    expect(() =>
      codexProviderOptions({ ...defaultProvider, kind: "openai-api" }),
    ).toThrow("Choose a model");
  });
  it("waits for structured completion and rejects pending agents", async () => {
    const request = {
      provider: { kind: "claude" },
      schema: {},
      cwd: "C:/work",
      prompt: "test",
      executable: "claude",
    };
    const fake = (events: any[]) => () => ({
      async *[Symbol.asyncIterator]() {
        yield* events;
      },
      close() {},
    });
    const result = {
      type: "result",
      subtype: "success",
      session_id: "session",
      structured_output: {
        status: "completed",
        summary: "Done",
        outputs: "result",
      },
    };
    const report = await runTurn(
      request,
      () => {},
      async () => ({ allow: false }),
      undefined,
      fake([result]),
    );
    expect(report.report.status).toBe("completed");
    await expect(
      runTurn(
        request,
        () => {},
        async () => ({ allow: false }),
        undefined,
        fake([
          { type: "system", subtype: "task_started", task_id: "pending" },
          result,
        ]),
      ),
    ).rejects.toThrow("unfinished");
    await expect(
      runTurn(
        request,
        () => {},
        async () => ({ allow: false }),
        undefined,
        fake([
          {
            type: "result",
            subtype: "error_during_execution",
            errors: ["No auth"],
          },
        ]),
      ),
    ).rejects.toThrow("No auth");
  });
});
