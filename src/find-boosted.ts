import type { DataSource, EntityManager, EntityMetadata, ObjectLiteral, Repository, SelectQueryBuilder } from 'typeorm';
import type { RelationMetadata } from 'typeorm/metadata/RelationMetadata';
import { FindBoostedFn } from './enum/find-boosted-fn.enum';
import { FbFn } from './fb-fn';
import type { FindBoostedCondition } from './types/find-boosted-condition';
import type { FindBoostedOptions } from './types/find-boosted-options';
import type { FindBoostedOrder } from './types/find-boosted-order';
import type { FindBoostedResult } from './types/find-boosted-result';
import type { FindBoostedWhere, FindBoostedWhereCondition } from './types/find-boosted-where';
import { FBLogger } from './utils/logger';
import { isPsql } from './utils/utils';

export class FindBoosted<T extends ObjectLiteral> {
  logger = new FBLogger();
  constructor(
    private _dataSource: DataSource,
    private _rootRepository: Repository<T>,
  ) {}

  enableLogging(level: number) {
    this.logger.setLogLevel(level);
  }

  private _getPrimaryColumn(metadata: EntityMetadata) {
    return metadata.primaryColumns.at(0)?.propertyName;
  }

  private _getRelationMetadata(relationPath: string, repositoryMetadata: EntityMetadata): RelationMetadata | undefined {
    const relationParts = relationPath.split('.');
    let currentMetadata: EntityMetadata = repositoryMetadata;
    let currentRelation: RelationMetadata | undefined;

    for (const part of relationParts) {
      currentRelation = currentMetadata.findRelationWithPropertyPath(part);
      if (!currentRelation) {
        return undefined;
      }
      currentMetadata = currentRelation.inverseEntityMetadata;
    }

    return currentRelation;
  }

