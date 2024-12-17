import { Devvit, JSONValue } from "@devvit/public-api";
import { validateWord } from "./wordValidation.js";
import { topics } from "../data/topics.js";

interface WordSubmissionData {
  word: string;
  chain: string[];
  score: number;
  combo: number;
  topic: string;
  topicWords?: string[];
}

interface ExtendedGameState {
  chain: string[];
  score: number;
  topic: string;
  lastWord: string;
  lastUpdate: number;
  topicWords: string[];
}

interface TopicData {
  topic: string;
  words: string[];
}

// Redis keys
const REDIS_KEYS = {
  TOPICS_CACHE: "topics_cache",
  GAME_STATE: "game_state",
  LEADERBOARD: "leaderboard",
  DAILY_CHALLENGE: "daily_challenge",
  USER_DAILY_CHALLENGE: "user_daily_challenge:", // Prefix for user-specific daily challenge data
};

async function loadTopicData(): Promise<TopicData[]> {
  // Directly use predefined topics from topics.ts
  return topics;
}

export async function getCurrentTopics(): Promise<string[]> {
  const topicData = await loadTopicData();
  return topicData.map((td) => td.topic);
}

export async function getTopicWords(
  context: Devvit.Context,
  topic: string
): Promise<string[]> {
  try {
    // Find the topic in predefined topics
    const topicInfo = topics.find((t) => t.topic === topic);
    if (!topicInfo) {
      throw new Error(`Topic not found: ${topic}`);
    }
    return topicInfo.words;
  } catch (error) {
    console.error("Error getting topic words:", error);
    return [];
  }
}

export async function sendInitialData(context: Devvit.Context) {
  const { redis } = context;
  
  try {
    // Load topics
    const currentTopics = await getCurrentTopics();
    const randomTopic = currentTopics[Math.floor(Math.random() * currentTopics.length)];
    const topicWords = await getTopicWords(context, randomTopic);

    // Get user's last daily challenge date
    const userId = context.userId || 'anonymous';
    const lastDailyChallengeDate = await redis.get(REDIS_KEYS.USER_DAILY_CHALLENGE + userId);

    // Initialize game state
    const initialState: ExtendedGameState = {
      chain: [],
      score: 0,
      topic: randomTopic,
      lastWord: "",
      lastUpdate: Date.now(),
      topicWords,
    };

    await redis.set(REDIS_KEYS.GAME_STATE, JSON.stringify(initialState));

    return {
      type: "INITIAL_DATA",
      data: {
        gameState: initialState,
        lastDailyChallengeDate: lastDailyChallengeDate ? new Date(parseInt(lastDailyChallengeDate)) : null,
      },
    };
  } catch (error) {
    console.error("Error sending initial data:", error);
    throw error;
  }
}

export async function handleWordSubmission(
  context: Devvit.Context,
  submissionData: WordSubmissionData
) {
  const { word, chain, score, combo, topic } = submissionData;

  try {
    // Basic validation
    if (!word || !topic) {
      return {
        word,
        chain,
        score,
        combo,
        topic,
        validation: {
          isValid: false,
          reason: "Missing word or topic",
          score: score,
        },
      };
    }

    if (!context.postId || !context.userId) {
      return {
        word,
        chain,
        score,
        combo,
        topic,
        validation: {
          isValid: false,
          reason: "Missing post ID or user ID",
          score: score,
        },
      };
    }

    // Get topic words directly from topics.ts
    const topicData = topics.find((t) => t.topic === topic);
    if (!topicData) {
      return {
        word,
        chain,
        score,
        combo,
        topic,
        validation: {
          isValid: false,
          reason: "Invalid topic",
          score: score,
        },
      };
    }

    const topicWords = topicData.words;

    // Get the last word in the chain if it exists
    const lastWord = chain.length > 0 ? chain[chain.length - 1] : undefined;

    // Check if word was already used
    if (chain.includes(word)) {
      return {
        word,
        chain,
        score,
        combo,
        topic,
        validation: {
          isValid: false,
          reason: "This word has already been used",
          score: score,
        },
      };
    }

    // Validate word
    const validation = await validateWord(word, topicWords, lastWord);
    if (!validation.isValid) {
      // Deduct points for invalid words
      const penalty = 5;
      const newScore = Math.max(0, score - penalty);

      return {
        word,
        chain,
        score: newScore,
        combo: 1, // Reset combo on invalid word
        topic,
        validation: {
          isValid: false,
          reason: validation.reason || "Invalid word",
          score: newScore,
        },
      };
    }

    // Calculate points based on word length and combo
    const basePoints = word.length;
    const comboMultiplier = Math.min(3, Math.max(1, Math.floor(combo / 5)));
    const totalPoints = basePoints * comboMultiplier;
    const newScore = score + totalPoints;

    // Create updated chain with new word
    const updatedChain = [...chain, word];

    // Return success response
    return {
      word,
      chain: updatedChain,
      score: newScore,
      combo: combo + 1,
      topic,
      validation: {
        isValid: true,
        score: newScore,
      },
    };
  } catch (error) {
    console.error("Error handling word submission:", error);
    return {
      word,
      chain,
      score,
      combo,
      topic,
      validation: {
        isValid: false,
        reason:
          error instanceof Error ? error.message : "Error validating word",
        score: score,
      },
    };
  }
}

export async function handleDailyChallenge(context: Devvit.Context) {
  const { redis } = context;
  const userId = context.userId || 'anonymous';
  
  try {
    // Store the timestamp of when user played daily challenge
    await redis.set(REDIS_KEYS.USER_DAILY_CHALLENGE + userId, Date.now().toString());
    
    return {
      type: "DAILY_CHALLENGE_STARTED",
      data: {
        timestamp: Date.now(),
      },
    };
  } catch (error) {
    console.error("Error handling daily challenge:", error);
    throw error;
  }
}
