import { isArray, isPlainObject } from 'lodash'
import { OpenAPIV3_1 } from 'openapi-types'
import { dynamicProxy } from 'yest'

import Adapter, {
  CreateResponse,
  GetResponse,
  ListResponse,
  ReplaceResponse,
  UpdateResponse,
} from '../Adapter'
import JSONAPI, { JSONAPIOptions } from '../JSONAPI'
import Pack from '../Pack'
import RequestContext from '../RequestContext'
import Resource from '../Resource'
import { AttributeConfig, RelationshipConfig } from '../ResourceConfig'
import {
  ListActionOptions,
  ListParams,
  Relationship,
  RelationshipDataLike,
  RetrievalActionOptions,
  Sort,
} from '../types'
import db, { Entity, Query } from './db'

export function mockJSONAPI(options?: JSONAPIOptions<Entity, Query, string>) {
  return dynamicProxy(() => new MockJSONAPI(options))
}

export function context(action: string, params: Record<string, any> = {}) {
  return new RequestContext(action, params, null)
}

export class MockJSONAPI extends JSONAPI<Entity, Query, string> {

  constructor(options: JSONAPIOptions<Entity, Query, string> = {}) {
    super(options)
    this.reset()
  }

  public adapter(resource: Resource<Entity, Query, string>, context: RequestContext<Record<string, any>>): MockAdapter {
    return new MockAdapter(resource, context)
  }

  public nameForModel(entity: Entity): string {
    if (db('parents').ids().includes(entity.id)) {
      return 'Parent'
    } else {
      return 'Child'
    }
  }

  public parseID(id: string) {
    return id
  }

  public nullPack() {
    return Pack.deserialize<Entity, Query, string>(this.registry, {data: null})
  }

  public documentRequestPack(type: string, id: string | null, attributes: Record<string, any>) {
    return Pack.deserialize<Entity, Query, string>(this.registry, {
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
      return Pack.deserialize<Entity, Query, string>(this.registry, {
        data: arg.map(id => ({type, id})),
      })
    } else if (isPlainObject(arg)) {
      return Pack.deserialize<Entity, Query, string>(this.registry, {
        meta: {filters: arg},
      })
    } else {
      return Pack.deserialize<Entity, Query, string>(this.registry, {
        meta: {search: arg},
      })
    }
  }
  
  public reset() {
    this.registry.register('parents', {
      entity: 'Parent',

      labels: {
        'family-a': query => ({...query, filters: {...query.filters, family: 'a'}}),
        'family-b': query => ({...query, filters: {...query.filters, family: 'b'}}),
      },

      collectionActions: {
        'test-1': {
          handler: async () => new Pack<string>(null),
        },
        'test-2': {
          handler: async () => new Pack<string>(null),
          router:  {
            method: 'post',
          },
        },
      },

      documentActions: {
        'test-1': {
          handler: async () => new Pack<string>(null),
        },
        'test-2': {
          handler: async () => new Pack<string>(null),
          router:  {
            method: 'post',
          },
        },
      },

      attributes: {
        name: true,
        age:  true,
      },
      relationships: {
        spouse: {
          type:   'parents',
          plural: false,
        },

        children: {
          type:   'children',
          plural: true,
        },
      },
    })
    this.registry.register('children', {
      entity: 'Child',

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

export class MockAdapter implements Adapter<Entity, Query, string> {

  constructor(
    private readonly resource: Resource<Entity, Query, string>,
    private readonly context: RequestContext,
  ) {}

  public async list(query: Query, params: ListParams, options: ListActionOptions): Promise<ListResponse<Entity>> {
    const models = db(this.resource.type).list(query)
    if (options.totals === false) { return {data: models} }

    const total = db(this.resource.type).count({...query, offset: 0, limit: null})
    return {data: models, total}
  }
  
  public async get(query: Query, id: string, options: RetrievalActionOptions): Promise<GetResponse<Entity>> {
    return {
      data: db(this.resource.type).get(id, query),
    }
  }

  public async create(cb: (entity: Entity) => Promise<void>): Promise<CreateResponse<Entity>> {
    const entity = db(this.resource.type).build()
    await cb(entity)
    return {data: entity}
  }

  public async update(id: string, cb: (entity: Entity) => Promise<void>): Promise<UpdateResponse<Entity>> {
    const entity = db(this.resource.type).get(id)
    if (!entity) {
      throw new Error(`Entity with id ${id} not found`)
    }
    await cb(entity)
    return {data: entity}
  }

  public async replace(id: string, cb: (entity: Entity) => Promise<void>): Promise<ReplaceResponse<Entity>> {
    const entity = db(this.resource.type).get(id)
    if (!entity) {
      throw new Error(`Entity with id ${id} not found`)
    }
    await cb(entity)
    return {data: entity}
  }
  
  public async delete(query: Query): Promise<Entity[]> {
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
  
  public applyPagination(query: Query, limit: number, offset?: number): Query | Promise<Query> {
    return {
      ...query,
      limit,
      offset: offset ?? null,
    }
  }

  public getAttribute(data: Entity, name: string, attribute: AttributeConfig<Entity, Query, string>) {
    return (data as any)[name]
  }

  public setAttribute(data: Entity, name: string, value: any, attribute: AttributeConfig<Entity, Query, string>): void | Promise<void> {
    Object.assign(data, {[name]: value})
  }

  public getRelationship(
    data: Entity,
    name: string,
    relationship: RelationshipConfig<Entity, Query, string>,
  ): Relationship<string> | RelationshipDataLike<string> | Promise<Relationship<string> | RelationshipDataLike<string>> {
    return (data as any)[name]
  }

  public attributeExists(name: string): boolean | Promise<boolean> {
    return true
  }

  public emptyModel(id: string | null): Entity | Promise<Entity> {
    return {id} as Entity
  }
  
  public openAPISchemaForAttribute(attribute: string): OpenAPIV3_1.SchemaObject | Promise<OpenAPIV3_1.SchemaObject> {
    return {}
  }

  public attributeRequired(attribute: string): boolean | Promise<boolean> {
    return true
  }

}
