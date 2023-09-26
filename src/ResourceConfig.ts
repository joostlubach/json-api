import { Request } from 'express'
import Adapter from './Adapter'
import Document from './Document'
import Pack from './Pack'
import RequestContext from './RequestContext'
import Resource from './Resource'
import {
  ActionOptions,
  AnyResource,
  BulkSelector,
  Linkage,
  ListParams,
  Meta,
  RelatedQuery,
  Relationship,
  ResourceID,
  ResourceLocator,
} from './types'

export type ResourceConfigMap = Record<string, ResourceConfig<any, any>>

export interface ResourceConfig<Model, Query> {

  //------
  // Naming

  /// The plural name of this resource type - by default the type itself.
  plural?: string

  /// The singular name of this resource type - by default a singularized version of the type itself.
  singular?: string

  //------
  // Overall

  /// The name of the model that backs this resource.
  modelName?: string

  /// If true, this resource won't be resolved as the default resource for the given model class.
  auxiliary?:  boolean

  /// Whether to include totals.
  totals?: boolean

  /// Whether the resource is read-only.
  readOnly?: boolean

  //------
  // Serialization

  /// The serialzable attributes for this resource.
  attributes?:    AttributeMap<Model, Query>

  /// Relationship configuration for this resource.
  relationships?: RelationshipMap<Model, Query> | RelationshipsBuilder<Model, Query>

  //------
  // Data retrieval

  /// A scope configuration.
  scope?:  ScopeFunction<Model, Query>

  /// Defaults for a new object.
  defaults?: DefaultsFunction<Model, Query>

  /// A search configuration.
  search?: SearchModifier<Model, Query>

  /// Label configuration.
  labels?: LabelMap<Model, Query>

  /// Singleton configuration.
  singletons?: SingletonMap<Query, Model>

  /// Sort configuration.
  sorts?: SortMap<Query>

  /// Filter configuration.
  filters?: FilterMap<Query>

  /// A wildcard label configuration.
  wildcardLabel?: WildcardLabelModifier<Model, Query>

  //------
  // Meta & links

  links?: LinkMap<Model, Query>
  meta?:  MetaMap<Model, Query>

  documentLinks?: DocumentLinkMap<Model, Query>
  documentMeta?:  DocumentMetaMap<Model, Query>

  //------
  // Pagination

  /// Whether a request without a 'page' parameter should still be paginated.
  forcePagination?: boolean

  /// The page size to use for this resource.
  pageSize?:        number

  //------
  // Controller actions

  /// A function called to authenticate the request. This handler is always called before other before handlers.
  authenticateRequest?: AuthenticateHandler

  /// A function called before any request for this resource is executed.
  before?: BeforeHandler[]

  /// A custom `list` action or `false` to disable this action.
  list?:   false | ListAction<Resource<Model, Query>, any>

  /// A custom `get` action or `false` to disable this action.
  get?:    false | GetAction<Resource<Model, Query>, any>

  /// A custom `create` action or `false` to disable this action.
  create?: false | CreateAction<Resource<Model, Query>, any>

  /// A custom `update` action or `false` to disable this action.
  update?: false | UpdateAction<Resource<Model, Query>, any>

  /// A custom `delete` action or `false` to disable this action.
  delete?: false | DeleteAction<Resource<Model, Query>, any>

  /// A custom `listRelated` action or `false` to disable this action.
  listRelated?:  false | ListRelatedAction<Resource<Model, Query>, any>

  /// A custom `getRelated` action or `false` to disable this action.
  getRelated?:   false | GetRelatedAction<Resource<Model, Query>, any>

  //------
  // Low level interface

  include?: (ids: ResourceID[]) => Promise<Model[]>

  //------
  // Custom

  collectionActions?: Array<CustomCollectionAction<AnyResource, any>>
  documentActions?:   Array<CustomDocumentAction<AnyResource, any>>

}

//------
// Attribute types

