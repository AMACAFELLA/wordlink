import { Devvit } from "@devvit/public-api";
import type { JSONValue } from "@devvit/public-api";
import { WebViewMessage } from "../types/index.js";
import {
  submitScore,
  fetchLeaderboard,
  sendInitialData,
} from "../services/messageHandlers.js";
import {
  validateWord,
  WordValidationResult,
} from "../services/wordValidation.js";
import { getTopicWords } from "../services/gameService.js";
import { topics } from "../data/topics.js";

// Message types
interface WordSubmissionResponse {
  type: "wordSubmissionConfirmed";
  data: {
    word: string;
    chain: string[];
    score: number;
    combo: number;
    topic: string;
    validation: WordValidationResult;
  };
}

interface ErrorResponse {
  type: "error";
  data: {
    message: string;
  };
}

interface SubmitScoreMessage {
  type: "submitScore";
  data: {
    playerName: string;
    score: number;
    isDaily?: boolean;
  };
}

interface FetchLeaderboardMessage {
  type: "fetchLeaderboard";
  data: {
    tab: string;
  };
}

interface ReadyMessage {
  type: "ready";
}

// Get topic types from topics.ts
type TopicType = (typeof topics)[number]["topic"];

export function WordLinkGame({ context }: { context: Devvit.Context }) {
  const handleMessage = async (rawMessage: JSONValue) => {
    try {
      const message = rawMessage as WebViewMessage;

      switch (message.type) {
        case "submitScore":
          console.log("Processing score submission:", message.data);
          if (!context.userId || !context.postId) {
            throw new Error("Missing user or post ID");
          }
          await submitScore(context, {
            playerName: message.data.playerName,
            score: message.data.score,
            t2: context.userId,
            t3: context.postId,
            subreddit: context.subredditName || "",
            isDaily: message.data.isDaily || false
          });
          break;

        case "wordSubmission":
          console.log("Processing word submission:", message.data);
          const { word, chain, score, combo, topic } = message.data;

          try {
            // Validate the word using wordValidation service
            const topicWords = await getTopicWords(context, topic);
            const lastWord =
              chain.length > 0 ? chain[chain.length - 1] : undefined;

            const validation = await validateWord(word, topicWords, lastWord);
            console.log("Word validation result:", validation);

            // Update score and combo based on validation
            const basePoints = validation.isValid ? word.length : 0;
            const comboMultiplier = Math.min(
              3,
              Math.max(1, Math.floor(combo / 5))
            );
            const points = basePoints * comboMultiplier;
            const penalty = validation.isValid ? 0 : -5;

            const updatedScore = Math.max(0, score + points + penalty);
            const updatedCombo = validation.isValid ? combo + 1 : 1;
            const updatedChain = validation.isValid ? [...chain, word] : chain;

            // Keep the same topic for invalid words
            let updatedTopic = topic;
            if (validation.isValid) {
              // Get available topics from topics.ts
              const availableTopics = topics.map((t) => t.topic);
              do {
                updatedTopic =
                  availableTopics[
                    Math.floor(Math.random() * availableTopics.length)
                  ];
              } while (updatedTopic === topic && availableTopics.length > 1);
            }

            // Add points/penalty information to validation result
            validation.score = validation.isValid ? points : penalty;

            // Send response back to client
            const response = {
              type: "devvit-message",
              data: {
                type: "wordSubmissionConfirmed",
                data: {
                  word,
                  chain: updatedChain,
                  score: updatedScore,
                  combo: updatedCombo,
                  topic: updatedTopic,
                  validation: {
                    isValid: validation.isValid,
                    reason: validation.reason,
                    score: validation.score,
                  },
                },
              },
            };

            await context.ui.webView.postMessage(
              "myWebView",
              response as unknown as JSONValue
            );
          } catch (error) {
            console.error("Error validating word:", error);
            const errorResponse = {
              type: "devvit-message",
              data: {
                type: "error",
                data: {
                  message: "Error validating word. Please try again.",
                },
              },
            };
            await context.ui.webView.postMessage(
              "myWebView",
              errorResponse as unknown as JSONValue
            );
          }
          break;

        case "fetchLeaderboard":
          console.log("Fetching leaderboard:", message.data);
          if (!context.postId) {
            throw new Error("Missing post ID");
          }
          await fetchLeaderboard(context, {
            tab: message.data.tab,
            t3: context.postId,
          });
          break;

        case "ready":
          console.log("WebView ready");
          if (!context.postId) {
            throw new Error("Missing post ID");
          }
          await sendInitialData(context);
          break;

        default:
          console.warn("Unknown message type:", message?.type);
      }
    } catch (error) {
      console.error("Error handling message:", error);
      const errorResponse = {
        type: "devvit-message",
        data: {
          type: "error",
          data: {
            message:
              error instanceof Error ? error.message : "An error occurred",
          },
        },
      };
      await context.ui.webView.postMessage(
        "myWebView",
        errorResponse as unknown as JSONValue
      );
    }
  };

  return (
    <vstack grow padding="small">
      <vstack border="thick" borderColor="black" height="100%">
        <webview
          id="myWebView"
          url="page.html"
          onMessage={handleMessage}
          grow
          height="100%"
        />
      </vstack>
    </vstack>
  );
}
