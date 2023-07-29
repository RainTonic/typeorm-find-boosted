import { FindBoostedFn } from './enum/find-boosted-fn.enum';
import { FindBoostedCondition } from './types/find-boosted-condition';

export class FbFn {

  static Not(negateCondition: FindBoostedCondition): FindBoostedCondition {
    return { _fn: FindBoostedFn.NOT, args: negateCondition };
  }

  static Null(): FindBoostedCondition {
    return { _fn: FindBoostedFn.IS_NULL };
  }

  static Eq(value: string | number): FindBoostedCondition {
    return { _fn: FindBoostedFn.EQUAL, args: value };
  }

  static In(values: string[] | number[]): FindBoostedCondition {
    return { _fn: FindBoostedFn.IN, args: values };
  }

  static Between(values: [ number, number ] | [ Date, Date ]): FindBoostedCondition {
    return { _fn: FindBoostedFn.BETWEEN, args: values };
  }

  static Like(value: string): FindBoostedCondition {
    return { _fn: FindBoostedFn.LIKE, args: value };
  }

  static iLike(value: string): FindBoostedCondition {
    return { _fn: FindBoostedFn.ILIKE, args: value };
  }

  static Lt(value: string | number): FindBoostedCondition {
    return { _fn: FindBoostedFn.LOWER, args: value };
  }

  static Lte(value: string | number): FindBoostedCondition {
    return { _fn: FindBoostedFn.LOWER_EQUAL, args: value };
  }

  static Gt(value: string | number): FindBoostedCondition {
    return { _fn: FindBoostedFn.GRATER, args: value };
  }

  static Gte(value: string | number): FindBoostedCondition {
    return { _fn: FindBoostedFn.GRATER_EQUAL, args: value };
  }
}
