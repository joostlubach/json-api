import { Constructor, objectEntries } from 'ytil'

import { Filters, Sort } from './types'

export class SimpleQuery<T> {

  constructor(
    private readonly _filters: Filters = {},
    private readonly _sorts: Sort[] = [],
    private readonly _offset: number | undefined = undefined,
    private readonly _limit: number | undefined = undefined,
  ) {}

  public clone<Q extends SimpleQuery<any>>(this: Q, update: Partial<QueryData>): Q {
    const Self = this.constructor as Constructor<Q>
    return new Self(
      update.filters ?? this._filters,
      update.sorts ?? this._sorts,
      update.offset ?? this._offset,
      update.limit ?? this._limit,
    )
  }

  // #region Filters

  public filters() {
    return this._filters
  }

  public filter(filters: Record<string, any>): this {
    return this.clone({
      filters: {
        ...this.filters(),
        ...filters,
      },
    })
  }

  public clearFilters(): this {
    return this.clone({filters: {}})
  }

  // #endregion
  
  // #region Sorts

  public sorts() {
    return this._sorts
  }

  public sort(sort: Record<string, any>): this {
    return this.clone({
      sorts: [
        ...this.sorts(),
        ...objectEntries(sort).map(([field, direction]) => ({field, direction})),
      ],
    })
  }

  public clearSorts(): this {
    return this.clone({sorts: []})
  }

  // #endregion

  // #region Pagination

  public pagination(limit: number, offset?: number) {
    return this.clone({
      limit,
      offset,
    })
  }

  public offset(): number | undefined {
    return this._offset
  }

  public limit(): number | undefined {
    return this._limit
  }

  // #endregion

}

export interface QueryData {
  filters: Filters
  sorts:   Sort[]
  offset:  number
  limit:   number
}