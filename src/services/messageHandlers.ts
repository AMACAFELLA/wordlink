import { Devvit } from "@devvit/public-api";
import { LeaderboardService } from "./leaderboardService.js";
import {
  LeaderboardTab,
  FrontendLeaderboardTab,
  LeaderboardEntry,
  LeaderboardDataMessage,
} from "../types/leaderboard.js";
import {
  getCurrentTopics,
  getTopicWords,
  handleWordSubmission as validateWordSubmission,
  handleDailyChallenge
} from "./gameService.js";

function wrapDevvitMessage(message: any) {
  return {
    type: "devvit-message",
    data: message,
  };
}

export async function submitScore(
  context: Devvit.Context,
  data: {
    playerName: string;
    score: number;
    t2: string;
    t3: string;
    subreddit: string;
    isDaily?: boolean;
  }
) {
  try {
    // console.log("Submitting score with data:", data);
    // console.log('Received score submission:', data);
    // console.log('isDaily flag:', data.isDaily);
    
    const leaderboardService = new LeaderboardService(
      context.redis,
      data.subreddit
    );

    // Get current user if playerName not provided
    if (!data.playerName) {
      const currentUser = await context.reddit.getCurrentUser();
      if (!currentUser?.username) {
        throw new Error("Unable to get current user");
      }
      data.playerName = currentUser.username;
    }

    const today = new Date().toISOString().split('T')[0];
    // console.log("Updating score with isDaily:", data.isDaily, "date:", today);

    // Update the score with the username
    await leaderboardService.updateScore(
      data.playerName,
      data.score,
      data.t2,
      data.t3,
      data.isDaily || false,
      data.isDaily ? today : undefined
    );

    // Fetch updated leaderboard data
    const currentEntries = data.isDaily
      ? await leaderboardService.getDailyLeaderboard(today)
      : await leaderboardService.getCurrentSubredditLeaderboard(data.t3);

    // console.log("Fetched leaderboard entries:", currentEntries);

    // Send current leaderboard update
    context.ui.webView.postMessage(
      "myWebView",
      wrapDevvitMessage({
        type: "leaderboardData",
        data: {
          tab: data.isDaily ? "daily-challenge" : "this-subreddit",
          entries: currentEntries,
        },
      })
    );

    // If not daily challenge, also update all subreddits leaderboard
    if (!data.isDaily) {
      const allEntries = await leaderboardService.getAllSubredditsLeaderboard();
      context.ui.webView.postMessage(
        "myWebView",
        wrapDevvitMessage({
          type: "leaderboardData",
          data: {
            tab: "all-subreddits",
            entries: allEntries,
          },
        })
      );
    }

    // Send score submission confirmation
    context.ui.webView.postMessage(
      "myWebView",
      wrapDevvitMessage({
        type: "scoreSubmitted",
        data: {
          success: true,
          username: data.playerName,
          isDaily: data.isDaily
        },
      })
    );
  } catch (error) {
    console.error("Error submitting score:", error);
    context.ui.webView.postMessage(
      "myWebView",
      wrapDevvitMessage({
        type: "error",
        data: {
          message:
            error instanceof Error ? error.message : "Error submitting score",
        },
      })
    );
  }
}

export async function fetchLeaderboard(
  context: Devvit.Context,
  data: {
    tab: FrontendLeaderboardTab;
    t3: string;
  }
) {
  try {
    // console.log("Fetching leaderboard:", data);
    const leaderboardService = new LeaderboardService(
      context.redis,
      context.subredditName || ""
    );
    let entries: LeaderboardEntry[] = [];

    if (data.tab === "this-subreddit") {
      entries = await leaderboardService.getCurrentSubredditLeaderboard(data.t3);
      // console.log("Fetched subreddit leaderboard entries:", entries);
    } else if (data.tab === "all-subreddits") {
      entries = await leaderboardService.getAllSubredditsLeaderboard();
      // console.log("Fetched all subreddits leaderboard entries:", entries);
    } else if (data.tab === "daily-challenge") {
      const today = new Date().toISOString().split('T')[0];
      entries = await leaderboardService.getDailyLeaderboard(today);
      // console.log("Fetched daily challenge leaderboard entries:", entries);
    }

    const message: LeaderboardDataMessage = {
      type: "leaderboardData",
      data: {
        tab: data.tab,
        entries,
      },
    };
    context.ui.webView.postMessage("myWebView", wrapDevvitMessage(message));
  } catch (error) {
    console.error("Error fetching leaderboard:", error);
    context.ui.webView.postMessage(
      "myWebView",
      wrapDevvitMessage({
        type: "error",
        data: {
          message:
            error instanceof Error ? error.message : "Error fetching leaderboard",
        },
      })
    );
  }
}

