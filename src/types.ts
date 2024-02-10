import { isArray, isPlainObject } from 'lodash'
import { objectKeys, objectValues } from 'ytil'

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

export type Links = Record<string, string>
export type Meta = Record<string, any>

export interface Relationship<ID> {
  data:   Linkage<ID> | Linkage<ID>[] | null
  links?: Links
  meta?:  Meta
}

export const Relationship: {
  isRelationship: <I>(arg: any) => arg is Relationship<I>
} = {
  isRelationship: (arg: any): arg is Relationship<any> => {
    if (!isPlainObject(arg)) { return false }

    const {data, links, meta, ...rest} = arg
    if (objectKeys(rest).length > 0) { return false }

    if (links != null && (!isPlainObject(links) || !objectValues(links).every(it => typeof it === 'string'))) { return false }
    if (meta != null && !isPlainObject(meta)) { return false }

    if (data == null) { return true }
    if (isArray(data)) { return data.every(Linkage.isLinkage) }
    return Linkage.isLinkage(data)
  },
}

export interface Linkage<ID> {
  type:  string
  id:    ID
  meta?: Meta
}

export const Linkage: {
  isLinkage: <I>(arg: any) => arg is Linkage<I>
} = {
  isLinkage: (arg: any): arg is Linkage<any> => {
    if (!isPlainObject(arg)) { return false }
    if (!('type' in arg) || typeof arg.type !== 'string') { return false }
    if (!('id' in arg)) { return false }
    return true
  },
}


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

export interface ListActionOptions extends RetrievalActionOptions {
  totals?: boolean
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

export interface ModelToDocumentOptions {
  detail?: boolean
}

export interface ModelsToCollectionOptions {
  detail?: boolean
}