  private _buildExistsSubqueryForN2N(
    relationPath: string,
    condition: FindBoostedWhereCondition,
    repositoryMetadata: EntityMetadata,
    currentRelations: string[],
    TX?: EntityManager,
  ): string {
    const relationParts = relationPath.split('.');
    const lastRelationName = relationParts[relationParts.length - 1];
    const relationMetadata = this._getRelationMetadata(relationPath, repositoryMetadata);

    if (!relationMetadata) {
      throw new Error(`Relation ${relationPath} not found`);
    }

    const inverseMetadata = relationMetadata.inverseEntityMetadata;
    const junctionEntityMetadata = relationMetadata.junctionEntityMetadata;

    if (!junctionEntityMetadata) {
      throw new Error(`No junction entity metadata found for relation ${relationPath}`);
    }

    const junctionTableName = junctionEntityMetadata.tableName;
    const rootTableName = repositoryMetadata.tableName;
    const inverseTableName = inverseMetadata.tableName;
    const rootPrimaryColumn = this._getPrimaryColumn(repositoryMetadata);
    const inversePrimaryColumn = this._getPrimaryColumn(inverseMetadata);

    const junctionForeignKeys = junctionEntityMetadata.foreignKeys;
    if (!junctionForeignKeys || junctionForeignKeys.length < 2) {
      throw new Error(`Insufficient foreign keys in junction table for relation ${relationPath}`);
    }

    let rootColumnName: string;
    let inverseColumnName: string;

    const fkToRoot = junctionForeignKeys.find(
      (fk) => fk.referencedEntityMetadata.targetName === repositoryMetadata.targetName,
    );
    const fkToInverse = junctionForeignKeys.find(
      (fk) => fk.referencedEntityMetadata.targetName === inverseMetadata.targetName,
    );

    if (fkToRoot && fkToInverse) {
      rootColumnName = fkToRoot.columns[0].propertyName;
      inverseColumnName = fkToInverse.columns[0].propertyName;
    } else {
      rootColumnName = junctionForeignKeys[0].columns[0].propertyName;
      inverseColumnName = junctionForeignKeys[1].columns[0].propertyName;
    }

    const relationAlias = relationParts.join('_');

    let existsSubquery = `EXISTS (SELECT 1 FROM "${junctionTableName}" jt WHERE jt."${rootColumnName}" = "${rootTableName}"."${rootPrimaryColumn}" AND EXISTS (SELECT 1 FROM "${inverseTableName}" "${relationAlias}" WHERE "${relationAlias}"."${inversePrimaryColumn}" = jt."${inverseColumnName}"`;

    if (condition && typeof condition === 'object' && Object.keys(condition).length > 0) {
      existsSubquery +=
        ' AND ' +
        this._buildWhereAndLogic(
          condition as FindBoostedWhere,
          inverseMetadata,
          currentRelations
            .filter((r) => r.startsWith(`${lastRelationName}.`))
            .map((r) => r.substring(`${lastRelationName}.`.length)),
          TX,
          relationAlias,
        );
    }

    existsSubquery += '))';

    return existsSubquery;
  }
  /**
   * This method takes an object and builds the string with the given params
   * @param whereLogic
   * @param entityMetadata
   * @param currentRelations
   * @param TX
   * @param tableNameOverride Optional table name/alias to use instead of entityMetadata.tableName
   * @private
   */
  private _buildWhereAndLogic(
    whereLogic: FindBoostedWhere,
    entityMetadata: EntityMetadata,
    currentRelations: string[],
    TX?: EntityManager,
    tableNameOverride?: string,
  ): string {
    // Check object
    let resultString = '1=1';
    let tableName = tableNameOverride ?? entityMetadata.tableName;
    if (!tableName.includes('"')) {
      tableName = `"${tableName}"`;
    }

    for (const key of Object.keys(whereLogic)) {
      if (whereLogic[key] === undefined || whereLogic[key] === null) {
        return `(${resultString})`;
      }

      if (Array.isArray(whereLogic[key])) {
        resultString += ' AND (';
        for (const [index, condition] of (whereLogic[key] as FindBoostedCondition[]).entries()) {
          resultString += this._handleFnLogic(condition, `."${key}"`);

          if (index !== (whereLogic[key] as FindBoostedCondition[]).length - 1) {
            resultString += ' OR ';
          }
        }
        resultString += ')';
      } else if (typeof whereLogic[key] === 'object') {
        // if element contains _fn
        if (Object.keys(whereLogic[key]).find((k) => k === '_fn')) {
          resultString +=
            ' AND ' + this._handleFnLogic(whereLogic[key] as FindBoostedCondition, `${tableName}."${key}"`);
        } else {
          // In this case is a nested query, so it must be calculated by looking for column metadata
          const relationMetadata = entityMetadata.findRelationWithPropertyPath(key);
          if (!relationMetadata) {
            throw new Error(`Column ${key} is not valid for query calculation`);
          }
          resultString +=
            ' AND ' +
            this._calculateSubQuery(
              key,
              `"${entityMetadata.tableName}_${key}"`,
              whereLogic[key] as FindBoostedWhereCondition,
              relationMetadata,
              currentRelations,
              TX,
            );
        }
      } else {
        // handle simple property
        if (typeof whereLogic[key] === 'number') {
          resultString += ` AND ${tableName}."${key}"=${whereLogic[key]}`;
        } else if (typeof whereLogic[key] === 'string') {
          resultString += ` AND ${tableName}."${key}"='${whereLogic[key]}'`;
        } else if (typeof whereLogic[key] === 'boolean') {
          resultString += ` AND ${tableName}."${key}"='${whereLogic[key]}'`;
        }
        // Check data
      }
    }
    return `(${resultString})`;
  }

  private _calculateSubQuery(
    currentKey: string,
    currentTableName: string,
    condition: FindBoostedWhereCondition,
    relationMetadata: RelationMetadata,
    currentRelations: string[],
    TX?: EntityManager,
  ): string {
    if (relationMetadata.relationType === 'many-to-many') {
      return this._buildExistsSubqueryForN2N(
        currentKey,
        condition,
        relationMetadata.entityMetadata,
        currentRelations,
        TX,
      );
    }

    const entityMetadata = relationMetadata.inverseEntityMetadata;
    if (entityMetadata.primaryColumns.length !== 1) {
      throw new Error(
        `Nested query on relation are allowed for exactly 1 primary column. table: ${entityMetadata.tableName}`,
      );
    }
    const key =
      relationMetadata.relationType === 'one-to-many'
        ? entityMetadata.findColumnsWithPropertyPath(relationMetadata.inverseSidePropertyPath)[0].propertyPath
        : this._getPrimaryColumn(entityMetadata);

    const tableName = currentTableName.includes('"') ? currentTableName : `"${currentTableName}"`;

    return `(${tableName}."${key}" IN (${this._prepareGeneralQueryBuilder(
      {
        where: condition as FindBoostedWhere,
        relations: currentRelations
          .filter((relation) => relation.includes(`${currentKey}.`))
          .map((relation) => relation.substring(`${currentKey}.`.length)),
        select: [`${entityMetadata.tableName}.${key}`],
      },
      entityMetadata,
      TX,
    ).getSql()}))`;
  }

