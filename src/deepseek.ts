import { OpenAI } from "openai";
import { createClient } from "./utils";
import { log } from "./utils/log";
export interface BaseRouter {
  name: string;
  description: string;
  run: (
    args: OpenAI.Chat.Completions.ChatCompletionCreateParams
  ) => Promise<any>;
}

const thinkRouter: BaseRouter = {
  name: "think",
  description: `This agent is used solely for complex reasoning and thinking tasks. It should not be called for information retrieval or repetitive, frequent requests. Only use this agent for tasks that require deep analysis or problem-solving. If there is an existing result from the Thinker agent, do not call this agent again.你只负责深度思考以拆分任务，不需要进行任何的编码和调用工具。最后讲拆分的步骤按照顺序返回。比如\n1. xxx\n2. xxx\n3. xxx`,
  run(args) {
    const client = createClient({
      apiKey: process.env.THINK_AGENT_API_KEY,
      baseURL: process.env.THINK_AGENT_BASE_URL,
    });
    const messages = JSON.parse(JSON.stringify(args.messages));
    messages.forEach((msg: any) => {
      if (Array.isArray(msg.content)) {
        msg.content = JSON.stringify(msg.content);
      }
    });

    let startIdx = messages.findIndex((msg: any) => msg.role !== "system");
    if (startIdx === -1) startIdx = messages.length;

    for (let i = startIdx; i < messages.length; i++) {
      const expectedRole = (i - startIdx) % 2 === 0 ? "user" : "assistant";
      messages[i].role = expectedRole;
    }

    if (
      messages.length > 0 &&
      messages[messages.length - 1].role === "assistant"
    ) {
      messages.push({
        role: "user",
        content:
          "Please follow the instructions provided above to resolve the issue.",
      });
    }
    delete args.tools;
    return client.chat.completions.create({
      ...args,
      messages,
      model: process.env.THINK_AGENT_MODEL as string,
    });
  },
};

export class Router {
  routers: BaseRouter[];
  client: OpenAI;
  constructor() {
    this.routers = [thinkRouter];
    this.client = createClient({
      apiKey: process.env.ROUTER_AGENT_API_KEY,
      baseURL: process.env.ROUTER_AGENT_BASE_URL,
    });
  }
  async route(
    args: OpenAI.Chat.Completions.ChatCompletionCreateParams
  ): Promise<any> {
    log(`Request Router: ${JSON.stringify(args, null, 2)}`);
    const res: OpenAI.Chat.Completions.ChatCompletion =
      await this.client.chat.completions.create({
        ...args,
        messages: [
          ...args.messages,
          {
            role: "system",
            content: `## **Guidelines:**  
- **Trigger the "think" mode when the user's request involves deep thinking, complex reasoning, or multi-step analysis.**  
- **Criteria:**  
    - Involves multi-layered logical reasoning or causal analysis  
    - Requires establishing connections or pattern recognition between different pieces of information  
    - Involves cross-domain knowledge integration or weighing multiple possibilities  
    - Requires creative thinking or non-direct inference  
### **Format requirements:**  
- When you need to trigger the "think" mode, return the following JSON format:  
\`\`\`json
{
  "use": "think"
}
\`\`\`
`,
          },
        ],
        model: process.env.ROUTER_AGENT_MODEL as string,
        stream: false,
      });
    let result;
    try {
      const text = res.choices[0].message.content;
      if (!text) {
        throw new Error("No text");
      }
      result = JSON.parse(
        text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)
      );
    } catch (e) {
      (res.choices[0] as any).delta = res.choices[0].message;
      log(`No Router: ${JSON.stringify(res.choices[0].message)}`);
      return [res];
    }
    const router = this.routers.find((item) => item.name === result.use);
    if (!router) {
      (res.choices[0] as any).delta = res.choices[0].message;
      log(`No Router: ${JSON.stringify(res.choices[0].message)}`);
      return [res];
    }
    log(`Use Router: ${router.name}`);
    if (router.name === "think") {
      const agentResult = await router.run({
        ...args,
        stream: false,
      });
      try {
        args.messages.push({
          role: "user",
          content:
            `${router.name} Agent Result: ` +
            agentResult.choices[0].message.content,
        });
        log(
          `${router.name} Agent Result: ` +
            agentResult.choices[0].message.content
        );
        return await this.route(args);
      } catch (error) {
        console.log(agentResult);
        throw error;
      }
    }
    return router.run(args);
  }
}
