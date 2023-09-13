import Collection from './Collection'
import Document from './Document'
import Pack from './Pack'
import { RelationshipConfig } from './ResourceConfig'
import {
  ActionOptions,
  AnyResource,
  Filters,
  ListOptions,
  PaginationSpec,
  ResourceLocator,
  Sort,
  UpdateOptions,
} from './types'

export default interface Adapter<Model, Query> {

  // #region Query

  query(): Query
  relatedQuery(parentResource: AnyResource, relationship: RelationshipConfig<any>, name: string, parentID: string): Promise<Query>

  applyFilters(query: Query, filters: Filters): Query | Promise<Query>
  applySearch(query: Query, search: string): Query | Promise<Query>
  applySorts(query: Query, sorts: Sort[]): Query | Promise<Query>

  // #endregion

  // #region Retrieval

  count(query: Query): Promise<number>
  find(query: Query, pagination: PaginationSpec, options: Omit<ListOptions, 'pagination'>): Promise<Pack>
  get(query: Query, locator: ResourceLocator, options: ActionOptions): Promise<{pack: Pack, models: Model[]}>

  // #endregion

  // #region Modification

  create(query: Query, document: Document, options: ActionOptions): Promise<{pack: Pack, model: Model}>
  update(query: Query, Document: Document, options: UpdateOptions<Model>): Promise<{pack: Pack, model: Model}>
  delete(query: Query, options: ActionOptions): Promise<Pack>

  // #endregion

  // #region Relationships

  loadModel(query: Query, id: any): Promise<Model>
  getRelated(query: Query, parentResource: AnyResource, relationship: RelationshipConfig<any>, name: string, parentID: string, options: ActionOptions): Promise<{pack: Pack, models: Model[]}>

  // #endregion

  // #region Serialization

  modelToDocument(model: Model, detail?: boolean): Document | Promise<Document>
  modelsToCollection(models: Model[], detail?: boolean): Collection | Promise<Collection>

  // #endregion

}