  /**
   * Handle fn logic for where clauses building
   * @param whereLogicElement
   * @param currentProperty
   * @private
   */
  private _handleFnLogic(whereLogicElement: FindBoostedCondition, currentProperty: string): string {
    if (!whereLogicElement._fn) {
      throw new Error('Unprocessable _fn Function. _fn not set');
    }
    switch (whereLogicElement._fn) {
      case FindBoostedFn.NOT:
        return `NOT (${this._handleFnLogic(whereLogicElement.args as FindBoostedCondition, currentProperty)})`;
      case FindBoostedFn.IS_NULL:
        return `${currentProperty} IS NULL`;
      case FindBoostedFn.EQUAL:
        return `${currentProperty}='${whereLogicElement.args}'`;
      case FindBoostedFn.IN:
        return `${currentProperty} IN (${(whereLogicElement.args as any[]).map((x) => `'${x}'`).join(', ')})`;
      case FindBoostedFn.BETWEEN:
        const args = whereLogicElement.args as [number, number] | [Date, Date];
        return `${currentProperty} BETWEEN '${args[0]}' AND '${args[1]}'`;
      case FindBoostedFn.LIKE:
        return `${currentProperty} LIKE '%${whereLogicElement.args}%'`;
      case FindBoostedFn.ILIKE:
        return isPsql(this._rootRepository)
          ? `${currentProperty} ILIKE '%${whereLogicElement.args}%'`
          : `${currentProperty} LIKE LOWER('%${whereLogicElement.args}%')`;
      case FindBoostedFn.LOWER:
        return `${currentProperty}<'${whereLogicElement.args}'`;
      case FindBoostedFn.LOWER_EQUAL:
        return `${currentProperty}<='${whereLogicElement.args}'`;
      case FindBoostedFn.GRATER:
        return `${currentProperty}>'${whereLogicElement.args}'`;
      case FindBoostedFn.GRATER_EQUAL:
        return `${currentProperty}>='${whereLogicElement.args}'`;
    }
  }

  async createQuery(options: FindBoostedOptions, TX?: EntityManager) {
    const primaryCol = this._getPrimaryColumn(this._rootRepository.metadata);
    this.logger.debug(`Selecting type of query with params [pc: ${primaryCol} pe: ${!!options.pagination}]`);
    return this._prepareGeneralQueryBuilder(options, this._rootRepository.metadata, TX);
  }

  /**
   * Execute the query with giving params
   * @param options
   * @param TX
   */
  async execute(options: FindBoostedOptions, TX?: EntityManager): Promise<FindBoostedResult<T>> {
    try {
    } catch (e) {
      this.logger.error('Got error: ' + JSON.stringify(e));
      throw e;
    }
    this.logger.log('Required execute');
    this.logger.debug('Options required: ' + JSON.stringify(options));
    const query = await this.createQuery(options, TX);

    if (options.logging) {
      console.log('[BOOSTED QUERY] ' + query.getSql());
    }

    if (!options.pagination) {
      this.logger.debug('No pagination required');
      return { data: await query.getMany() };
    }

    this.logger.debug('Calculating query with pagination');
    const [data, totalItems] = (await query.getManyAndCount()) as [T[], number];
    return {
      data,
      pagination: {
        pageSize: options.pagination ? options.pagination.pageSize : -1,
        page: options.pagination ? options.pagination.page : -1,
        totalItems,
      },
    };
  }

  private _prepareBaseQueryBuilder(
    options: FindBoostedOptions,
    repositoryMetadata: EntityMetadata,
    TX?: EntityManager,
  ): SelectQueryBuilder<any> {
    let queryBuilder: SelectQueryBuilder<T> = TX
      ? TX.createQueryBuilder(repositoryMetadata.target, repositoryMetadata.tableName)
      : this._dataSource.createQueryBuilder(repositoryMetadata.target, repositoryMetadata.tableName);

    // Adding relations with left join
    if (!options.relations?.length) {
      return queryBuilder;
    }
    for (let relation of options.relations) {
      relation = `${repositoryMetadata.tableName}.${relation}`;

      const relationSplit: string[] = relation.split('.');
      const currentRelationToAdd: string =
        relationSplit.slice(0, relationSplit.length - 1).join('_') + '.' + relationSplit[relationSplit.length - 1];
      const sanitizedRelationName: string = relationSplit.join('_');

      queryBuilder = queryBuilder.leftJoinAndSelect(currentRelationToAdd, sanitizedRelationName);
    }
    return queryBuilder;
  }

