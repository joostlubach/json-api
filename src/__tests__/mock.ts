import RequestContext from 'RequestContext'
import Resource from 'Resource'
import { isArray } from 'lodash'

import Adapter, { ModelsToCollectionOptions, ModelToDocumentOptions } from '../Adapter'
import Collection from '../Collection'
import Document from '../Document'
import JSONAPI from '../JSONAPI'
import Pack from '../Pack'
import {
  ActionOptions,
  DocumentLocator,
  ListParams,
  Meta,
  RetrievalActionOptions,
  Sort,
} from '../types'
import db, { Model, Query } from './db'

export class MockJSONAPI extends JSONAPI<Model, Query, number> {

  public adapter(resource: Resource<Model, Query, number>, context: RequestContext<Record<string, any>>): MockAdapter {
    return new MockAdapter(resource, context)
  }

  public parseID(id: string) {
    return parseInt(id, 0)
  }

}

export class MockAdapter implements Adapter<Model, Query, number> {

  constructor(
    private readonly resource: Resource<Model, Query, number>,
    private readonly context: RequestContext,
  ) {}

  public async list(query: Query, params: ListParams, options: RetrievalActionOptions): Promise<Pack<number>> {
    return await this.pack(db(this.resource.type).list(query))
  }
  
  public async get(query: Query, locator: DocumentLocator<number>, options: RetrievalActionOptions): Promise<Pack<number>> {
    const model = await this.loadModel(query, locator, options.include, this.context)
    return await this.pack(model)
  }
  
  public async create(query: Query, document: Document<number>, meta: Meta, options: ActionOptions): Promise<Pack<number>> {
    return await this.pack(db(this.resource.type).insert({...query.filters, ...document.attributes}))
  }
  
  public async replace(query: Query, locator: DocumentLocator<number>, document: Document<number>, meta: Meta, options: ActionOptions): Promise<Pack<number>> {
    const model = await this.loadModel(query, locator, [], this.context)
    return await this.pack(db(this.resource.type).insert(query, {...document.attributes, id: model.id}))
  }
  
  public async update(query: Query, locator: DocumentLocator<number>, document: Document<number>, meta: Meta, options: ActionOptions): Promise<Pack<number>> {
    const model = await this.loadModel(query, locator, [], this.context)
    return await this.pack(db(this.resource.type).insert(query, {...model, ...document.attributes}))
  }
  
  public async delete(query: Query): Promise<Pack<number>> {
    return await this.pack(db(this.resource.type).delete(query))
  }
  
  public async listRelated(locator: DocumentLocator<number>, relationship: string, query: Query, params: ListParams, options: RetrievalActionOptions): Promise<Pack<number>> {
    throw new Error('Method not implemented.')
  }
  
  public async showRelated(locator: DocumentLocator<number>, relationship: string, query: Query, options: RetrievalActionOptions): Promise<Pack<number>> {
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

  private async loadModel(query: Query, locator: DocumentLocator<number>, include: string[] | undefined, context: RequestContext): Promise<Model> {
    const [model] = DocumentLocator.isSingleton(locator)
      ? await this.resource.loadSingleton(locator.singleton, query, include ?? [], this.context)
      : [db(this.resource.type).get(query, locator.id)]

    return model
  }

  public async modelToDocument(model: Model, options?: ModelToDocumentOptions | undefined): Promise<Document<number>> {
    return new Document(this.resource, model.id, options?.detail ?? true, model)
  }
  public async modelsToCollection(models: Model[], options?: ModelsToCollectionOptions | undefined): Promise<Collection<number>> {
    const documents = await Promise.all(models.map(it => this.modelToDocument(it, {detail: options?.detail ?? false})))
    return new Collection(documents)
  }

  private async pack(docOrColl: Model | Model[]) {
    const data = isArray(docOrColl)
      ? await this.modelsToCollection(docOrColl)
      : await this.modelToDocument(docOrColl)
    return new Pack<number>(data)
  }

}