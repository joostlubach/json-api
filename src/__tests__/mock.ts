import { isArray, isPlainObject } from 'lodash'
import { dynamicProxy } from 'yest'

import Adapter from '../Adapter'
import Document from '../Document'
import JSONAPI, { JSONAPIOptions } from '../JSONAPI'
import Pack from '../Pack'
import RequestContext from '../RequestContext'
import Resource from '../Resource'
import {
  ActionOptions,
  ListActionOptions,
  ListParams,
  Meta,
  RetrievalActionOptions,
  Sort,
} from '../types'
import db, { Model, Query } from './db'
import * as openapi from './openapi'

export function mockJSONAPI(options?: JSONAPIOptions<Model, Query, string>) {
  return dynamicProxy(() => new MockJSONAPI(options))
}

export function context(action: string, params: Record<string, any> = {}) {
  return new RequestContext(action, params)
}

export class MockJSONAPI extends JSONAPI<Model, Query, string> {

  constructor(options: JSONAPIOptions<Model, Query, string> = {}) {
    super(options)

    this.registry.register('parents', {
      modelName: 'Parent',
      openapi:   openapi.parents,

      attributes: {
        name: true,
        age:  true,
      },
      relationships: {
        spouse:   {type: 'parents', plural: false},
        children: {type: 'children', plural: true},
      },
    })
    this.registry.register('children', {
      modelName: 'Child',
      openapi:   openapi.children,

      attributes: {
        name: true,
        age:  true,
      },
      relationships: {
        parents: {type: 'parents', plural: true},
      },
    })
  }

  public adapter(resource: Resource<Model, Query, string>, context: RequestContext<Record<string, any>>): MockAdapter {
    return new MockAdapter(resource, context)
  }

  public parseID(id: string) {
    return id
  }

  public nullPack() {
    return Pack.deserialize<Model, Query, string>(this.registry, {data: null})
  }

  public documentPack(type: string, id: string | null, attributes: Record<string, any>) {
    return Pack.deserialize<Model, Query, string>(this.registry, {
      data: {
        type,
        id,
        attributes,
      },
    }) 
  }
  
  public bulkSelectorPack(type: string, ids: string[]): Pack<string>
  public bulkSelectorPack(type: string, filters: Record<string, any>): Pack<string>
  public bulkSelectorPack(type: string, search: string): Pack<string>
  public bulkSelectorPack(type: string, arg: any): Pack<string> {
    if (isArray(arg)) {
      return Pack.deserialize<Model, Query, string>(this.registry, {
        data: arg.map(id => ({type, id})),
      })
    } else if (isPlainObject(arg)) {
      return Pack.deserialize<Model, Query, string>(this.registry, {
        meta: {filters: arg},
      })
    } else {
      return Pack.deserialize<Model, Query, string>(this.registry, {
        meta: {search: arg},
      })
    }
  }
  
}

export class MockAdapter implements Adapter<Model, Query, string> {

  constructor(
    private readonly resource: Resource<Model, Query, string>,
    private readonly context: RequestContext,
  ) {}

  public async list(query: Query, params: ListParams, options: ListActionOptions & {totals: false}): Promise<Model[]>
  public async list(query: Query, params: ListParams, options: ListActionOptions): Promise<Model[] | [Model[], number]> {
    const models = db(this.resource.type).list(query)
    if (options.totals === false) { return models }

    const total = db(this.resource.type).count({...query, offset: 0, limit: null})
    return [models, total]
  }
  
  public async get(query: Query, id: string, options: RetrievalActionOptions): Promise<Model | null> {
    return db(this.resource.type).get(id, query)
  }
  
  public async create(document: Document<string>, meta: Meta, options: ActionOptions): Promise<Model> {
    return db(this.resource.type).insert({...document.attributes})[0]
  }
  
  public async replace(model: Model, document: Document<string>, meta: Meta, options: ActionOptions): Promise<Model> {
    return db(this.resource.type).insert({...document.attributes, id: model.id})[0]
  }
  
  public async update(model: Model, document: Document<string>, meta: Meta, options: ActionOptions): Promise<Model> {
    return db(this.resource.type).insert({...model, ...document.attributes})[0]
  }
  
  public async delete(query: Query): Promise<Model[]> {
    return db(this.resource.type).delete(query)
  }
  
  public query(): Query {
    return {
      filters: {},
      sorts:   [],
      offset:  null,
      limit:   null,
    }
  }
  
  public clearFilters(query: Query): Query {
    return {
      ...query,
      filters: {},
    }
  }
  
  public applyFilter(query: Query, field: string, value: any): Query | Promise<Query> {
    return {
      ...query,
      filters: {
        ...query.filters,
        [field]: value,
      },
    }
  }
  
  public clearSorts(query: Query): Query {
    return {
      ...query,
      sorts: [],
    }
  }
  
  public applySort(query: Query, sort: Sort): Query | Promise<Query> {
    return {
      ...query,
      sorts: [
        ...query.sorts,
        sort,
      ],
    }
 
  }
  
  public applyOffset(query: Query, offset: number): Query | Promise<Query> {
    return {
      ...query,
      offset,
    }
  }
  
  public applyLimit(query: Query, limit: number): Query | Promise<Query> {
    return {
      ...query,
      limit,
    }
  }

}