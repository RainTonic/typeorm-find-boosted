import { Repository } from 'typeorm';

export const unique = <T>(list: T[]) => Array.from(new Set(list));

export const isPsql = (repo: Repository<unknown>) => repo.manager.connection.driver.options.type === 'postgres';
