import { isArray, isPlainObject } from 'lodash'
import { OpenAPIV3_1 } from 'openapi-types'
import { dynamicProxy } from 'yest'

import Adapter, { GetResponse, ListResponse, ReplaceResponse } from '../Adapter'
import JSONAPI, { JSONAPIOptions } from '../JSONAPI'
import Pack from '../Pack'
import RequestContext from '../RequestContext'
import Resource from '../Resource'
import {
  ActionOptions,
  ListActionOptions,
  ListParams,
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
    this.reset()
  }

  public adapter(resource: Resource<Model, Query, string>, context: RequestContext<Record<string, any>>): MockAdapter {
    return new MockAdapter(resource, context)
  }

  public nameForModel(model: Model): string {
    if (db('parents').ids().includes(model.id)) {
      return 'Parent'
    } else {
      return 'Child'
    }
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
  
  public reset() {
    this.registry.register('parents', {
      modelName: 'Parent',
      openapi:   openapi.parents,

      summary: "A parent in a family.",

      attributes: {
        name: {
          summary: "The first name of the parent.",
        },
        age: {
          summary: "The age of the parent in years.",
        },
      },
      relationships: {
        spouse: {
          type:    'parents',
          plural:  false,
          summary: "The spouse of this parent.",
        },
        children: {
          type:    'children',
          plural:  true,
          summary: "This parent's children.",
        },
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

}

export class MockAdapter implements Adapter<Model, Query, string> {

  constructor(
    private readonly resource: Resource<Model, Query, string>,
    private readonly context: RequestContext,
  ) {}

  public async list(query: Query, params: ListParams, options: ListActionOptions): Promise<ListResponse<Model>> {
    const models = db(this.resource.type).list(query)
    if (options.totals === false) { return {models} }

    const total = db(this.resource.type).count({...query, offset: 0, limit: null})
    return {models, total}
  }
  
  public async get(query: Query, id: string, options: RetrievalActionOptions): Promise<GetResponse<Model>> {
    return {
      model: db(this.resource.type).get(id, query),
    }
  }
  
  public async save(model: Model, _: Pack<string>, options: ActionOptions): Promise<ReplaceResponse<Model>> {
    const inserted = db(this.resource.type).insert(model)[0]
    return {model: inserted}
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

  public emptyModel(id: string | null): Model | Promise<Model> {
    return {id} as Model
  }

  public openAPISchemaForAttribute(attribute: string): OpenAPIV3_1.SchemaObject | Promise<OpenAPIV3_1.SchemaObject> {
    return {}
  }

  public isAttributeRequired(attribute: string): boolean | Promise<boolean> {
    return true
  }

}