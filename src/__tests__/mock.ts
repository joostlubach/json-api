import RequestContext from 'RequestContext'
import Resource from 'Resource'
import { dynamicProxy } from 'yest'

import APIError from '../APIError'
import Adapter from '../Adapter'
import Document from '../Document'
import JSONAPI, { JSONAPIOptions } from '../JSONAPI'
import {
  ActionOptions,
  DocumentLocator,
  ListActionOptions,
  ListParams,
  Meta,
  RetrievalActionOptions,
  Sort,
} from '../types'
import db, { Model, Query } from './db'

export function mockJSONAPI(options?: JSONAPIOptions<Model, Query, string>) {
  return dynamicProxy(() => new MockJSONAPI(options))
}

export class MockJSONAPI extends JSONAPI<Model, Query, string> {

  constructor(options: JSONAPIOptions<Model, Query, string> = {}) {
    super(options)

    this.registry.register('parents', {
      modelName:  'Parent',
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
      modelName:  'Child',
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
  
  public async get(query: Query, locator: DocumentLocator<string>, options: RetrievalActionOptions): Promise<Model> {
    const model = await this.loadModel(query, locator, options.include, this.context)
    return model
  }
  
  public async create(query: Query, document: Document<string>, meta: Meta, options: ActionOptions): Promise<Model> {
    return db(this.resource.type).insert({...query.filters, ...document.attributes})[0]
  }
  
  public async replace(query: Query, locator: DocumentLocator<string>, document: Document<string>, meta: Meta, options: ActionOptions): Promise<Model> {
    const model = await this.loadModel(query, locator, [], this.context)
    return db(this.resource.type).insert(query, {...document.attributes, id: model.id})[0]
  }
  
  public async update(query: Query, locator: DocumentLocator<string>, document: Document<string>, meta: Meta, options: ActionOptions): Promise<Model> {
    const model = await this.loadModel(query, locator, [], this.context)
    return db(this.resource.type).insert({...model, ...document.attributes})[0]
  }
  
  public async delete(query: Query): Promise<Model[]> {
    return db(this.resource.type).delete(query)
  }
  
  public async listRelated(locator: DocumentLocator<string>, relationship: string, query: Query, params: ListParams, options: RetrievalActionOptions): Promise<Model[]> {
    throw new Error('Method not implemented.')
  }
  
  public async showRelated(locator: DocumentLocator<string>, relationship: string, query: Query, options: RetrievalActionOptions): Promise<Model> {
    throw new Error('Method not implemented.')
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

  private async loadModel(query: Query, locator: DocumentLocator<string>, include: string[] | undefined, context: RequestContext): Promise<Model> {
    const [model] = DocumentLocator.isSingleton(locator)
      ? await this.resource.loadSingleton(locator.singleton, query, include ?? [], this.context)
      : [db(this.resource.type).get(locator.id, query)]

    if (model == null) {
      throw new APIError(404, `Model with "${JSON.stringify(locator)}" not found`)
    }

    return model
  }

}