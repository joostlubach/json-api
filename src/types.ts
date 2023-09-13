import RequestContext from './RequestContext'
import Resource from './Resource'

export type AnyResource = Resource<any, any, any>

export type ResourceLocator = IDLocator | SingletonLocator

export const ResourceLocator: {
  fromRequestContext: (context: RequestContext) => ResourceLocator | null
} = {
  fromRequestContext: context => {
    if (typeof context.params.id === 'string') {
      return {id: context.params.id}
    } else if (typeof context.params.singleton === 'string') {
      return {singleton: context.params.singleton}
    } else {
      return null
    }
  }
}

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
export type RelatedQuery = any

export type Meta            = Record<string, any>
export type AttributeBag    = Record<string, any>

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
  assign?: (model: M, attributes: Record<string, any>, relationships: Record<string, any>) => void
}

export interface UpdateOptions<M> extends ActionOptions {
  assign?: (model: M, attributes: Record<string, any>, relationships: Record<string, any>) => void
}

export interface BulkSelector {
  ids?:         string[]
  filters?:     Record<string, any>
  search?:      string
}

export type ResourceID = string | number
export type Serialized = Record<string, any>