export async function sendInitialData(context: Devvit.Context) {
  try {
    const topics = await getCurrentTopics();
    const currentTopic = topics[Math.floor(Math.random() * topics.length)];
    const topicWords = await getTopicWords(context, currentTopic);

    // Get the current user's username
    const currentUser = await context.reddit.getCurrentUser();
    const username = currentUser?.username;

    if (!username) {
      throw new Error("Unable to get current user");
    }

    context.ui.webView.postMessage(
      "myWebView",
      wrapDevvitMessage({
        type: "initialData",
        data: {
          t3: context.postId,
          subreddit: context.subredditName || "",
          topics,
          currentTopic,
          topicWords,
          username,
        },
      })
    );

    // Fetch initial leaderboard data
    if (context.postId) {
      await fetchLeaderboard(context, {
        tab: "this-subreddit",
        t3: context.postId,
      });
    }
  } catch (error) {
    console.error("Error sending initial data:", error);
    context.ui.webView.postMessage(
      "myWebView",
      wrapDevvitMessage({
        type: "error",
        data: { message: "Failed to load game data" },
      })
    );
  }
}

export async function handleWordSubmission(
  context: Devvit.Context,
  data: {
    word: string;
    chain: string[];
    score: number;
    combo: number;
    topic: string;
  }
) {
  try {
    const result = await validateWordSubmission(context, data);
    context.ui.webView.postMessage(
      "myWebView",
      wrapDevvitMessage({
        type: "wordSubmissionConfirmed",
        data: {
          word: data.word,
          chain: result.chain || data.chain,
          score: result.score,
          combo: result.combo,
          topic: data.topic,
          validation: {
            isValid: result.validation.isValid,
            reason: result.validation.reason,
            score: result.score,
          },
        },
      })
    );
  } catch (error) {
    console.error("Error handling word submission:", error);
    context.ui.webView.postMessage(
      "myWebView",
      wrapDevvitMessage({
        type: "error",
        data: {
          message:
            error instanceof Error ? error.message : "Error validating word",
        },
      })
    );
  }
}

export async function handleMessage(context: Devvit.Context, message: any) {
  try {
    switch (message.type) {
      case 'getTopicWords':
        const { topic } = message.data;
        const words = await getTopicWords(context, topic);
        context.ui.webView.postMessage(
          "myWebView",
          wrapDevvitMessage({
            type: 'topicWordsResponse',
            data: { topic, words }
          })
        );
        break;

      case "ready":
        await sendInitialData(context);
        break;

      case "wordSubmission":
        await handleWordSubmission(context, message.data);
        break;

      case "submitScore":
        await submitScore(context, message.data);
        break;

      case "fetchLeaderboard":
        await fetchLeaderboard(context, message.data);
        break;

      case "startDailyChallenge":
        const result = await handleDailyChallenge(context);
        context.ui.webView.postMessage(
          "myWebView",
          wrapDevvitMessage(result)
        );
        break;

      default:
        console.warn("Unknown message type:", message.type);
    }
  } catch (error) {
    console.error("Error handling message:", error);
    context.ui.webView.postMessage(
      "myWebView",
      wrapDevvitMessage({
        type: "error",
        data: { message: "Error processing request" },
      })
    );
  }
}
