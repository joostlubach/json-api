import { Constructor, objectEntries } from 'ytil'
import { Filters, Sort } from './types'

export class SimpleQuery<T> {

  constructor(
    private readonly _filters: Filters = {},
    private readonly _sorts: Sort[] = [],
    private readonly _skip: number | undefined = undefined,
    private readonly _take: number | undefined = undefined,
  ) {}

  public clone<Q extends SimpleQuery<any>>(this: Q, update: Partial<QueryData>): Q {
    const Self = this.constructor as Constructor<Q>
    return new Self(
      update.filters ?? this._filters,
      update.sorts ?? this._sorts,
      update.skip ?? this._skip,
      update.take ?? this._take,
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

  public pagination(take: number, skip?: number) {
    return this.clone({
      take,
      skip,
    })
  }

  public skip(): number | undefined {
    return this._skip
  }

  public take(): number | undefined {
    return this._take
  }

  // #endregion

}

export interface QueryData {
  filters: Filters
  sorts:   Sort[]
  skip:  number
  take:   number
}