import englishWords from 'an-array-of-english-words';
import { topics } from '../data/topics';

// Create a normalized set of English words and topic words
const wordSet = new Set(englishWords.map(word => word.toLowerCase().trim()));
const topicWordSet = new Set(topics.flatMap(topic => topic.words).map(word => word.toLowerCase().trim()));


export interface WordValidationResult {
 isValid: boolean;
 reason?: string;
 score?: number;
}


export async function validateWord(
 word: string,
 topicWords: string[],
 previousWord?: string
): Promise<WordValidationResult> {
 if (!word) {
   return {
     isValid: false,
     reason: 'No word provided'
   };
 }


 // Normalize inputs
 const normalizedWord = word.toLowerCase().trim();
 const normalizedTopicWords = topicWords.map(w => w.toLowerCase().trim());


 // Check if it's a valid English word or a predefined topic word
 if (!wordSet.has(normalizedWord) && !topicWordSet.has(normalizedWord)) {
   return {
     isValid: false,
     reason: 'Not a valid English word'
   };
 }


 // Check if the word belongs to the current topic
 if (!normalizedTopicWords.includes(normalizedWord)) {
   return {
     isValid: false,
     reason: 'Word is not related to the current topic'
   };
 }


 // Check if the word follows the chain rule (if there's a previous word)
 if (previousWord) {
   const lastLetter = previousWord[previousWord.length - 1].toLowerCase();
   if (normalizedWord[0] !== lastLetter) {
     return {
       isValid: false,
       reason: `Word must start with the letter "${lastLetter}"`
     };
   }
 }


 return {
   isValid: true
 };
}
