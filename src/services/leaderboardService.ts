import type { Devvit, ZMember } from "@devvit/public-api";
import { LeaderboardEntry } from "../types/leaderboard.js";
import { ExtendedZRangeOptions, RedisZRangeResult } from "../types/redis.js";

const KEYS = {
  /** user IDs ordered by score; global player leaderboard */
  t2ScoreZ: "t2_score_z",
  /** match IDs ordered by score; subreddit-specific leaderboard */
  t3T2ScoreZByT3Template: "t3_t2_score_z_by_{t3}",
  /** player lookup by T2 */
  playerByT2: "player_by_t2",
  /** subreddit lookup by T3 */
  subredditByT3: "subreddit_by_t3",
  /** pattern for finding all subreddit leaderboards */
  t3T2ScoreZPattern: "t3_t2_score_z_by_*",
  /** username lookup by T2 */
  usernameByT2: "username_by_t2",
  /** daily challenge leaderboard */
  dailyLeaderboard: "daily_leaderboard",
} as const;

export type PlayerRecord = {
  name: string;
  snoovatarURL: string;
  t2: string;
  redisVersion: number;
};

export type MatchRecord = {
  created: number;
  redisVersion: number;
  score: number;
  t2: string;
  t3: string;
  subreddit: string;
};

export class LeaderboardService {
  private readonly redis: Devvit.Context["redis"];
  private readonly subreddit: string;

  private static devModeLatestScore: number = 0;

  constructor(redis: Devvit.Context["redis"], subreddit: string) {
    this.redis = redis;
    this.subreddit = subreddit;
  }

  private getT3T2ScoreZByT3Key(t3: string): string {
    return KEYS.t3T2ScoreZByT3Template.replace("{t3}", t3);
  }

  async updateScore(
    username: string,
    score: number,
    t2: string,
    t3: string,
    isDaily: boolean = false,
    dailyDate?: string
  ): Promise<boolean> {
    try {
      // console.log("Updating score:", {
      //   username,
      //   score,
      //   t2,
      //   t3,
      //   subreddit: this.subreddit,
      //   isDaily,
      //   dailyDate
      // });

      const t3T2ScoreZByT3Key = this.getT3T2ScoreZByT3Key(t3);
      const dailyKey = isDaily && dailyDate ? `${KEYS.dailyLeaderboard}:${dailyDate}` : null;

      try {
        // Store username separately for reliable lookup
        await this.redis.set(`${KEYS.usernameByT2}:${t2}`, username);

        // Check existing scores
        const existingGlobalScore = !isDaily ? await this.redis.zScore(KEYS.t2ScoreZ, t2) : null;
        const existingSubredditScore = !isDaily ? await this.redis.zScore(t3T2ScoreZByT3Key, t2) : null;
        const existingDailyScore = dailyKey ? await this.redis.zScore(dailyKey, t2) : null;

        // Update if new score is higher or no existing score
        const shouldUpdateGlobal = !isDaily && (!existingGlobalScore || score > existingGlobalScore);
        const shouldUpdateSubreddit = !isDaily && (!existingSubredditScore || score > existingSubredditScore);
        const shouldUpdateDaily = isDaily && dailyKey && (!existingDailyScore || score > existingDailyScore);

        // Check for existing player record
        const existingPlayerJson = await this.redis.get(`${KEYS.playerByT2}:${t2}`);
        let playerRecord: PlayerRecord;

        if (existingPlayerJson) {
          const existingPlayer = JSON.parse(existingPlayerJson) as PlayerRecord;
          if (existingPlayer.name !== username) {
            playerRecord = {
              ...existingPlayer,
              name: username,
              redisVersion: existingPlayer.redisVersion + 1,
            };
          } else {
            playerRecord = existingPlayer;
          }
        } else {
          playerRecord = {
            name: username,
            snoovatarURL: "",
            t2,
            redisVersion: 1,
          };
        }

        const updatePromises: Promise<any>[] = [
          // Store player info
          this.redis.set(`${KEYS.playerByT2}:${t2}`, JSON.stringify(playerRecord)),
          // Store username directly
          this.redis.set(`${KEYS.usernameByT2}:${t2}`, username),
        ];

        if (!isDaily) {
          // Store subreddit info for regular games
          updatePromises.push(this.redis.set(`${KEYS.subredditByT3}:${t3}`, this.subreddit));
        }

        // Only update scores if they're higher than existing scores
        if (shouldUpdateGlobal) {
          // console.log("Updating global leaderboard score:", score);
          updatePromises.push(this.redis.zAdd(KEYS.t2ScoreZ, { score, member: t2 }));
        }

        if (shouldUpdateSubreddit) {
          // console.log("Updating subreddit leaderboard score:", score);
          updatePromises.push(this.redis.zAdd(t3T2ScoreZByT3Key, { score, member: t2 }));
        }

        if (shouldUpdateDaily) {
          // console.log("Updating daily leaderboard score:", score);
          updatePromises.push(this.redis.zAdd(dailyKey!, { score, member: t2 }));
        }

        await Promise.all(updatePromises);
        return true;
      } catch (error) {
        if (error instanceof Error && error.message === "ServerCallRequired") {
          // console.log("Development environment detected, updating in-memory score");
          LeaderboardService.devModeLatestScore = score;
          return true;
        }
        throw error;
      }
    } catch (error) {
      // console.error("Error updating leaderboard:", error);
      throw new Error("Failed to update leaderboard");
    }
  }

