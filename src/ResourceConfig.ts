import { Request } from 'express'

import Adapter from './Adapter'
import Document from './Document'
import Pack from './Pack'
import RequestContext from './RequestContext'
import Resource from './Resource'
import {
  ActionOptions,
  BulkSelector,
  DocumentLocator,
  Linkage,
  ListParams,
  Meta,
  RelatedQuery,
  Relationship,
  ResourceID,
} from './types'

export type ResourceConfigMap = Record<string, ResourceConfig<any, any, any>>

export interface ResourceConfig<Model, Query, ID> {

  // ------
  // Naming

  /// The plural name of this resource type - by default the type itself.
  plural?: string

  /// The singular name of this resource type - by default a singularized version of the type itself.
  singular?: string

  // ------
  // Overall

  /// The name of the model that backs this resource.
  modelName?: string

  /// If true, this resource won't be resolved as the default resource for the given model class.
  auxiliary?: boolean

  /// Whether to include totals.
  totals?: boolean

  /// Whether the resource is read-only.
  readonly?: boolean

  // ------
  // Serialization

  /// The serialzable attributes for this resource.
  attributes?: AttributeMap<Model, Query, ID>

  /// Relationship configuration for this resource.
  relationships?: RelationshipMap<Model, Query, ID> | RelationshipsBuilder<Model, Query, ID>

  // ------
  // Data retrieval

  /// A scope configuration.
  scope?: ScopeFunction<Model, Query, ID>

  /// Defaults for a new object.
  defaults?: DefaultsFunction<Model, Query, ID>

  /// A search configuration.
  search?: SearchModifier<Model, Query, ID>

  /// Label configuration.
  labels?: LabelMap<Model, Query, ID>

  /// Singleton configuration.
  singletons?: SingletonMap<Query, Model>

  /// Sort configuration.
  sorts?: SortMap<Query>

  /// Filter configuration.
  filters?: FilterMap<Query>

  /// A wildcard label configuration.
  wildcardLabel?: WildcardLabelModifier<Model, Query, ID>

  // ------
  // Meta & links

  links?: LinkMap<Model, Query, ID>
  meta?:  MetaMap<Model, Query, ID>

  documentLinks?: DocumentLinkMap<Model, Query, ID>
  documentMeta?:  DocumentMetaMap<Model, Query, ID>

  // ------
  // Pagination

  /// Whether a request without a 'page' parameter should still be paginated.
  forcePagination?: boolean

  /// The page size to use for this resource.
  pageSize?: number

  // ------
  // Controller actions

  /// A function called before any request for this resource is executed.
  before?: BeforeHandler[]

  /// A custom `list` action or `false` to disable this action.
  list?: false | ListAction<Model, Query, ID>

  /// A custom `get` action or `false` to disable this action.
  get?: false | GetAction<Model, Query, ID>

  /// A custom `create` action or `false` to disable this action.
  create?: false | CreateAction<Model, Query, ID>

  /// A custom `replace` action or `false` to disable this action.
  replace?: false | ReplaceAction<Model, Query, ID>

  /// A custom `update` action or `false` to disable this action.
  update?: false | UpdateAction<Model, Query, ID>

  /// A custom `delete` action or `false` to disable this action.
  delete?: false | DeleteAction<Model, Query, ID>

  /// A custom `listRelated` action or `false` to disable this action.
  listRelated?: false | ListRelatedAction<Model, Query, ID>

  /// A custom `showRelated` action or `false` to disable this action.
  showRelated?: false | GetRelatedAction<Model, Query, ID>

  // ------
  // Low level interface

  include?: (ids: ResourceID[]) => Promise<Model[]>

  // ------
  // Custom

  collectionActions?: CustomCollectionAction<Model, Query, ID>[]
  documentActions?:   CustomDocumentAction<Model, Query, ID>[]

}

// ------
// Attribute types

export type AttributeMap<M, Q, I> = Record<string, AttributeConfig<M, Q, I> | boolean>
export interface AttributeConfig<M, Q, I> {
  writable?:    boolean | AttributeIf<M, Q, I> | 'create'
  detail?:      boolean
  if?:          AttributeIf<M, Q, I>
  collect?:     AttributeCollector<M, Q, I>
  get?:         AttributeGetter<M, Q, I>
  set?:         AttributeSetter<M, Q, I>
  serialize?:   AttributeSerializer
  deserialize?: AttributeDeserializer
}

