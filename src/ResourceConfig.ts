import { Request } from 'express'
import { Relationship } from 'json-api'
import { ID } from 'mongoid'
import { Document, Pack, RequestContext, Resource, ResourceRegistry } from './'
import {
  ActionOptions,
  Adapter,
  AnyResource,
  BulkSelector,
  Linkage,
  ListOptions,
  RelatedQuery,
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

  /// A function that creates an adapter for this resource.
  adapter?: (this: Resource<Model, Query>, registry: ResourceRegistry, context: RequestContext) => Adapter<Model, Query>

  /// Whether to include totals.
  totals?: boolean

  /// Whether the resource is read-only.
  readOnly?: boolean

  //------
  // Serialization

  /// The serialzable attributes for this resource.
  attributes?:    AttributeMap<Model>

  /// Relationship configuration for this resource.
  relationships?: RelationshipMap<Model> | RelationshipsBuilder<Model>

  //------
  // Data retrieval

  /// A scope configuration.
  scope?:  ScopeFunction<Query>

  /// Defaults for a new object.
  defaults?: DefaultsFunction

  /// A search configuration.
  search?: SearchConfig<Query>

  /// Label configuration.
  labels?: LabelMap<Query>

  /// Singleton configuration.
  singletons?: SingletonMap<Query, Model>

  /// Sort configuration.
  sorts?: SortMap<Query>

  /// Filter configuration.
  filters?: FilterMap<Query>

  /// A wildcard label configuration.
  wildcardLabel?: WildcardLabelModifier<Query>

  //------
  // Meta & links

  links?: LinkMap
  meta?:  MetaMap

  documentLinks?: DocumentLinkMap<Model>
  documentMeta?:  DocumentMetaMap<Model>

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
  before?: BeforeHandler

  /// A function called after any request for this resource is executed.
  after?:  AfterHandler

  /// A custom `list` action or `false` to disable this action.
  list?:   false | ListAction<AnyResource>

  /// A custom `show` action or `false` to disable this action.
  show?:   false | ShowAction<AnyResource>

  /// A custom `create` action or `false` to disable this action.
  create?: false | CreateAction<AnyResource>

  /// A custom `update` action or `false` to disable this action.
  update?: false | UpdateAction<AnyResource>

  /// A custom `delete` action or `false` to disable this action.
  delete?: false | DeleteAction<AnyResource>

  /// A custom `listRelated` action or `false` to disable this action.
  listRelated?:  false | IndexRelatedAction

  /// A custom `showRelated` action or `false` to disable this action.
  showRelated?:   false | ShowRelatedAction

  //------
  // Low level interface

  include?: (ids: ID[]) => Promise<Model[]>

  //------
  // Custom

  collectionActions?: Array<CustomCollectionAction<AnyResource>>
  documentActions?:   Array<CustomDocumentAction<AnyResource>>

  //------
  // Extensions

  /**
   * Libraries built on top of json-api may extend the configuration with arbitrary additional keys.
   */
  [extkey: string | symbol]: any

}

//------
// Attribute types

export type AttributeMap<M> = Record<string, AttributeConfig<M> | boolean>
export interface AttributeConfig<M> {
  writable?:    boolean | AttributeIf<M> | 'create'
  detail?:      boolean
  if?:          AttributeIf<M>
  collect?:     AttributeCollector<M>
  get?:         AttributeGetter<M>
  set?:         AttributeSetter<M>
  serialize?:   AttributeSerializer
  deserialize?: AttributeDeserializer
}

export type AttributeIf<M>        = (this: Resource<M, any>, item: M, context: RequestContext) => boolean | Promise<boolean>
export type AttributeCollector<M> = (this: Resource<M, any>, items: M[], context: RequestContext) => any | Promise<any>
export type AttributeGetter<M>    = (this: Resource<M, any>, item: M, raw: any, context: RequestContext) => any | Promise<any>
export type AttributeSetter<M>    = (this: Resource<M, any>, item: M, raw: any, context: RequestContext) => any | Promise<any>
export type AttributeSerializer   = (value: any) => any
export type AttributeDeserializer = (raw: any) => any

//------
// Meta & link types

export type LinkMap = Record<string, LinkConfig>
export type DocumentLinkMap<M> = Record<string, DocumentLinkConfig<M>>

export interface LinkConfig {
  get: (context: RequestContext) => string | Promise<string>
}

export interface DocumentLinkConfig<M> {
  get: (item: M, context: RequestContext) => string | Promise<string>
}

export type MetaMap = Record<string, MetaConfig>
export type DocumentMetaMap<M> = Record<string, DocumentMetaConfig<M>>

export interface MetaConfig {
  get: (context: RequestContext) => any | Promise<any>
}

export interface DocumentMetaConfig<M> {
  get: (item: M, context: RequestContext) => any | Promise<any>
}

//------
// Relationship types

export type RelationshipMap<M> = Record<string, RelationshipConfig<M>>
export type RelationshipConfig<M> = SingularRelationshipConfig<M> | PluralRelationshipConfig<M>
export type RelationshipsBuilder<M> = (model: M) => Record<string, Relationship>

