import type { ProblemType } from './problem-type';

/** Stable display order retained from the pre-manifest registry. */
export const QUESTION_DISPLAY_ORDER: readonly ProblemType[] = [
  'numberRecognition', 'comparison', 'compareSigns', 'numberSequence', 'numberComposition', 'placeValue', 'numberLine', 'numberPattern', 'oddEven', 'tenMoreLess', 'shapePattern', 'largeNumberPlaceValue', 'rounding', 'decimalComparison', 'negativeNumber', 'calendarWeekday', 'directionRoute', 'fractionVisual', 'quantityEstimate', 'makeTarget', 'operationErrorDiagnosis', 'pictureClassification',
  'addition10', 'subtraction10', 'addition20NoCarry', 'subtraction20NoBorrow', 'addition20Carry', 'subtraction20Borrow', 'addition100', 'subtraction100', 'twoDigitCarry', 'twoDigitBorrow', 'addition1000', 'subtraction1000',
  'multiplication', 'division', 'multiDigitMultiplication', 'threeDigitByOneMultiplication', 'twoDigitByTwoMultiplication', 'remainderDivision', 'mixedMulDiv', 'multiplicationBlank', 'repeatedAddition', 'factorsMultiples', 'proportionalReasoning',
  'chainAddition', 'chainSubtraction', 'mixedAddSub', 'mixedFour', 'arithmeticFamily', 'estimation', 'operationLaw', 'decimalOperation', 'fractionOperation', 'sameDenominatorFraction', 'percent', 'ratio', 'primeComposite', 'commonFactorsMultiples',
  'fillBlank', 'wordProblem', 'multiplicativeComparison', 'fractionOfAmount', 'simpleEquation', 'priceQuantityTotal', 'discount',
  'unitConversion', 'fractionComparison', 'perimeter', 'polygonPerimeter', 'clockReading', 'elapsedTime', 'moneyCalculation', 'moneySense', 'shapeRecognition', 'area', 'angleClassification', 'lineRaySegment', 'angleMeasurement', 'triangleQuadrilateralClassification', 'translationRotation', 'shapeClassification', 'countShapes', 'axisSymmetry', 'polygonArea', 'compositeArea', 'cuboidVolume', 'cuboidNet', 'surfaceArea', 'circle', 'sector', 'cylinder', 'scale',
  'dataTableReading', 'barChartReading', 'average', 'lineChartReading', 'probability', 'likelihoodLanguage', 'pieChartReading', 'multiChartAnalysis', 'chartAnalysis', 'inverseProportion', 'concentration', 'budgetPlan',
  'verticalAddition', 'verticalSubtraction', 'verticalMultiplication', 'verticalDivision'
];