  private _prepareGeneralQueryBuilder(
    options: FindBoostedOptions,
    repositoryMetadata: EntityMetadata,
    TX?: EntityManager,
  ): SelectQueryBuilder<any> {
    this.logger.log('Using general query');
    let queryBuilder: SelectQueryBuilder<T> = this._prepareBaseQueryBuilder(options, repositoryMetadata, TX);
    if (options.where && Object.keys(options.where).length) {
      this.logger.debug('Applying where on general query');
      queryBuilder = queryBuilder.where(this._buildWhere(options, repositoryMetadata, TX));
    }

    if (options.fulltextSearch && options.fulltextColumns) {
      this.logger.debug('Applying fulltext on general query');
      queryBuilder = queryBuilder.andWhere(this._buildWhereFullSearch(options.fulltextSearch, options.fulltextColumns));
    }

    if (options.select) {
      this.logger.debug('Selecting fields general query');
      queryBuilder = queryBuilder.select(
        options.select.map((x) =>
          x
            .split('.')
            .map((y) => `"${y}"`)
            .join('.'),
        ),
      );
    }

    if (options.order) {
      this.logger.debug('Set order by on general query');
      queryBuilder = queryBuilder.orderBy(this._buildOrderBy(options.order));
    }

    if (options.pagination) {
      this.logger.debug('Applying pagination on general query');
      const skip: number = options.pagination.pageSize * (options.pagination.page - 1);
      queryBuilder = queryBuilder.take(options.pagination.pageSize).skip(skip);
    }
    this.logger.debug('Got general query: ' + queryBuilder.getSql());
    return queryBuilder;
  }

  private _buildWhere(options: FindBoostedOptions, rootRepository: EntityMetadata, TX?: EntityManager): string {
    let whereClauseString = '';
    if (!options.where || !Object.keys(options.where || {}).length) {
      return '1=1';
    }
    if (Array.isArray(options.where)) {
      // In this case we have a or clause for each object
      options.where.forEach((whereLogic, index) => {
        whereClauseString += this._buildWhereAndLogic(whereLogic, rootRepository, options.relations || [], TX);
        if (index !== (options.where as FindBoostedWhere[]).length - 1) {
          whereClauseString += ' OR ';
        }
      });
    } else {
      // Only a where clause with each element in AND logic operator
      whereClauseString += this._buildWhereAndLogic(options.where, rootRepository, options.relations || [], TX);
    }

    return whereClauseString;
  }

  /**
   * Create orderBy object
   * @param orderBy
   * @private
   */
  private _buildOrderBy(orderBy: FindBoostedOrder): FindBoostedOrder {
    const sanitizedOrderBy: any = {};

    for (const dbCol of Object.keys(orderBy)) {
      const sanitizedColName: string = this._sanitizeFieldName(dbCol);
      sanitizedOrderBy[sanitizedColName] = orderBy[dbCol];
    }

    return sanitizedOrderBy;
  }

  /**
   * Create where for fulltext params
   * @param fullSearch
   * @param dbCols
   * @private
   */
  private _buildWhereFullSearch(fullSearch: string, dbCols: string[]): string {
    let where = '';

    // wrap for every fullSearch words
    where += '(';
    for (const [index, dbCol] of dbCols.entries()) {
      if (index !== 0) {
        where += ' OR ';
      }
      const sanitizedFieldName: string = this._sanitizeFieldName(dbCol);
      where += `(${this._handleFnLogic(FbFn.iLike(fullSearch.trim()), sanitizedFieldName)})`;
    }

    where += ')';

    // incapsulate sql OR statements
    where = `(${where})`;

    return where;
  }

  /**
   * returns rootTable.colName if first level
   * returns rootTable_col.nestedProperty fif nested
   */
  private _sanitizeFieldName(dbColName: string): string {
    let fieldName: string = this._rootRepository.metadata.tableName + '.' + dbColName;
    const splittedFieldName: string[] = fieldName.split('.');
    if (splittedFieldName.length > 2) {
      fieldName = splittedFieldName.slice(0, -1).join('_') + '.' + splittedFieldName[splittedFieldName.length - 1];
    }

    return fieldName;
  }
}
