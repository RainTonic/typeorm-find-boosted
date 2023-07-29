import { FindBoostedWhere } from './find-boosted-where';
import { FindBoostedOrder } from './find-boosted-order';
import { FindBoostedPagination } from './find-boosted-pagination';

export interface FindBoostedOptions {
  /**
   * Entities to join
   */
  relations?: string[];

  where?: FindBoostedWhere | FindBoostedWhere[];
  order?: FindBoostedOrder;
  pagination?: FindBoostedPagination;

  logging?: boolean;

  fulltextColumns?: string[];
  fulltextSearch?: string;

  select?: string[];
}