interface RelationshipConfigCommon<M> {
  type?:     string
  writable?: boolean | 'create'
  detail?:   boolean
  if?:       (this: Resource<M, any>, model: M, context: RequestContext) => boolean
  include?:  RelationshipIncludeConfig
}

export interface RelationshipIncludeConfig {
  always?: boolean
  detail?: boolean
}

export type SingularRelationshipConfig<M> = RelationshipConfigCommon<M> & {
  plural: false

  get?: (model: M, context: RequestContext) => Promise<string | Linkage | null>
  set?: (model: M, value: string | null, context: RequestContext) => any | Promise<any>
}

export type PluralRelationshipConfig<M> = RelationshipConfigCommon<M> & {
  plural: true

  get?: (model: M, context: RequestContext) => RelatedQuery | Promise<Array<string | Linkage>>
  set?: (model: M, value: string[], context: RequestContext) => any | Promise<any>
}

//------
// Scope & search

export type ScopeFunction<Q> = (query: Q, context: RequestContext) => Q | Promise<Q>
export type DefaultsFunction = (context: RequestContext) => Record<string, any> | Promise<Record<string, any>>
export type ScopeOption      = (request: Request) => any
export type SearchConfig<Q>  = (query: Q, term: string) => Q

export type LabelMap<Q>              = Record<string, LabelModifier<Q>>
export type LabelModifier<Q>         = (query: Q, context: RequestContext) => Q | Promise<Q>
export type WildcardLabelModifier<Q> = (label: string, query: Q, context: RequestContext) => Q

export type SingletonMap<Q, M> = Record<string, Singleton<Q, M>>
export type Singleton<Q, M>  = (query: Q, context: RequestContext) => Promise<M> | null

export type SortMap<Q>      = Record<string, SortModifier<Q>>
export type SortModifier<Q> = (query: Q, direction: 1 | -1, context: RequestContext) => Q

export type FilterMap<Q>      = Record<string, FilterModifier<Q>>
export type FilterModifier<Q> = (query: Q, value: any, context: RequestContext) => Q | Promise<Q>

//------
// Actions

export type AuthenticateHandler = (request: Request, context: RequestContext) => void | Promise<void>
export type BeforeHandler       = (context: RequestContext) => void | Promise<void>
export type AfterHandler        = (responsePack: Pack, context: RequestContext) => void | Promise<void>

export type ListAction<R extends AnyResource>  = (
  this: R,
  context: RequestContext,
  options: ListOptions
) => Pack | Promise<Pack>
export type ShowAction<R extends AnyResource>   = (
  this: R,
  context: RequestContext,
  locator: ResourceLocator,
  options: ActionOptions
) => Pack | Promise<Pack>
export type CreateAction<R extends AnyResource> = (
  this: R,
  context: RequestContext,
  document: Document,
  pack: Pack,
  options: ActionOptions
) => Pack | Promise<Pack>
export type UpdateAction<R extends AnyResource> = (
  this: R,
  context: RequestContext,
  document: Document,
  pack: Pack,
  options: ActionOptions
) => Pack | Promise<Pack>
export type DeleteAction<R extends AnyResource> = (
  this: R,
  context: RequestContext,
  selector: BulkSelector,
  options:  ActionOptions
) => Pack | Promise<Pack>

export type IndexRelatedAction = (
  context:          RequestContext,
  relationshipName: string,
  parentID:         string,
  options:          ListOptions
) => Pack | Promise<Pack>

export type ShowRelatedAction  = (
  context:          RequestContext,
  relationshipName: string,
  parentID:         string,
  options:          ActionOptions
) => Pack | Promise<Pack>

//------
// Custom actions

export interface CustomCollectionAction<R extends AnyResource> {
  name:          string
  method:        'get' | 'post' | 'put' | 'delete'
  endpoint?:     string
  authenticate?: boolean
  deserialize?:  boolean
  action:        (this: R, pack: Pack, context: RequestContext, options: ActionOptions) => Promise<Pack>
}

export interface CustomDocumentAction<R extends AnyResource> {
  name:          string
  method:        'get' | 'post' | 'put' | 'delete'
  endpoint?:     string
  authenticate?: boolean
  deserialize?:  boolean
  action:        (this: R, id: string, pack: Pack, context: RequestContext, options: ActionOptions) => Promise<Pack>
}

export type CustomMetaFunction = (this: AnyResource, pack: Pack, context: RequestContext) => any

export type ModelOf<Cfg extends ResourceConfig<any, any>> = Cfg extends ResourceConfig<infer M, any> ? M : never
export type QueryOf<Cfg extends ResourceConfig<any, any>> = Cfg extends ResourceConfig<any, infer Q> ? Q : never
export type AttributeOf<Cfg extends ResourceConfig<any, any>> = Cfg['attributes'] extends Record<string, boolean | infer A> ? A : never

//------
// Utility

export function mergeResourceConfig<M, Q>(config: ResourceConfig<M, Q>, defaults: ResourceConfig<any, any>): ResourceConfig<M, Q> {
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