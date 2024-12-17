import { topics } from '../data/topics.js';

export interface DailyChallenge {
  topic: string;
  date: string;
}

export function getDailyChallenge(): DailyChallenge {
  const today = new Date();
  const dateStr = today.toISOString().split('T')[0];
  
  // Use the date to deterministically select a topic
  const dayOfYear = Math.floor((today.getTime() - new Date(today.getFullYear(), 0, 0).getTime()) / 86400000);
  const topicIndex = dayOfYear % topics.length;
  
  return {
    topic: topics[topicIndex].topic,
    date: dateStr
  };
}

export function getDailyChallengeRedisKey(date: string): string {
  return `daily_challenge:${date}`;
}

export function getDailyChallengeLeaderboardKey(date: string): string {
  return `daily_leaderboard:${date}`;
}
