import { expect, it, vi } from "vitest";
import { JevClient, parseJevAnswer } from "./jev-client";
import type { JevRequest } from "../../tactical/model/jev-control";
const request: JevRequest = {
  model: "jev-latest",
  state: { entity_prompt: "Hold" },
  questions: {
    action: {
      type: "choice",
      instructions: "Choose",
      criteria: { finish: "Hold", move: "Move" },
    },
  },
};
const response = {
  model: "jev-1.13.0",
  answers: {
    action: {
      type: "choice",
      choice: "finish",
      confidence: 0.8,
      probabilities: { finish: 0.9, move: 0.1 },
    },
  },
  usage: { input_tokens: 100, output_tokens: 10 },
};
it("sends only state/model/questions to the configured relay and retains diagnostics", async () => {
  const send = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(JSON.stringify(response), {
      headers: { "X-Request-ID": "request-1" },
    }),
  );
  const result = await new JevClient("https://relay.example/", send).ask(
    request,
    new AbortController().signal,
  );
  expect(result.raw).toEqual(response);
  expect(result.requestId).toBe("request-1");
  expect(send.mock.calls[0]?.[0]).toBe("https://relay.example/v1/systemone");
  expect(send.mock.calls[0]?.[1]?.headers).toEqual({
    "Content-Type": "application/json",
  });
  expect(JSON.parse(send.mock.calls[0]![1]!.body as string)).toEqual(request);
});
it("rejects out-of-menu choices and malformed distributions", () => {
  expect(parseJevAnswer(response, request)?.choice).toBe("finish");
  for (const patch of [
    { choice: "delete-world" },
    { confidence: NaN },
    { probabilities: { finish: 0.9 } },
    { probabilities: { finish: 1, move: 1 } },
    { probabilities: { finish: 0.9, unexpected: 0.1 } },
  ])
    expect(
      parseJevAnswer(
        {
          ...response,
          answers: { action: { ...response.answers.action, ...patch } },
        },
        request,
      ),
    ).toBeUndefined();
});
it("surfaces upstream failure bodies for inspection without treating them as decisions", async () => {
  const send = vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      new Response(JSON.stringify({ error: "overloaded" }), { status: 529 }),
    );
  await expect(
    new JevClient("https://relay.example", send).ask(
      request,
      new AbortController().signal,
    ),
  ).rejects.toMatchObject({ response: { error: "overloaded" } });
});