export type AttributeMap<M, Q> = Record<string, AttributeConfig<M, Q> | boolean>
export interface AttributeConfig<M, Q> {
  writable?:    boolean | AttributeIf<M, Q> | 'create'
  detail?:      boolean
  if?:          AttributeIf<M, Q>
  collect?:     AttributeCollector<M, Q>
  get?:         AttributeGetter<M, Q>
  set?:         AttributeSetter<M, Q>
  serialize?:   AttributeSerializer
  deserialize?: AttributeDeserializer
}

export type AttributeIf<M, Q>        = (this: Resource<M, Q>, item: M, context: RequestContext) => boolean | Promise<boolean>
export type AttributeCollector<M, Q> = (this: Resource<M, Q>, items: M[], context: RequestContext) => any | Promise<any>
export type AttributeGetter<M, Q>    = (this: Resource<M, Q>, item: M, raw: any, context: RequestContext) => any | Promise<any>
export type AttributeSetter<M, Q>    = (this: Resource<M, Q>, item: M, raw: any, context: RequestContext) => any | Promise<any>
export type AttributeSerializer      = (value: any) => any
export type AttributeDeserializer    = (raw: any) => any

//------
// Meta & link types

export type LinkMap<M, Q> = Record<string, LinkConfig<M, Q>>
export type DocumentLinkMap<M, Q> = Record<string, DocumentLinkConfig<M, Q>>

export interface LinkConfig<M, Q> {
  get: (this: Resource<M, Q>, context: RequestContext) => string | Promise<string>
}

export interface DocumentLinkConfig<M, Q> {
  get: (this: Resource<M, Q>, item: M, context: RequestContext) => string | Promise<string>
}

export type MetaMap<M, Q> = Record<string, MetaConfig<M, Q>>
export type DocumentMetaMap<M, Q> = Record<string, DocumentMetaConfig<M, Q>>

export interface MetaConfig<M, Q> {
  get: (this: Resource<M, Q>, context: RequestContext) => any | Promise<any>
}

export interface DocumentMetaConfig<M, Q> {
  get: (this: Resource<M, Q>, item: M, context: RequestContext) => any | Promise<any>
}

//------
// Relationship types

export type RelationshipMap<M, Q> = Record<string, RelationshipConfig<M, Q>>
export type RelationshipConfig<M, Q> = SingularRelationshipConfig<M, Q> | PluralRelationshipConfig<M, Q>
export type RelationshipsBuilder<M, Q> = (this: Resource<M, Q>, model: M) => Record<string, Relationship>

interface RelationshipConfigCommon<M, Q> {
  type?:     string
  writable?: boolean | 'create'
  detail?:   boolean
  if?:       (this: Resource<M, Q>, model: M, context: RequestContext) => boolean
  include?:  RelationshipIncludeConfig
}

export interface RelationshipIncludeConfig {
  always?: boolean
  detail?: boolean
}

export type SingularRelationshipConfig<M, Q> = RelationshipConfigCommon<M, Q> & {
  plural: false

  get?: (model: M, context: RequestContext) => Promise<string | Linkage | null>
  set?: (model: M, value: string | null, context: RequestContext) => any | Promise<any>
}

export type PluralRelationshipConfig<M, Q> = RelationshipConfigCommon<M, Q> & {
  plural: true

  get?: (model: M, context: RequestContext) => RelatedQuery | Promise<Array<string | Linkage>>
  set?: (model: M, value: string[], context: RequestContext) => any | Promise<any>
}

//------
// Scope & search

export type ScopeFunction<M, Q>    = (this: Resource<M, Q>, query: Q, context: RequestContext) => Q | Promise<Q>
export type DefaultsFunction<M, Q> = (this: Resource<M, Q>, context: RequestContext) => Record<string, any> | Promise<Record<string, any>>
export type ScopeOption<M, Q>      = (this: Resource<M, Q>, request: Request) => any
export type SearchModifier<M, Q>   = (this: Resource<M, Q>, query: Q, term: string, context: RequestContext) => Q | Promise<Q>

