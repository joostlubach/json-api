import { Request } from 'express'

import Adapter, { GetResponse } from './Adapter'
import Pack from './Pack'
import RequestContext from './RequestContext'
import Resource from './Resource'
import {
  ActionOptions,
  ConfigExtra,
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
  singletons?: SingletonMap<Entity, Query, ID>

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

  // #region Extra

  extra?: ConfigExtra

  // #endregion

}

// #region Attribute types

export type AttributeMap<E, Q, I> = Record<string, AttributeConfig<E, Q, I> | true>
export interface AttributeConfig<E, Q, I> {
  writable?:  boolean | AttributeIf<E, Q, I> | 'create'
  detail?:    boolean
  if?:        AttributeIf<E, Q, I>
  get?:       AttributeGetter<E, Q, I>
  set?:       AttributeSetter<E, Q, I>
  serialize?: (value: any) => any
}

export type AttributeIf<E, Q, I> = (this: Resource<E, Q, I>, entity: E, context: RequestContext) => boolean | Promise<boolean>
export type AttributeGetter<E, Q, I> = (this: Resource<E, Q, I>, entity: E, context: RequestContext) => unknown | Promise<unknown>
export type AttributeSetter<E, Q, I> = (this: Resource<E, Q, I>, entity: E, value: unknown, context: RequestContext) => void | Promise<void>

// #endregion

// #region Meta types

export type DynamicMeta<E, Q, I> = (this: Resource<E, Q, I>, meta: Meta, entity: E | null, context: RequestContext) => Meta | Promise<Meta>
export type DynamicDocumentMeta<E, Q, I> = (this: Resource<E, Q, I>, meta: Meta, entity: E, context: RequestContext) => Meta | Promise<Meta>

// #endregion

// #region Relationship #region types

export type RelationshipMap<E, Q, I> = Record<string, RelationshipConfig<E, Q, I>>
export type RelationshipConfig<E, Q, I> = SingularRelationshipConfig<E, Q, I> | PluralRelationshipConfig<E, Q, I>

interface RelationshipConfigCommon<E, Q, I> {
  type?:     string
  writable?: boolean | 'create'
  detail?:   boolean
  if?:       (this: Resource<E, Q, I>, entity: E, context: RequestContext) => boolean | Promise<boolean>
  include?:  RelationshipIncludeConfig
}

export interface RelationshipIncludeConfig {
  always?: boolean
  detail?: boolean
}

export type SingularRelationshipConfig<E, Q, I> = RelationshipConfigCommon<E, Q, I> & {
  plural: false

  get?: (this: Resource<E, Q, I>, entity: E, context: RequestContext) => Promise<Relationship<I> | I | Linkage<I> | null>
  set?: (this: Resource<E, Q, I>, entity: E, value: I | null, context: RequestContext) => any | Promise<any>
}

export type PluralRelationshipConfig<E, Q, I> = RelationshipConfigCommon<E, Q, I> & {
  plural: true

  get?: (this: Resource<E, Q, I>, entity: E, context: RequestContext) => Promise<Relationship<I> | Array<Linkage<I> | I>>
  set?: (this: Resource<E, Q, I>, entity: E, ids: I[], context: RequestContext) => any | Promise<any>
}

// #endregion

// #region Scope & search

export interface ScopeConfig<E, Q, I> {
  query:  QueryModifier<E, Q, I>
  ensure: EnsureFunction<E, Q, I>
}

export type QueryModifier<E, Q, I> = (this: Resource<E, Q, I>, query: Q, context: RequestContext) => Q | Promise<Q>
export type EnsureFunction<E, Q, I> = (this: Resource<E, Q, I>, entity: E, context: RequestContext) => void | Promise<void>

export type ScopeOption<E, Q, I> = (this: Resource<E, Q, I>, request: Request) => any
export type SearchModifier<E, Q, I> = (this: Resource<E, Q, I>, query: Q, term: string, context: RequestContext) => Q | Promise<Q>

