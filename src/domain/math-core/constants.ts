import { Decimal } from './decimal';

/** Default approximation used by the built-in primary-school worksheet profile. */
export const DEFAULT_PI = Decimal.from('3.14');

export const UNIT_FACTORS = {
  length: {
    '千米:米': Decimal.from(1000),
    '米:分米': Decimal.from(10),
    '米:厘米': Decimal.from(100),
    '分米:厘米': Decimal.from(10),
    '厘米:毫米': Decimal.from(10)
  },
  area: {
    '平方千米:公顷': Decimal.from(100),
    '公顷:平方米': Decimal.from(10000),
    '平方米:平方分米': Decimal.from(100),
    '平方分米:平方厘米': Decimal.from(100)
  },
  volume: {
    '立方米:立方分米': Decimal.from(1000),
    '立方分米:立方厘米': Decimal.from(1000),
    '升:毫升': Decimal.from(1000)
  },
  mass: {
    '吨:千克': Decimal.from(1000),
    '千克:克': Decimal.from(1000)
  },
  time: {
    '小时:分钟': Decimal.from(60),
    '分钟:秒': Decimal.from(60)
  },
  money: {
    '元:角': Decimal.from(10),
    '角:分': Decimal.from(10)
  }
} as const;
