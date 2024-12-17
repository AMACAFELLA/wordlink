import { JSONValue } from "@devvit/public-api";
import { GameState } from "./game.js";

export type LeaderboardEntry = {
  rank: number;
  username: string;
  score: number;
  subreddit: string;
};

// Backend tab types
export type LeaderboardTab = 
  | "this-subreddit" 
  | "all-subreddits"
  | "daily-challenge";

// Frontend tab types
export type FrontendLeaderboardTab = 
  | "this-subreddit" 
  | "all-subreddits"
  | "daily-challenge";

export type WebViewMessage =
  | {
      type: "initialData";
      data: {
        username?: string;
        subreddit?: string;
        postId?: string;
        lastGameState?: GameState;
      };
    }
  | {
      type: "ready";
      data: Record<string, never>;
    }
  | {
      type: "submitScore";
      data: {
        playerName: string;
        score: number;
        subreddit: string;
        isDaily?: boolean;
      };
    }
  | {
      type: "scoreSubmitted";
      data: {
        success: boolean;
        error?: string;
      };
    }
  | {
      type: "fetchLeaderboard";
      data: {
        tab: LeaderboardTab;
      };
    }
  | {
      type: "leaderboardData";
      data: {
        entries: LeaderboardEntry[];
        tab: LeaderboardTab;
        error?: string;
      };
    }
  | {
      type: "wordSubmission";
      data: {
        word: string;
        chain: string[];
        score: number;
        combo: number;
        topic: string;
      };
    }
  | {
      type: "wordConfirmation";
      data: {
        success: boolean;
        error?: string;
        username?: string;
      };
    };

// JSON-compatible types for messages
export interface LeaderboardDataMessage {
  type: "leaderboardData";
  data: {
    entries: LeaderboardEntry[];
    tab: FrontendLeaderboardTab;
    error?: string;
  };
}

export interface LeaderboardFetchMessage {
  type: "fetchLeaderboard";
  data: {
    tab: FrontendLeaderboardTab;
  };
}

// Devvit message wrapper type
export interface DevvitMessage<T> {
  type: "devvit-message";
  message: T;
}