export type AttributeIf<M, Q, I> = (this: Resource<M, Q, I>, item: M, context: RequestContext) => boolean | Promise<boolean>
export type AttributeCollector<M, Q, I> = (this: Resource<M, Q, I>, items: M[], context: RequestContext) => any | Promise<any>
export type AttributeGetter<M, Q, I> = (this: Resource<M, Q, I>, item: M, raw: any, context: RequestContext) => any | Promise<any>
export type AttributeSetter<M, Q, I> = (this: Resource<M, Q, I>, item: M, raw: any, context: RequestContext) => any | Promise<any>
export type AttributeSerializer = (value: any) => any
export type AttributeDeserializer = (raw: any) => any

// ------
// Meta & link types

export type LinkMap<M, Q, I> = Record<string, LinkConfig<M, Q, I>>
export type DocumentLinkMap<M, Q, I> = Record<string, DocumentLinkConfig<M, Q, I>>

export interface LinkConfig<M, Q, I> {
  get: (this: Resource<M, Q, I>, context: RequestContext) => string | Promise<string>
}

export interface DocumentLinkConfig<M, Q, I> {
  get: (this: Resource<M, Q, I>, item: M, context: RequestContext) => string | Promise<string>
}

export type MetaMap<M, Q, I> = Record<string, MetaConfig<M, Q, I>>
export type DocumentMetaMap<M, Q, I> = Record<string, DocumentMetaConfig<M, Q, I>>

export interface MetaConfig<M, Q, I> {
  get: (this: Resource<M, Q, I>, context: RequestContext) => any | Promise<any>
}

export interface DocumentMetaConfig<M, Q, I> {
  get: (this: Resource<M, Q, I>, item: M, context: RequestContext) => any | Promise<any>
}

// ------
// Relationship types

export type RelationshipMap<M, Q, I> = Record<string, RelationshipConfig<M, Q, I>>
export type RelationshipConfig<M, Q, I> = SingularRelationshipConfig<M, Q, I> | PluralRelationshipConfig<M, Q, I>
export type RelationshipsBuilder<M, Q, I> = (this: Resource<M, Q, I>, model: M) => Record<string, Relationship>

interface RelationshipConfigCommon<M, Q, I> {
  type?:     string
  writable?: boolean | 'create'
  detail?:   boolean
  if?:       (this: Resource<M, Q, I>, model: M, context: RequestContext) => boolean
  include?:  RelationshipIncludeConfig
}

export interface RelationshipIncludeConfig {
  always?: boolean
  detail?: boolean
}

export type SingularRelationshipConfig<M, Q, I> = RelationshipConfigCommon<M, Q, I> & {
  plural: false

  get?: (model: M, context: RequestContext) => Promise<string | Linkage | null>
  set?: (model: M, value: string | null, context: RequestContext) => any | Promise<any>
}

export type PluralRelationshipConfig<M, Q, I> = RelationshipConfigCommon<M, Q, I> & {
  plural: true

  get?: (model: M, context: RequestContext) => RelatedQuery | Promise<Array<string | Linkage>>
  set?: (model: M, value: string[], context: RequestContext) => any | Promise<any>
}

// ------
// Scope & search

export type ScopeFunction<M, Q, I> = (this: Resource<M, Q, I>, query: Q, context: RequestContext) => Q | Promise<Q>
export type DefaultsFunction<M, Q, I> = (this: Resource<M, Q, I>, context: RequestContext) => Record<string, any> | Promise<Record<string, any>>
export type ScopeOption<M, Q, I> = (this: Resource<M, Q, I>, request: Request) => any
export type SearchModifier<M, Q, I> = (this: Resource<M, Q, I>, query: Q, term: string, context: RequestContext) => Q | Promise<Q>

export type LabelMap<M, Q, I> = Record<string, LabelModifier<M, Q, I>>
export type LabelModifier<M, Q, I> = (this: Resource<M, Q, I>, query: Q, context: RequestContext) => Q | Promise<Q>
export type WildcardLabelModifier<M, Q, I> = (this: Resource<M, Q, I>, label: string, query: Q, context: RequestContext) => Q

export type SingletonMap<Q, M> = Record<string, Singleton<Q, M>>
export type Singleton<Q, M> = (query: Q, include: string[], context: RequestContext) => Promise<[M, any[]]>

