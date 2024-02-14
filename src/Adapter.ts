
import { OpenAPIV3_1 } from 'openapi-types'

import Document from './Document'
import Pack from './Pack'
import {
  ActionOptions,
  Linkage,
  ListActionOptions,
  ListParams,
  Relationship,
  RetrievalActionOptions,
  Sort,
} from './types'

export default interface Adapter<Model, Query, ID> {

  // #region Actions

  list(query: Query, params: ListParams, options: ListActionOptions & {totals: false}): Promise<Model[]>
  list(query: Query, params: ListParams, options: ListActionOptions): Promise<Model[] | [Model[], number]>
  get(query: Query, id: ID, options: RetrievalActionOptions): Promise<Model | null>
  create(document: Document<ID>, requestPack: Pack<ID>, options: ActionOptions): Promise<Model>
  replace(model: Model, document: Document<ID>, requestPack: Pack<ID>, options: ActionOptions): Promise<Model>
  update(model: Model, document: Document<ID>, requestPack: Pack<ID>, options: ActionOptions): Promise<Model>
  delete(query: Query): Promise<Array<Model | ID>>

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

  // #region OpenAPI reflection
  
  openAPI?: OpenAPIReflection

  // #endregion

}

export interface OpenAPIReflection {
  schemaForAttribute(name: string): OpenAPIV3_1.SchemaObject
  isAttributeRequired(name: string): boolean
}