  private async getUsername(t2: string): Promise<string> {
    try {
      // First try to get username from dedicated username storage
      const username = await this.redis.get(`${KEYS.usernameByT2}:${t2}`);
      if (username) {
        return username;
      }

      // Fallback to player record if username not found
      const playerJson = await this.redis.get(`${KEYS.playerByT2}:${t2}`);
      if (playerJson) {
        const player = JSON.parse(playerJson) as PlayerRecord;
        if (player.name) {
          return player.name;
        }
      }

      throw new Error("Username not found");
    } catch (error) {
      // console.error("Error getting username:", error);
      throw new Error("Unable to retrieve username");
    }
  }

  async getCurrentSubredditLeaderboard(
    t3: string
  ): Promise<LeaderboardEntry[]> {
    try {
      // console.log("Fetching current subreddit leaderboard for t3:", t3);
      try {
        const key = this.getT3T2ScoreZByT3Key(t3);
        // console.log("Using Redis key:", key);

        // Use zRange with reverse option to get top scores
        const results = (await this.redis.zRange(key, 0, 9, {
          withScores: true,
          reverse: true,
        } as ExtendedZRangeOptions)) as RedisZRangeResult[];

        // console.log("Raw Redis results:", results);

        if (!results || results.length === 0) {
          // console.log("No scores found for current subreddit");
          return [];
        }

        // Filter out invalid results
        const validResults = results.filter(result => {
          if (!result.member || typeof result.member !== 'string' || result.member.trim() === '') {
            // console.log("Skipping invalid member:", result);
            return false;
          }
          return true;
        });

        if (validResults.length === 0) {
          // console.log("No valid scores found after filtering");
          return [];
        }

        const userScores = new Map<
          string,
          { score: number; username: string }
        >();

        for (let i = 0; i < validResults.length; i++) {
          const result = validResults[i];
          // Extract t2 from member string (handles both formats: 't2_abc' and 't3_xyz_t2_abc')
          const t2Match = result.member.match(/t2_[a-zA-Z0-9]+/);
          if (!t2Match) {
            // console.error("Invalid member format:", result.member);
            continue;
          }
          const t2 = t2Match[0];

          try {
            const username = await this.getUsername(t2);
            // Keep only the highest score for each user
            const existingScore = userScores.get(username);
            if (!existingScore || result.score > existingScore.score) {
              userScores.set(username, { score: result.score, username });
            }
          } catch (error) {
            // console.error("Error getting username for entry:", error);
            continue;
          }
        }

        // Convert map to sorted array
        const sortedEntries = Array.from(userScores.values())
          .sort((a, b) => b.score - a.score)
          .map((entry, index) => ({
            rank: index + 1,
            username: entry.username,
            score: entry.score,
            subreddit: this.subreddit,
          }));

        // console.log("Current subreddit leaderboard entries:", sortedEntries);
        return sortedEntries;
      } catch (error) {
        if (error instanceof Error && error.message === "ServerCallRequired") {
          // console.log(
          //   "Development environment detected, returning mock subreddit leaderboard"
          // );
          return [
            {
              rank: 1,
              username: "DevUser",
              score: LeaderboardService.devModeLatestScore,
              subreddit: this.subreddit,
            },
          ];
        }
        throw error;
      }
    } catch (error) {
      // console.error("Error fetching current subreddit leaderboard:", error);
      return [];
    }
  }

