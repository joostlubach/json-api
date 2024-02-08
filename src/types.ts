import { isPlainObject } from 'lodash'

import Resource from './Resource'

export type AnyResource = Resource<any, any, any>

export type DocumentLocator<I> = IDLocator<I> | SingletonLocator

export interface IDLocator<I> {
  id: I
}

export interface SingletonLocator {
  singleton: string
}

export const DocumentLocator: {
  isSingleton: <I>(locator: DocumentLocator<I>) => locator is SingletonLocator
} = {
  isSingleton(locator: DocumentLocator<any>): locator is SingletonLocator {
    return 'singleton' in locator
  },
}

export interface Filters {
  [path: string]: any
}

export interface Sort {
  field:     string
  direction: -1 | 1
}

export type Constructor<T> = new (...args: any[]) => T
export type RelatedQuery = any

export type Meta = Record<string, any>
export type AttributeBag = Record<string, any>

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

export const Linkage: {
  isLinkage: (arg: any) => arg is Linkage
} = {
  isLinkage: (arg: any): arg is Linkage => {
    if (!isPlainObject(arg)) { return false }
    if (!('type' in arg) || typeof arg.type !== 'string') { return false }
    if (!('id' in arg) || !['string', 'number'].includes(arg.id)) { return false }
    return true
  },
}

export type Links = Record<string, string>

export interface JSONAPIError {
  id?:     string
  status?: number
  code?:   string | null
  title?:  string | null
  detail?: string | null

  source?: {
    pointer?:   string
    parameter?: string
  }
}

// Reserved for future use.
export interface ActionOptions {}

export interface RetrievalActionOptions extends ActionOptions {
  include?: Include[]
  detail?:  boolean
}

export type Include = string

export interface ListParams {
  filters?: Filters
  label?:   string | null
  search?:  string | null
  sorts?:   Sort[]
  offset?:  number
  limit?:   number | null
}

export interface BulkSelector<I> {
  ids?:     I[]
  filters?: Record<string, any>
  search?:  string
}

export type ResourceID = string | number
export type Serialized = Record<string, any>
export type Primitive = string | number | boolean

export type ModelOf<R extends Resource<any, any, any>> = R extends Resource<infer M, any, any> ? M : never
export type QueryOf<R extends Resource<any, any, any>> = R extends Resource<any, infer Q, any> ? Q : never
export type IDOf<R extends Resource<any, any, any>> = R extends Resource<any, any, infer I> ? I : never