export type LabelMap<E, Q, I> = Record<string, LabelModifier<E, Q, I>>
export type LabelModifier<E, Q, I> = (this: Resource<E, Q, I>, query: Q, context: RequestContext) => Q | Promise<Q>
export type WildcardLabelModifier<E, Q, I> = (this: Resource<E, Q, I>, label: string, query: Q, context: RequestContext) => Q

export type SingletonMap<E, Q, I> = Record<string, Singleton<E, Q, I>>
export type Singleton<E, Q, I> = (this: Resource<E, Q, I>, query: Q, context: RequestContext, options: RetrievalActionOptions) => Promise<GetResponse<E>>

export type SortMap<Q> = Record<string, SortModifier<Q>>
export type SortModifier<Q> = (query: Q, direction: 1 | -1, context: RequestContext) => Q

export type FilterMap<Q> = Record<string, FilterModifier<Q>>
export type FilterModifier<Q> = (query: Q, value: any, context: RequestContext) => Q | Promise<Q>

// #endregion

// #region Actions

export type BeforeHandler = (context: RequestContext) => void | Promise<void>

export type ListAction<E, Q, I> = (
  this:    Resource<E, Q, I>,
  params:  ListParams,
  adapter: () => Adapter<E, Q, I>,
  context: RequestContext,
  options: ActionOptions
) => Promise<Pack<I>>

export type GetAction<E, Q, I> = (
  this:    Resource<E, Q, I>,
  locator: DocumentLocator<I>,
  adapter: () => Adapter<E, Q, I>,
  context: RequestContext,
  options: ActionOptions
) => Promise<Pack<I>>

export type CreateAction<E, Q, I> = (
  this:     Resource<E, Q, I>,
  pack:     Pack<I>,
  adapter:  () => Adapter<E, Q, I>,
  context:  RequestContext,
  options:  ActionOptions
) => Promise<Pack<I>>

export type ReplaceAction<E, Q, I> = (
  this:        Resource<E, Q, I>,
  id:          I,
  requestPack: Pack<I>,
  adapter:     () => Adapter<E, Q, I>,
  context:     RequestContext,
  options:     ActionOptions
) => Promise<Pack<I>>

export type UpdateAction<E, Q, I> = (
  this:        Resource<E, Q, I>,
  id:          I,
  requestPack: Pack<I>,
  adapter:     () => Adapter<E, Q, I>,
  context:     RequestContext,
  options:     ActionOptions
) => Promise<Pack<I>>

export type DeleteAction<E, Q, I> = (
  this:        Resource<E, Q, I>,
  requestPack: Pack<I>,
  adapter:     () => Adapter<E, Q, I>,
  context:     RequestContext
) => Promise<Pack<I>>


// #endregion

// #region Custom actions

export type CustomCollectionAction<E, Q, I> = CustomCollectionActionConfig<E, Q, I> | CustomCollectionActionHandler<E, Q, I>
export type CustomCollectionActionHandler<E, Q, I> = (this: Resource<E, Q, I>, pack: Pack<I>, adapter: () => Adapter<E, Q, I>, context: RequestContext, options: ActionOptions) => Promise<Pack<I>>

export interface CustomCollectionActionConfig<E, Q, I> {
  handler: CustomCollectionActionHandler<E, Q, I>
  router?: CustomActionRouterOptions
}


export type CustomDocumentAction<E, Q, I> = CustomDocumentActionConfig<E, Q, I> | CustomDocumentActionHandler<E, Q, I>
export type CustomDocumentActionHandler<E, Q, I> = (this: Resource<E, Q, I>, locator: DocumentLocator<I>, pack: Pack<I>, adapter: () => Adapter<E, Q, I>, context: RequestContext, options: ActionOptions) => Promise<Pack<I>>

export interface CustomDocumentActionConfig<E, Q, I> {
  handler: CustomDocumentActionHandler<E, Q, I>
  router?: CustomActionRouterOptions
}

export interface CustomActionRouterOptions {
  endpoint?:    string
  method?:      'post' | 'put' | 'patch' | 'delete'
  deserialize?: boolean
}

// #endregion

// #region Utility

export function mergeResourceConfig<E, Q, I>(config: ResourceConfig<E, Q, I>, defaults: Partial<ResourceConfig<E, Q, I>>): ResourceConfig<E, Q, I> {
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
