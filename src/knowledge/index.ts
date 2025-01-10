import {
  Plugin,
  Provider,
  IAgentRuntime,
  Memory,
  State,
  elizaLogger,
  knowledge,
} from "@elizaos/core";
import fs from "fs";
function cleanText(text: string): string {
  const cleaned = text
    .replace(/<@!?\d+>/g, "") // Discord mentions
    .replace(/<#\d+>/g, "") // Discord channels
    .replace(/<@&\d+>/g, "") // Discord roles
    .replace(/(?:^|\s)@[\w_]+/g, "") // Platform mentions
    .trim();

  return cleaned;
}

function containsAnyWord(text: string, words: string[] = []) {
  return (
    words.length === 0 ||
    words.some((word) => {
      if (word.includes(" ")) {
        return text.includes(word.toLowerCase());
      }
      const regex = new RegExp(`\\b${word}\\b`, "i");
      return regex.test(text);
    })
  );
}

async function validateQuery(text: string): Promise<boolean> {
  // Default general queries - everything else comes from config
  const keywords = {
    generalQueries: [
      "knowledge",
      "how",
      "know",
      "what",
      "where",
      "explain",
      "show",
      "tell",
      "will",
      "why",
      "features",
      "use",
      "using",
      "work",
      "access",
      "get",
    ],
  };

  try {
    const hasGeneralQuery = containsAnyWord(text, keywords.generalQueries);

    const isValid = hasGeneralQuery;

    elizaLogger.info(`✅ Pushing knowledge? ${isValid}`);
    return isValid;
  } catch (error) {
    elizaLogger.warn(`❌ Error in Local validation:\n${error}`);
    return false;
  }
}

export const localProvider: Provider = {
  get: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State
  ): Promise<string> => {
    try {
      const text = message.content.text.toLowerCase().trim();

      const isValidQuery = await validateQuery(text);

      if (!isValidQuery) {
        elizaLogger.info("⚠️ Local Query validation failed");
        return "";
      }

      const cleanedQuery = cleanText(message.content.text).split("github:")[1];

      let knowledge =
        "I'm giving you a list of files with their content. You can use this information to answer questions about the files, after the answer point to the file name and the line number where the answer is from.\n";
      knowledge += "==INIT-FILE: story.txt==\n";
      const story = fs.readFileSync("./repo/story.txt", "utf8");
      knowledge += story;
      knowledge += "\n==END-FILE: story.txt==\n";
      return knowledge;
    } catch (error) {
      elizaLogger.error("❌ Error in Local provider:", error);
      return "";
    }
  },
};

export const persistentKnowledgePlugin: Plugin = {
  name: "Persistent Knowledge",
  description: "Plugin for querying persistent knowledge",
  actions: [],
  providers: [localProvider],
  evaluators: [],
};

export default persistentKnowledgePlugin;
