import { Request } from 'express'

import Adapter, { GetResponse } from './Adapter'
import Pack from './Pack'
import RequestContext from './RequestContext'
import Resource from './Resource'
import {
  ActionOptions,
  DocumentLocator,
  Linkage,
  ListParams,
  Meta,
  OpenAPIResourceMeta,
  Relationship,
  RetrievalActionOptions,
} from './types'

export type ResourceConfigMap = Record<string, ResourceConfig<any, any, any>>

export interface ResourceConfig<Entity, Query, ID> {

  // #region Naming

  /** The plural name of this resource type - by default the type itself. */
  plural?: string

  /** The singular name of this resource type - by default a singularized version of the type itself. */
  singular?: string

  // #endregion

  // #region Overall

  /** The name of the entity that backs this resource. */
  entity?: string

  /** Any literal meta / texts used in OpenAPI generation. */
  openapi?: OpenAPIResourceMeta

  /** If true, this resource won't be resolved as the default resource for the given entity class. */
  auxiliary?: boolean

  /** Whether to include totals. */
  totals?: boolean

  // #endregion

  // #region Attributes & relationships

  /** The name of the ID attribute. */
  idAttribute?: string

  /** The serialzable attributes for this resource. */
  attributes: AttributeMap<Entity, Query, ID>

  /** Relationship configuration for this resource. */
  relationships?: RelationshipMap<Entity, Query, ID>

  // #endregion

  // #region Data retrieval

  /** A scope configuration. */
  scope?: ScopeConfig<Entity, Query, ID>

  /** Query defaults. */
  query?: QueryModifier<Entity, Query, ID>

  /** A search configuration. */
  search?: SearchModifier<Entity, Query, ID>

  /** Label configuration. */
  labels?: LabelMap<Entity, Query, ID>

  /** Singleton configuration. */
  singletons?: SingletonMap<Query, Entity, ID>

  /** Sort configuration. */
  sorts?: SortMap<Query>

  /** Filter configuration. */
  filters?: FilterMap<Query>

  // #endregion

  // #region Meta

  meta?:         Meta | DynamicMeta<Entity, Query, ID>
  documentMeta?: DynamicDocumentMeta<Entity, Query, ID>

  // #endregion

  // #region Pagination

  /** Whether a request without a 'page' parameter should still be paginated. */
  forcePagination?: boolean

  /** The page size to use for this resource. */
  pageSize?: number

  // #endregion

  // #region Actions

  /** A function called before any request for this resource is executed. */
  before?: BeforeHandler[]

  /** A custom `list` action or `false` to disable this action. */
  list?: false | ListAction<Entity, Query, ID>

  /** A custom `show` action or `false` to disable this action. */
  show?: false | GetAction<Entity, Query, ID>

  /** A custom `create` action or `false` to disable this action. */
  create?: false | CreateAction<Entity, Query, ID>

  /** A custom `replace` action or `false` to disable this action. */
  replace?: false | ReplaceAction<Entity, Query, ID>

  /** A custom `update` action or `false` to disable this action. */
  update?: false | UpdateAction<Entity, Query, ID>

  /** A custom `delete` action or `false` to disable this action. */
  delete?: false | DeleteAction<Entity, Query, ID>

  /** Custom collection actions for this resource. */
  collectionActions?: Record<string, CustomCollectionAction<Entity, Query, ID>>

  /** Custom document actions for this resource. */
  documentActions?: Record<string, CustomDocumentAction<Entity, Query, ID>>

  // #endregion

}

// #region Attribute types

export type AttributeMap<M, Q, I> = Record<string, AttributeConfig<M, Q, I> | true>
export interface AttributeConfig<M, Q, I> {
  writable?:  boolean | AttributeIf<M, Q, I> | 'create'
  detail?:    boolean
  if?:        AttributeIf<M, Q, I>
  get?:       AttributeGetter<M, Q, I>
  set?:       AttributeSetter<M, Q, I>
  serialize?: (value: any) => any
}

