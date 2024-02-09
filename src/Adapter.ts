
import Document from './Document'
import {
  ActionOptions,
  DocumentLocator,
  Linkage,
  ListParams,
  Meta,
  Relationship,
  RetrievalActionOptions,
  Sort,
} from './types'

export default interface Adapter<Model, Query, ID> {

  // #region Actions

  list(query: Query, params: ListParams, options: RetrievalActionOptions): Promise<Model[]>
  get(query: Query, locator: DocumentLocator<ID>, options: RetrievalActionOptions): Promise<Model>
  create(query: Query, document: Document<ID>, meta: Meta, options: ActionOptions): Promise<Model>
  replace(query: Query, locator: DocumentLocator<ID>, document: Document<ID>, meta: Meta, options: ActionOptions): Promise<Model>
  update(query: Query, locator: DocumentLocator<ID>, document: Document<ID>, meta: Meta, options: ActionOptions): Promise<Model>
  delete(query: Query): Promise<Array<Model | ID>>

  listRelated(locator: DocumentLocator<ID>, relationship: string, query: Query, params: ListParams, options: RetrievalActionOptions): Promise<Model[]>
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
  
  // #region Serialization
  
  getID?(model: Model): ID | Promise<ID>
  getAttribute?(model: Model, attribute: string): any | Promise<any>
  getRelationship?(model: Model, relationship: string): Relationship<ID> | ID | Linkage<ID> | Promise<ID | Linkage<ID>>
  collectIncludes?(models: Model[], includes: string[]): Promise<Document<ID>[]>

  // #endregion

}