export type SortMap<Q> = Record<string, SortModifier<Q>>
export type SortModifier<Q> = (query: Q, direction: 1 | -1, context: RequestContext) => Q

export type FilterMap<Q> = Record<string, FilterModifier<Q>>
export type FilterModifier<Q> = (query: Q, value: any, context: RequestContext) => Q | Promise<Q>

// ------
// Actions

export type AuthenticateHandler = (context: RequestContext) => void | Promise<void>
export type BeforeHandler = (context: RequestContext) => void | Promise<void>

export type ListAction<M, Q, I> = (
  this:    Resource<M, Q, I>,
  params:  ListParams,
  adapter: () => Adapter<M, Q, I>,
  context: RequestContext,
  options: ActionOptions
) => Pack<I> | Promise<Pack<I>>
export type GetAction<M, Q, I> = (
  this:    Resource<M, Q, I>,
  locator: DocumentLocator<I>,
  adapter: () => Adapter<M, Q, I>,
  context: RequestContext,
  options: ActionOptions
) => Pack<I> | Promise<Pack<I>>
export type CreateAction<M, Q, I> = (
  this:     Resource<M, Q, I>,
  document: Document<I>,
  pack:     Pack<I>,
  adapter:  () => Adapter<M, Q, I>,
  context:  RequestContext,
  options:  ActionOptions
) => Pack<I> | Promise<Pack<I>>
export type ReplaceAction<M, Q, I> = (
  this:     Resource<M, Q, I>,
  locator:  DocumentLocator<I>,
  document: Document<I>,
  meta:     Meta,
  adapter:  () => Adapter<M, Q, I>,
  context:  RequestContext,
  options:  ActionOptions
) => Pack<I> | Promise<Pack<I>>
export type UpdateAction<M, Q, I> = (
  this:     Resource<M, Q, I>,
  locator:  DocumentLocator<I>,
  document: Document<I>,
  meta:     Meta,
  adapter:  () => Adapter<M, Q, I>,
  context:  RequestContext,
  options:  ActionOptions
) => Pack<I> | Promise<Pack<I>>
export type DeleteAction<M, Q, I> = (
  this:     Resource<M, Q, I>,
  selector: BulkSelector<I>,
  adapter:  () => Adapter<M, Q, I>,
  context:  RequestContext
) => Pack<I> | Promise<Pack<I>>

export type ListRelatedAction<M, Q, I> = (
  this:         Resource<M, Q, I>,
  locator:      DocumentLocator<I>,
  relationship: string,
  params:       ListParams,
  adapter:      () => Adapter<M, Q, I>,
  context:      RequestContext,
  options:      ActionOptions
) => Pack<I> | Promise<Pack<I>>

export type GetRelatedAction<M, Q, I> = (
  this:         Resource<M, Q, I>,
  locator:      DocumentLocator<I>,
  relationship: string,
  adapter:      () => Adapter<M, Q, I>,
  context:      RequestContext,
  options:      ActionOptions
) => Pack<I> | Promise<Pack<I>>

// ------
// Custom actions

export interface CustomCollectionAction<M, Q, I> {
  name:         string
  method:       'get' | 'post' | 'put' | 'delete'
  deserialize?: boolean
  action:       (this: Resource<M, Q, I>, pack: Pack<I>, adapter: () => Adapter<M, Q, I>, context: RequestContext, options: ActionOptions) => Promise<Pack<I>>
}

export interface CustomDocumentAction<M, Q, I> {
  name:         string
  method:       'get' | 'post' | 'put' | 'delete'
  deserialize?: boolean
  action:       (this: Resource<M, Q, I>, locator: DocumentLocator<I>, pack: Pack<I>, adapter: () => Adapter<M, Q, I>, context: RequestContext, options: ActionOptions) => Promise<Pack<I>>
}

// ------
// Utility

export function mergeResourceConfig<M, Q, I>(config: ResourceConfig<M, Q, I>, defaults: Partial<ResourceConfig<M, Q, I>>): ResourceConfig<M, Q, I> {
  return {
    ...defaults,
    ...config,

    attributes: {
      ...defaults.attributes,
      ...config.attributes,
    },

    collectionActions: [
      ...defaults.collectionActions || [],
      ...config.collectionActions || [],
    ],

    documentActions: [
      ...defaults.documentActions || [],
      ...config.documentActions || [],
    ],
  }
}