export type AttributeIf<M, Q, I> = (this: Resource<M, Q, I>, item: M, context: RequestContext) => boolean | Promise<boolean>
export type AttributeGetter<M, Q, I> = (this: Resource<M, Q, I>, item: M, context: RequestContext) => unknown | Promise<unknown>
export type AttributeSetter<M, Q, I> = (this: Resource<M, Q, I>, item: M, value: unknown, context: RequestContext) => void | Promise<void>

// #endregion

// #region Meta types

export type DynamicMeta<M, Q, I> = (this: Resource<M, Q, I>, meta: Meta, entity: M | null, context: RequestContext) => Meta | Promise<Meta>
export type DynamicDocumentMeta<M, Q, I> = (this: Resource<M, Q, I>, meta: Meta, entity: M, context: RequestContext) => Meta | Promise<Meta>

// #endregion

// #region Relationship #region types

export type RelationshipMap<M, Q, I> = Record<string, RelationshipConfig<M, Q, I>>
export type RelationshipConfig<M, Q, I> = SingularRelationshipConfig<M, Q, I> | PluralRelationshipConfig<M, Q, I>

interface RelationshipConfigCommon<M, Q, I> {
  type?:     string
  writable?: boolean | 'create'
  detail?:   boolean
  if?:       (this: Resource<M, Q, I>, entity: M, context: RequestContext) => boolean | Promise<boolean>
  include?:  RelationshipIncludeConfig
}

export interface RelationshipIncludeConfig {
  always?: boolean
  detail?: boolean
}

export type SingularRelationshipConfig<M, Q, I> = RelationshipConfigCommon<M, Q, I> & {
  plural: false

  get?: (this: Resource<M, Q, I>, entity: M, context: RequestContext) => Promise<Relationship<I> | I | Linkage<I> | null>
  set?: (this: Resource<M, Q, I>, entity: M, value: I | null, context: RequestContext) => any | Promise<any>
}

export type PluralRelationshipConfig<M, Q, I> = RelationshipConfigCommon<M, Q, I> & {
  plural: true

  get?: (this: Resource<M, Q, I>, entity: M, context: RequestContext) => Promise<Relationship<I> | Array<Linkage<I> | I>>
  set?: (this: Resource<M, Q, I>, entity: M, ids: I[], context: RequestContext) => any | Promise<any>
}

// #endregion

// #region Scope & search

export interface ScopeConfig<M, Q, I> {
  query:  QueryModifier<M, Q, I>
  ensure: EnsureFunction<M, Q, I>
}

export type QueryModifier<M, Q, I> = (this: Resource<M, Q, I>, query: Q, context: RequestContext) => Q | Promise<Q>
export type EnsureFunction<M, Q, I> = (this: Resource<M, Q, I>, entity: M, context: RequestContext) => void | Promise<void>

export type ScopeOption<M, Q, I> = (this: Resource<M, Q, I>, request: Request) => any
export type SearchModifier<M, Q, I> = (this: Resource<M, Q, I>, query: Q, term: string, context: RequestContext) => Q | Promise<Q>

export type LabelMap<M, Q, I> = Record<string, LabelModifier<M, Q, I>>
export type LabelModifier<M, Q, I> = (this: Resource<M, Q, I>, query: Q, context: RequestContext) => Q | Promise<Q>
export type WildcardLabelModifier<M, Q, I> = (this: Resource<M, Q, I>, label: string, query: Q, context: RequestContext) => Q

export type SingletonMap<Q, M, I> = Record<string, Singleton<Q, M, I>>
export type Singleton<Q, M, I> = (this: Resource<M, Q, I>, query: Q, context: RequestContext, options: RetrievalActionOptions) => Promise<GetResponse<M>>

export type SortMap<Q> = Record<string, SortModifier<Q>>
export type SortModifier<Q> = (query: Q, direction: 1 | -1, context: RequestContext) => Q

