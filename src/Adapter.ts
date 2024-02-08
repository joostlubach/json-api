import Collection from './Collection'
import Document from './Document'
import Pack from './Pack'
import {
  ActionOptions,
  DocumentLocator,
  ListParams,
  Meta,
  RetrievalActionOptions,
  Sort,
} from './types'

export default interface Adapter<Model, Query, ID> {

  // #region Actions

  list(query: Query, params: ListParams, options: RetrievalActionOptions): Promise<Pack<ID>>
  get(query: Query, locator: DocumentLocator<ID>, options: RetrievalActionOptions): Promise<Pack<ID>>
  create(query: Query, document: Document<ID>, meta: Meta, options: ActionOptions): Promise<Pack<ID>>
  replace(query: Query, locator: DocumentLocator<ID>, document: Document<ID>, meta: Meta, options: ActionOptions): Promise<Pack<ID>>
  update(query: Query, locator: DocumentLocator<ID>, document: Document<ID>, meta: Meta, options: ActionOptions): Promise<Pack<ID>>
  delete(query: Query): Promise<Pack<ID>>

  listRelated(locator: DocumentLocator<ID>, relationship: string, query: Query, params: ListParams, options: RetrievalActionOptions): Promise<Pack<ID>>
  showRelated(locator: DocumentLocator<ID>, relationship: string, query: Query, options: RetrievalActionOptions): Promise<Pack<ID>>

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
  
  // #region Utility

  modelToDocument(model: Model, options?: ModelToDocumentOptions): Promise<Document<ID>>
  modelsToCollection(models: Model[], options?: ModelsToCollectionOptions): Promise<Collection<ID>>

  // #endregion

}

export interface ModelToDocumentOptions {
  detail?: boolean
}

export interface ModelsToCollectionOptions {
  detail?: boolean
}
