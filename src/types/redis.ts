import { ZRangeOptions } from "@devvit/public-api";


export interface RedisZRangeResult {
   member: string;
   score: number;
}


// Update to match Devvit's ZRangeOptions
export type ExtendedZRangeOptions = ZRangeOptions & {
   withScores?: boolean;
};