export type FilterMap<Q> = Record<string, FilterModifier<Q>>
export type FilterModifier<Q> = (query: Q, value: any, context: RequestContext) => Q | Promise<Q>

// #endregion

// #region Actions

export type BeforeHandler = (context: RequestContext) => void | Promise<void>

export type ListAction<M, Q, I> = (
  this:    Resource<M, Q, I>,
  params:  ListParams,
  adapter: () => Adapter<M, Q, I>,
  context: RequestContext,
  options: ActionOptions
) => Promise<Pack<I>>

export type GetAction<M, Q, I> = (
  this:    Resource<M, Q, I>,
  locator: DocumentLocator<I>,
  adapter: () => Adapter<M, Q, I>,
  context: RequestContext,
  options: ActionOptions
) => Promise<Pack<I>>

export type CreateAction<M, Q, I> = (
  this:     Resource<M, Q, I>,
  pack:     Pack<I>,
  adapter:  () => Adapter<M, Q, I>,
  context:  RequestContext,
  options:  ActionOptions
) => Promise<Pack<I>>

export type ReplaceAction<M, Q, I> = (
  this:        Resource<M, Q, I>,
  id:          I,
  requestPack: Pack<I>,
  adapter:     () => Adapter<M, Q, I>,
  context:     RequestContext,
  options:     ActionOptions
) => Promise<Pack<I>>

export type UpdateAction<M, Q, I> = (
  this:        Resource<M, Q, I>,
  id:          I,
  requestPack: Pack<I>,
  adapter:     () => Adapter<M, Q, I>,
  context:     RequestContext,
  options:     ActionOptions
) => Promise<Pack<I>>

export type DeleteAction<M, Q, I> = (
  this:        Resource<M, Q, I>,
  requestPack: Pack<I>,
  adapter:     () => Adapter<M, Q, I>,
  context:     RequestContext
) => Promise<Pack<I>>


// #endregion

// #region Custom actions

export type CustomCollectionAction<M, Q, I> = CustomCollectionActionConfig<M, Q, I> | CustomCollectionActionHandler<M, Q, I>
export type CustomCollectionActionHandler<M, Q, I> = (this: Resource<M, Q, I>, pack: Pack<I>, adapter: () => Adapter<M, Q, I>, context: RequestContext, options: ActionOptions) => Promise<Pack<I>>

export interface CustomCollectionActionConfig<M, Q, I> {
  handler: CustomCollectionActionHandler<M, Q, I>
  router?: CustomActionRouterOptions
}


export type CustomDocumentAction<M, Q, I> = CustomDocumentActionConfig<M, Q, I> | CustomDocumentActionHandler<M, Q, I>
export type CustomDocumentActionHandler<M, Q, I> = (this: Resource<M, Q, I>, locator: DocumentLocator<I>, pack: Pack<I>, adapter: () => Adapter<M, Q, I>, context: RequestContext, options: ActionOptions) => Promise<Pack<I>>

export interface CustomDocumentActionConfig<M, Q, I> {
  handler: CustomDocumentActionHandler<M, Q, I>
  router?: CustomActionRouterOptions
}

export interface CustomActionRouterOptions {
  method?:      'get' | 'post' | 'put' | 'delete'
  deserialize?: boolean
}

// #endregion

// #region Utility

export function mergeResourceConfig<M, Q, I>(config: ResourceConfig<M, Q, I>, defaults: Partial<ResourceConfig<M, Q, I>>): ResourceConfig<M, Q, I> {
  return {
    ...defaults,
    ...config,

    attributes: {
      ...defaults.attributes,
      ...config.attributes,
    },

    collectionActions: {
      ...defaults.collectionActions,
      ...config.collectionActions,
    },

    documentActions: {
      ...defaults.documentActions,
      ...config.documentActions,
    },
  }
}

// #endregion
