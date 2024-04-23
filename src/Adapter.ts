
import { OpenAPIV3_1 } from 'openapi-types'

import Pack from './Pack'
import { AttributeConfig, RelationshipConfig } from './ResourceConfig'
import {
  ActionOptions,
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

  list(query: Query, params: ListParams, options: ListActionOptions): Promise<ListResponse<Model>>
  get(query: Query, id: ID, options: RetrievalActionOptions): Promise<GetResponse<Model>>
  save(data: Model, requestPack: Pack<ID>, options: ActionOptions): Promise<SaveResponse<Model>>
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

  emptyModel(id: ID | null): Model | Promise<Model>
  
  getAttribute?(data: Model, name: string, attribute: AttributeConfig<Model, Query, ID>): any | Promise<any>
  setAttribute?(data: Model, name: string, value: any, attribute: AttributeConfig<Model, Query, ID>): void | Promise<void>

  getRelationship?(data: Model, name: string, relationship: RelationshipConfig<Model, Query, ID>): Relationship<ID> | ID | Linkage<ID> | Promise<ID | Linkage<ID>>

  // #endregion

  // #region (OpenAPI) reflection

  attributeExists?(name: string): boolean | Promise<boolean>
  attributeRequired?(name: string): boolean | Promise<boolean>

  openAPISchemaForAttribute?(name: string, document: OpenAPIV3_1.Document): OpenAPIV3_1.SchemaObject | Promise<OpenAPIV3_1.SchemaObject>
  openAPIDocumentationForRelationship?(name: string, document: OpenAPIV3_1.Document): OpenAPIDocumentation | Promise<OpenAPIDocumentation>

  // #endregion

}

export type OpenAPIDocumentation = Pick<OpenAPIV3_1.SchemaObject,
  | 'title'
  | 'description'
  | 'example'
  | 'examples'
  | 'externalDocs'
>

export interface ListResponse<M> {
  data:      M[]
  total?:    number
  included?: any[]
  meta?:     Meta
}

export interface GetResponse<M> {
  data:      M | null
  included?: any[]
  meta?:     Meta
}

export interface SaveResponse<M> {
  data:  M
  meta?: Meta
}

export interface ReplaceResponse<M> {
  data:  M
  meta?: Meta
}

export interface UpdateResponse<M> {
  data:  M
  meta?: Meta
}
