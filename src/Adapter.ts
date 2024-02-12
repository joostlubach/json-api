
import Document from './Document'
import {
  ActionOptions,
  DocumentLocator,
  Linkage,
  ListActionOptions,
  ListParams,
  Meta,
  Relationship,
  RetrievalActionOptions,
  Sort,
} from './types'

export default interface Adapter<Model, Query, ID> {

  // #region Actions

  list(query: Query, params: ListParams, options: ListActionOptions & {totals: false}): Promise<Model[]>
  list(query: Query, params: ListParams, options: ListActionOptions): Promise<Model[] | [Model[], number]>
  get(query: Query, locator: DocumentLocator<ID>, options: RetrievalActionOptions): Promise<Model>
  create(query: Query, document: Document<ID>, meta: Meta, options: ActionOptions): Promise<Model>
  replace(query: Query, locator: DocumentLocator<ID>, document: Document<ID>, meta: Meta, options: ActionOptions): Promise<Model>
  update(query: Query, locator: DocumentLocator<ID>, document: Document<ID>, meta: Meta, options: ActionOptions): Promise<Model>
  delete(query: Query): Promise<Array<Model | ID>>

  listRelated(locator: DocumentLocator<ID>, relationship: string, query: Query, params: ListParams, options: ListActionOptions): Promise<Model[]>
  showRelated(locator: DocumentLocator<ID>, relationship: string, query: Query, options: RetrievalActionOptions): Promise<Model>

  // #endregion

  // #region Query modifiers
  
  query(): Query
  clearFilters(query: Query): Query
  applyFilter(query: Query, field: string, value: any): Query | Promise<Query>
  clearSorts(query: Query): Query
  applySort(query: Query, sort: Sort): Query | Promise<Query>
  applyOffset(query: Query, offset: number): Query | Promise<Query>
  applyLimit(query: Query, limit: number): Query | Promise<Query>
  
  // #endregion
  
  // #region (De)serialization
  
  getAttribute?(model: Model, name: string): any | Promise<any>
  getRelationship?(model: Model, name: string): Relationship<ID> | ID | Linkage<ID> | Promise<ID | Linkage<ID>>

  setAttribute?(model: Model, name: string, value: any): void | Promise<void>
  setRelationship?(model: Model, name: string, relationship: Relationship<ID>): void | Promise<void>

  // #endregion

}