  async getAllSubredditsLeaderboard(): Promise<LeaderboardEntry[]> {
    try {
      // console.log("Fetching all subreddits leaderboard");
      try {
        const results = (await this.redis.zRange(KEYS.t2ScoreZ, 0, 9, {
          withScores: true,
          reverse: true,
        } as ExtendedZRangeOptions)) as RedisZRangeResult[];

        const userScores = new Map<
          string,
          { score: number; username: string; subreddit: string }
        >();

        for (let i = 0; i < results.length; i++) {
          const result = results[i];
          // Extract t2 from member string (handles both formats: 't2_abc' and 't3_xyz_t2_abc')
          const t2Match = result.member.match(/t2_[a-zA-Z0-9]+/);
          if (!t2Match) {
            // console.error("Invalid member format:", result.member);
            continue;
          }
          const t2 = t2Match[0];

          try {
            const username = await this.getUsername(t2);

            // Find the subreddit where this player got their high score
            const subreddits = await this.findPlayerSubreddits(t2);
            let playerSubreddit = this.subreddit;
            let highestScore = result.score;

            for (const t3 of subreddits) {
              const key = this.getT3T2ScoreZByT3Key(t3);
              const score = await this.redis.zScore(key, t2);
              if (score && score > highestScore) {
                highestScore = score;
                const subredditName = await this.redis.get(
                  `${KEYS.subredditByT3}:${t3}`
                );
                if (subredditName) {
                  playerSubreddit = subredditName;
                }
              }
            }

            // Keep only the highest score for each user
            const existingScore = userScores.get(username);
            if (!existingScore || highestScore > existingScore.score) {
              userScores.set(username, {
                score: highestScore,
                username,
                subreddit: playerSubreddit,
              });
            }
          } catch (error) {
            // console.error("Error processing leaderboard entry:", error);
            continue;
          }
        }

        // Convert map to sorted array
        const sortedEntries = Array.from(userScores.values())
          .sort((a, b) => b.score - a.score)
          .map((entry, index) => ({
            rank: index + 1,
            username: entry.username,
            score: entry.score,
            subreddit: entry.subreddit,
          }));

        // console.log("All subreddits leaderboard entries:", sortedEntries);
        return sortedEntries;
      } catch (error) {
        if (error instanceof Error && error.message === "ServerCallRequired") {
          // console.log(
          //   "Development environment detected, returning mock global leaderboard"
          // );
          return [
            {
              rank: 1,
              username: "DevUser",
              score: LeaderboardService.devModeLatestScore,
              subreddit: this.subreddit,
            },
          ];
        }
        throw error;
      }
    } catch (error) {
      // console.error("Error fetching all subreddits leaderboard:", error);
      return [];
    }
  }

  async getDailyLeaderboard(date: string): Promise<LeaderboardEntry[]> {
    try {
      const dailyKey = `${KEYS.dailyLeaderboard}:${date}`;
      const results = (await this.redis.zRange(dailyKey, 0, 9, {
        withScores: true,
        reverse: true,
      } as ExtendedZRangeOptions)) as RedisZRangeResult[];

      if (!results || results.length === 0) {
        return [];
      }

      const entries: LeaderboardEntry[] = [];
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const t2 = result.member;
        try {
          const username = await this.getUsername(t2);
          entries.push({
            rank: i + 1,
            username,
            score: result.score,
            subreddit: "Daily Challenge"
          });
        } catch (error) {
          // console.error("Error processing daily leaderboard entry:", error);
          continue;
        }
      }

      return entries;
    } catch (error) {
      // console.error("Error fetching daily leaderboard:", error);
      return [];
    }
  }

  private async findPlayerSubreddits(t2: string): Promise<string[]> {
    const subreddits: string[] = [];
    let cursor = 0;
    try {
      // Pattern to match all subreddit leaderboard keys
      const pattern = KEYS.t3T2ScoreZPattern;

      do {
        // Scan for all subreddit leaderboard keys
        const scanResult = await this.redis.hScan(pattern, cursor);
        cursor = scanResult.cursor;

        // For each found key, check if the player has a score
        for (const { field: key } of scanResult.fieldValues) {
          const score = await this.redis.zScore(key, t2);
          if (score !== undefined) {
            // Extract t3 from the key
            const t3 = key.split("_by_")[1];
            if (t3 && !subreddits.includes(t3)) {
              subreddits.push(t3);
            }
          }
        }
      } while (cursor !== 0);

      return subreddits;
    } catch (error) {
      // console.error("Error finding player subreddits:", error);
      return []; // Return empty array on error
    }
  }

  async clearLeaderboards(t3: string): Promise<void> {
    try {
      const key = this.getT3T2ScoreZByT3Key(t3);
      const results = (await this.redis.zRange(key, 0, -1, {
        withScores: true,
      } as ExtendedZRangeOptions)) as RedisZRangeResult[];

      const deletePromises = [
        this.redis.del(key),
        this.redis.del(KEYS.t2ScoreZ),
      ];

      // Delete player records and usernames
      for (const result of results) {
        const t2 = result.member;
        deletePromises.push(
          this.redis.del(`${KEYS.playerByT2}:${t2}`),
          this.redis.del(`${KEYS.usernameByT2}:${t2}`)
        );
      }

      await Promise.all(deletePromises);
    } catch (error) {
      // console.error("Error clearing leaderboards:", error);
      throw new Error("Failed to clear leaderboards");
    }
  }
}
