import { FindBoostedCondition } from './find-boosted-condition';

export interface FindBoostedWhere {
  [key: string]: FindBoostedWhereCondition | FindBoostedWhereCondition[];
}

export type FindBoostedWhereCondition = string | number | FindBoostedCondition | FindBoostedWhere;
