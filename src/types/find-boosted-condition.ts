import { FindBoostedFn } from '../enum/find-boosted-fn.enum';

export interface FindBoostedCondition {
  _fn: FindBoostedFn;
  args?: string | number | Date | FindBoostedCondition | [ number, number ] | [ Date, Date ] | string[] | number[];
}
