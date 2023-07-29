import { FindBoostedPagination } from './find-boosted-pagination';

export interface FindBoostedResult<T> {
  data: T[];
  pagination?: FindBoostedPagination;
}
