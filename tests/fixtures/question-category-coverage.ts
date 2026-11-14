import type { ContentCategory } from '../../src/domain/questions/contracts';
import type { Grade } from '../../src/domain/curriculum/types';
import type { ProblemType } from '../../src/core/types';

export const REQUIRED_CORE_TYPES: Record<Grade, Record<ContentCategory, readonly ProblemType[]>> = {
  preschool: { calculation: ['addition10'], concept: ['numberRecognition'], 'geometry-measurement': ['shapeRecognition'], data: ['dataTableReading'], application: ['wordProblem'] },
  grade1: { calculation: ['addition20NoCarry'], concept: ['placeValue'], 'geometry-measurement': ['clockReading'], data: ['dataTableReading'], application: ['wordProblem'] },
  grade2: { calculation: ['addition100'], concept: ['numberPattern'], 'geometry-measurement': ['elapsedTime'], data: ['barChartReading'], application: ['wordProblem'] },
  grade3: { calculation: ['addition1000'], concept: ['fractionComparison'], 'geometry-measurement': ['perimeter'], data: ['dataTableReading'], application: ['wordProblem'] },
  grade4: { calculation: ['rounding'], concept: ['largeNumberPlaceValue'], 'geometry-measurement': ['area'], data: ['average'], application: ['wordProblem'] },
  grade5: { calculation: ['decimalOperation'], concept: ['factorsMultiples'], 'geometry-measurement': ['polygonArea'], data: ['lineChartReading'], application: ['wordProblem'] },
  grade6: { calculation: ['percent'], concept: ['negativeNumber'], 'geometry-measurement': ['circle'], data: ['pieChartReading'], application: ['wordProblem'] }
};
