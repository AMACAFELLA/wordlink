export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
 }
 export interface GameState {
  chain: string[];
  score: number;
  topic: string;
 }
 export interface WordSubmissionData {
  word: string;
  chain: string[];
  score: number;
  combo: number;
  topic: string;
 }
 