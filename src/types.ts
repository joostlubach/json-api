import { RelationshipConfig } from '../'
import Collection from './Collection'
import Document from './Document'
import Pack from './Pack'
import Resource from './Resource'

export type AnyResource = Resource<any, any>

export type ResourceLocator = IDLocator | SingletonLocator

export interface IDLocator {
  id: string
}

export interface SingletonLocator {
  singleton: string
}

export interface Filters {
  [path: string]: any
}

export interface Sort {
  field:     string
  direction: -1 | 1
}
export interface PaginationSpec {
  limit:  number | null
  offset: number
}

export type Constructor<T> = new (...args: any[]) => T
export type AnyObject      = Record<string, any>

export type RelatedQuery = any

export interface Adapter<Model, Query> {
  Model: Constructor<Model>

  query(): Query
  relatedQuery(parentResource: AnyResource, relationship: RelationshipConfig<any>, name: string, parentID: string): Promise<Query>

  applyFilters(query: Query, filters: Filters): Query | Promise<Query>
  applySearch(query: Query, search: string): Query | Promise<Query>
  applySorts(query: Query, sorts: Sort[]): Query | Promise<Query>

  count(query: Query): Promise<number>
  find(query: Query, pagination: PaginationSpec, options: Omit<ListOptions, 'pagination'>): Promise<Pack>
  get(query: Query, locator: ResourceLocator, options: ActionOptions): Promise<{pack: Pack, models: Model[]}>
  create(query: Query, document: Document, options: ActionOptions): Promise<{pack: Pack, model: Model}>
  update(query: Query, Document: Document, options: UpdateOptions<Model>): Promise<{pack: Pack, model: Model}>
  delete(query: Query, options: ActionOptions): Promise<Pack>

  loadModel(query: Query, id: any): Promise<Model>
  getRelated(query: Query, parentResource: AnyResource, relationship: RelationshipConfig<any>, name: string, parentID: string, options: ActionOptions): Promise<{pack: Pack, models: Model[]}>

  modelToDocument(model: Model, detail?: boolean): Document | Promise<Document>
  modelsToCollection(models: Model[], detail?: boolean): Collection | Promise<Collection>
}

export type Meta            = AnyObject
export type AttributeBag    = AnyObject

export type RelationshipBag = Record<string, Relationship>

export interface Relationship {
  data:   Linkage | Linkage[] | null
  links?: Links
  meta?:  Meta
}

export interface Linkage {
  type:  string
  id:    string
  meta?: Meta
}

export type Links = Record<string, string>

export interface JSONAPIError {
  id?:     string
  status?: number
  code?:   string | null
  title?:  string | null
  detail?: string | null

  source?: {
    pointer?: string
    parameter?: string
  }
}

export interface ActionOptions {
  label?:        string
  detail?:       boolean
  include?:      Include[]
  links?:        Links
  meta?:         Meta
  sendProgress?: (current: number, total: number) => any
}

export type Include = string

export interface ListOptions extends ActionOptions {
  filters?:    Filters
  search?:     string
  sorts?:      Sort[]
  pagination?: PaginationSpec
}

export interface CreateOptions<M> extends ActionOptions {
  assign?: (model: M, attributes: AnyObject, relationships: AnyObject) => void
}

export interface UpdateOptions<M> extends ActionOptions {
  assign?: (model: M, attributes: AnyObject, relationships: AnyObject) => void
}

export interface BulkSelector {
  ids?:         string[]
  filters?:     AnyObject
  search?:      string
}