
import { OpenAPIV3_1 } from 'openapi-types'

import { AttributeConfig, RelationshipConfig } from './ResourceConfig'
import { ListParams, Meta, Relationship, RelationshipDataLike, Sort } from './types'

export default interface Adapter<Entity, Query, ID> {

  // #region Actions

  list(query: Query, params: ListParams, options: ListOptions): Promise<ListResponse<Entity>>
  get(query: Query, id: ID): Promise<GetResponse<Entity>>

  create(cb: (entity: Entity) => Promise<void>, options: MutationOptions): Promise<CreateResponse<Entity>>
  update(id: ID, cb: (entity: Entity) => Promise<void>, options: MutationOptions): Promise<UpdateResponse<Entity>>
  replace(id: ID, cb: (entity: Entity) => Promise<void>, options: MutationOptions): Promise<ReplaceResponse<Entity>>
  delete(query: Query, options: MutationOptions): Promise<Array<Entity | ID>>

  // #endregion

  // #region Query modifiers
  
  query(): Query
  clearFilters(query: Query): Query
  applyFilter(query: Query, field: string, value: any): Query | Promise<Query>
  clearSorts(query: Query): Query
  applySort(query: Query, sort: Sort): Query | Promise<Query>
  applyPagination(query: Query, limit: number, offset?: number): Query | Promise<Query>

  // #endregion
  
  // #region (De)serialization

  getAttribute?(data: Entity, name: string, attribute: AttributeConfig<Entity, Query, ID>): any | Promise<any>
  setAttribute?(data: Entity, name: string, value: any, attribute: AttributeConfig<Entity, Query, ID>): void | Promise<void>

  getRelationship?(data: Entity, name: string, relationship: RelationshipConfig<Entity, Query, ID>): Relationship<ID> | RelationshipDataLike<ID> | Promise<Relationship<ID> | RelationshipDataLike<ID>>

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

export interface ListOptions {
  totals?: boolean
}

export interface MutationOptions {
  dryRun?: boolean
}

export interface ListResponse<E> {
  data:      E[]
  total?:    number
  included?: any[]
  meta?:     Meta
}

export interface GetResponse<E> {
  data:      E | null
  included?: any[]
  meta?:     Meta
}

export interface CreateResponse<E> {
  data: E
  meta?: Meta
}

export interface ReplaceResponse<E> {
  data:  E
  meta?: Meta
}

export interface UpdateResponse<E> {
  data:  E
  meta?: Meta
}
