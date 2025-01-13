import {
  Plugin,
  Provider,
  IAgentRuntime,
  Memory,
  State,
  elizaLogger,
} from "@elizaos/core";
import fs from "fs";

function levenshtein(str1: string, str2: string): number {
  const m = str1.length;
  const n = str2.length;

  // Create a matrix of size (m+1)x(n+1) filled with zeros
  const dp: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0));

  // Initialize first row and column
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  // Fill in the rest of the matrix
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        // Characters match - no operation needed
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        // Take minimum of three operations:
        dp[i][j] = Math.min(
          dp[i - 1][j - 1] + 1, // substitution
          dp[i - 1][j] + 1, // deletion
          dp[i][j - 1] + 1 // insertion
        );
      }
    }
  }

  // Return the bottom-right cell of the matrix
  return dp[m][n];
}

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

interface Match {
  lineNumber: number;
  content: string;
  context: string[];
  score: number;
  matchedTerms: Array<{
    query: string;
    matched: string;
    similarity: number;
  }>;
}

function calculateSimilarity(str1: string, str2: string): number {
  const distance = levenshtein(str1.toLowerCase(), str2.toLowerCase());
  const maxLength = Math.max(str1.length, str2.length);
  return 1 - distance / maxLength;
}

function findFuzzyMatches(
  text: string,
  queryWords: string[],
  similarityThreshold = 0.8
): Array<{ word: string; similarity: number }> {
  const textWords = text.toLowerCase().split(/\s+/);
  const matches: Array<{ word: string; similarity: number }> = [];

  for (const queryWord of queryWords) {
    for (const textWord of textWords) {
      const similarity = calculateSimilarity(queryWord, textWord);
      if (similarity >= similarityThreshold) {
        matches.push({ word: textWord, similarity });
      }
    }
  }

  return matches;
}

function findRelevantContent(
  content: string,
  query: string,
  contextLines: number = 2,
  minWordMatchRatio: number = 0.6,
  similarityThreshold: number = 0.8
): Match[] {
  const lines = content.split("\n");
  const matches: Match[] = [];
  const queryWords = query
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 0);
  const minWordsRequired = Math.ceil(queryWords.length * minWordMatchRatio);

  lines.forEach((line, index) => {
    const fuzzyMatches = findFuzzyMatches(
      line,
      queryWords,
      similarityThreshold
    );

    if (fuzzyMatches.length >= minWordsRequired) {
      const contextStart = Math.max(0, index - contextLines);
      const contextEnd = Math.min(lines.length, index + contextLines + 1);

      const score =
        fuzzyMatches.reduce((sum, match) => sum + match.similarity, 0) /
        fuzzyMatches.length;

      matches.push({
        lineNumber: index + 1,
        content: line.trim(),
        context: lines.slice(contextStart, contextEnd),
        score,
        matchedTerms: fuzzyMatches.map((match) => ({
          query:
            queryWords.find(
              (q) => calculateSimilarity(q, match.word) >= similarityThreshold
            ) || "",
          matched: match.word,
          similarity: match.similarity,
        })),
      });
    }
  });

  return matches.sort((a, b) => b.score - a.score);
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
        elizaLogger.info("⚠️ Knowledge Query validation failed");
        return "";
      }

      const cleanedQuery = cleanText(message.content.text);

      const filesInFolder = fs.readdirSync("./repo");
      let knowledge =
        "Here are the relevant matches (sorted by similarity):\n\n";

      for (const file of filesInFolder) {
        elizaLogger.info(`🔍 Processing file: ${file}`);
        const fileContent = fs.readFileSync(`./repo/${file}`, "utf8");
        const matches = findRelevantContent(fileContent, cleanedQuery);

        if (matches.length > 0) {
          knowledge += `==INIT-FILE: ${file}==\n`;
          knowledge += fileContent;
          knowledge += `==END-FILE: ${file}==\n\n`;
        }
      }

      elizaLogger.info(`🔍 Knowledge: ${knowledge}`);

      return knowledge || "No matching content found in the repository.";
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
