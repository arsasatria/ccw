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

const coderRouter: BaseRouter = {
  name: "coder",
  description: `This agent is solely responsible for helping users write code. This agent could not call tools. This agent is used for writing and modifying code when the user provides clear and specific coding requirements. For example, tasks like implementing a quicksort algorithm in JavaScript or creating an HTML layout. If the user's request is unclear or cannot be directly translated into code, please route the task to 'think' first for clarification or further processing.`,
  run(args) {
    const client = createClient({
      apiKey: process.env.CODER_AGENT_API_KEY,
      baseURL: process.env.CODER_AGENT_BASE_URL,
    });
    delete args.tools;
    args.messages.forEach((item) => {
      if (Array.isArray(item.content)) {
        item.content = JSON.stringify(item.content);
      }
    });
    return client.chat.completions.create({
      ...args,
      messages: [
        ...args.messages,
        {
          role: "system",
          content:
            "You are a code writer who helps users write code based on their specific requirements. You create algorithms, implement functionality, and build structures according to the clear instructions provided by the user. Your focus is solely on writing code, ensuring that the task is completed accurately and efficiently.",
        },
      ],
      model: process.env.CODER_AGENT_MODEL as string,
    });
  },
};


const useToolRouter: BaseRouter = {
  name: "use-tool",
  description: `This agent can call user-specified tools to perform tasks. The user provides a list of tools to be used, and the agent integrates these tools to complete the specified tasks efficiently. The agent follows user instructions and ensures proper tool utilization for each request`,
  run(args) {
    const client = createClient({
      apiKey: process.env.TOOL_AGENT_API_KEY,
      baseURL: process.env.TOOL_AGENT_BASE_URL,
    });
    return client.chat.completions.create({
      ...args,
      messages: [
        ...args.messages,
        {
          role: "system",
          content:
            "You need to select the appropriate tool for the task based on the user’s request. Review the requirements and choose the tool that fits the task best.",
        },
      ],
      model: process.env.TOOL_AGENT_MODEL as string,
    });
  },
};

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
    this.routers = [coderRouter, useToolRouter, thinkRouter];
    this.client = createClient({
      apiKey: process.env.ROUTER_AGENT_API_KEY,
      baseURL: process.env.ROUTER_AGENT_BASE_URL,
    });
  }
  async route(
    args: OpenAI.Chat.Completions.ChatCompletionCreateParams
  ): Promise<any> {
    log(`Route: ${JSON.stringify(args, null, 2)}`);
    const res: OpenAI.Chat.Completions.ChatCompletion =
      await this.client.chat.completions.create({
        ...args,
        messages: [
          ...args.messages,
          {
            role: "system",
            content: `You are an AI task router and executor, responsible for understanding user requests and directing them to the appropriate processing mode or tool based on the task type and requirements. Your main responsibility is to determine the nature of the request, execute the task when possible, and respond appropriately.

### **Guidelines:**
- **If an external tool is required to complete the task (such as searching for information, generating images, or modifying code), route the task to \`use-tool\` rather than handling it directly.**  
- If the task requires generating an image, route to \`use-tool\` and specify the image generation tool.  
- If the task requires searching for information, route to \`use-tool\` and specify the search tool.  
- If the task requires modifying or executing code, route to \`use-tool\` and specify the code handling tool.  
- **Do NOT execute the tool action directly; always trigger it through \`use-tool\`.**  

- **If the user is chatting casually or having a general conversation, respond naturally and conversationally. Improving the user experience through friendly interactions is one of your main responsibilities.**  

- **If the user's request involves deep thinking, complex reasoning, or multi-step analysis, use the "think" mode to break down and solve the problem.**  

- **If the user's request involves coding or technical implementation, use the "coder" mode to generate or modify code.**  
   - **After generating the code, if the task requires applying or integrating the code, route to \`use-tool\` and specify the code execution tool.**  
   - **Do NOT re-trigger "coder" to apply code — route to \`use-tool\` instead.**  

### **Format requirements:**
- When you need to trigger a specific mode (such as "think", "coder", or "use-tool"), return the following JSON format:

### IMPORTANT:
- 你不能也不会调用BatchTool，如果你需要使用工具请路由到\`use-tool\`，由\`use-tool\`来调用BatchTool。

\`\`\`json
{
  "use": "<mode-name>",
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
      return [res];
    }
    const router = this.routers.find((item) => item.name === result.use);
    if (!router) {
      (res.choices[0] as any).delta = res.choices[0].message;
      log(`No Router: ${JSON.stringify(res.choices[0].message)}`);
      return [res];
    }
    log(`Use Router: ${router.name}`);
    if (router.name === "think" || router.name === "coder") {
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