export type LabelMap<M, Q>              = Record<string, LabelModifier<M, Q>>
export type LabelModifier<M, Q>         = (this: Resource<M, Q>, query: Q, context: RequestContext) => Q | Promise<Q>
export type WildcardLabelModifier<M, Q> = (this: Resource<M, Q>, label: string, query: Q, context: RequestContext) => Q

export type SingletonMap<Q, M> = Record<string, Singleton<Q, M>>
export type Singleton<Q, M>    = (query: Q, include: string[], context: RequestContext) => Promise<[M, any[]]>

export type SortMap<Q>      = Record<string, SortModifier<Q>>
export type SortModifier<Q> = (query: Q, direction: 1 | -1, context: RequestContext) => Q

export type FilterMap<Q>      = Record<string, FilterModifier<Q>>
export type FilterModifier<Q> = (query: Q, value: any, context: RequestContext) => Q | Promise<Q>

//------
// Actions

export type AuthenticateHandler = (context: RequestContext) => void | Promise<void>
export type BeforeHandler       = (context: RequestContext) => void | Promise<void>

export type ListAction<R extends AnyResource, A extends Adapter>  = (
  this:    R,
  params:  ListParams,
  adapter: A,
  context: RequestContext,
  options: ActionOptions
) => Pack | Promise<Pack>
export type GetAction<R extends AnyResource, A extends Adapter>   = (
  this:    R,
  locator: ResourceLocator,
  adapter: A,
  context: RequestContext,
  options: ActionOptions
) => Pack | Promise<Pack>
export type CreateAction<R extends AnyResource, A extends Adapter> = (
  this:     R,
  document: Document,
  pack:     Pack,
  adapter:  A,
  context:  RequestContext,
  options:  ActionOptions
) => Pack | Promise<Pack>
export type UpdateAction<R extends AnyResource, A extends Adapter> = (
  this:     R,
  document: Document,
  meta:     Meta,
  adapter:  A,
  context:  RequestContext,
  options:  ActionOptions
) => Pack | Promise<Pack>
export type DeleteAction<R extends AnyResource, A extends Adapter> = (
  this:     R,
  selector: BulkSelector,
  adapter:  A,
  context:  RequestContext
) => Pack | Promise<Pack>

export type ListRelatedAction<R extends AnyResource, A extends Adapter> = (
  this:         R,
  locator:      ResourceLocator,
  relationship: string,
  params:       ListParams,
  adapter:      A,
  context:      RequestContext,
  options:      ActionOptions
) => Pack | Promise<Pack>

export type GetRelatedAction<R extends AnyResource, A extends Adapter> = (
  this:         R,
  locator:      ResourceLocator,
  relationship: string,
  adapter:      A,
  context:      RequestContext,
  options:      ActionOptions
) => Pack | Promise<Pack>

//------
// Custom actions

export interface CustomCollectionAction<R extends AnyResource, A extends Adapter> {
  name:          string
  method:        'get' | 'post' | 'put' | 'delete'
  endpoint?:     string
  authenticate?: boolean
  deserialize?:  boolean
  action:        (this: R, pack: Pack, adapter: A, context: RequestContext, options: ActionOptions) => Promise<Pack>
}

export interface CustomDocumentAction<R extends AnyResource, A extends Adapter> {
  name:          string
  method:        'get' | 'post' | 'put' | 'delete'
  endpoint?:     string
  authenticate?: boolean
  deserialize?:  boolean
  action:        (this: R, pack: Pack, adapter: A, context: RequestContext, options: ActionOptions) => Promise<Pack>
}

export type ModelOf<Cfg extends ResourceConfig<any, any>> = Cfg extends ResourceConfig<infer M, any> ? M : never
export type QueryOf<Cfg extends ResourceConfig<any, any>> = Cfg extends ResourceConfig<any, infer Q> ? Q : never
export type AttributesOf<Cfg extends ResourceConfig<any, any>> = Cfg['attributes'] extends Record<string, boolean | infer A> ? A : never

//------
// Utility

export function mergeResourceConfig<M, Q>(config: ResourceConfig<any, any>, defaults: Partial<ResourceConfig<M, Q>>): ResourceConfig<M, Q> {
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