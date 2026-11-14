import type { Question } from './types';
export const deduplicate = (questions: Question[]): Question[] => [...new Map(questions.map(q => [q.signature, q])).values()];
