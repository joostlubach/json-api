import { Request } from 'express'
import { isObject } from 'lodash'
import { wrapArray } from 'ytil'

import Adapter from './Adapter'
import Pack from './Pack'
import RequestContext from './RequestContext'
import Resource from './Resource'
import ResourceRegistry from './ResourceRegistry'
import { Middleware } from './middleware'
import { OpenAPIGenerator, OpenAPIOptions } from './openapi'
import {
  ActionOptions,
  CommonActions,
  DocumentLocator,
  JSONAPIRoutesMap as RouteMap,
  Linkage,
  ListParams,
  ModelsToCollectionOptions,
  ModelToDocumentOptions,
  RetrievalActionOptions,
} from './types'

/**
 * Facade base class. Derive from this class in your application to expose a JSON API.
 */
export default abstract class JSONAPI<Model, Query, ID> {

  // #region Constructor & properties

  constructor(
    public readonly options: JSONAPIOptions<Model, Query, ID> = {},
  ) {
    this.registry = new ResourceRegistry<Model, Query, ID>(
      this,
      options.middleware == null ? [] : wrapArray(options.middleware)
    )
    this.routes = {...defaultRoutes, ...this.options.router?.routes}
  }

  public readonly registry: ResourceRegistry<Model, Query, ID>

  // #endregion
  
  // #region Abstract interface
    
  public abstract adapter(resource: Resource<Model, Query, ID>, context: RequestContext): Adapter<Model, Query, ID>
  public abstract parseID(id: string | number): ID

  // #endregion

  // #region CRUD

  public async show(resourceType: string, locator: DocumentLocator<ID>, context: RequestContext, options: RetrievalActionOptions = {}) {
    const resource = this.registry.get(resourceType)
    const adapter = () => this.adapter(resource, context)

    await resource.runBeforeHandlers(context)
    return await resource.show(locator, adapter, context, options)
  }

  public async list(resourceType: string, params: ListParams, context: RequestContext, options: RetrievalActionOptions = {}) {
    const resource = this.registry.get(resourceType)
    const adapter = () => this.adapter(resource, context)

    await resource.runBeforeHandlers(context)
    return await resource.list(params, adapter, context, options)
  }

  public async create(resourceType: string, requestPack: Pack<ID>, context: RequestContext, options: ActionOptions = {}) {
    const resource = this.registry.get(resourceType)
    const adapter = () => this.adapter(resource, context)

    await resource.runBeforeHandlers(context)
    return await resource.create(requestPack, adapter, context, options)
  }

  public async replace(resourceType: string, id: ID, requestPack: Pack<ID>, context: RequestContext, options: ActionOptions = {}) {
    const resource = this.registry.get(resourceType)
    const adapter = () => this.adapter(resource, context)

    await resource.runBeforeHandlers(context)
    return await resource.replace(id,requestPack, adapter, context, options)
  }

  public async update(resourceType: string, id: ID, requestPack: Pack<ID>, context: RequestContext, options: ActionOptions = {}) {
    const resource = this.registry.get(resourceType)
    const adapter = () => this.adapter(resource, context)

    await resource.runBeforeHandlers(context)
    return await resource.update(id, requestPack, adapter, context, options)
  }

  public async delete(resourceType: string, requestPack: Pack<ID>, context: RequestContext) {
    const resource = this.registry.get(resourceType)
    const adapter = () => this.adapter(resource, context)

    await resource.runBeforeHandlers(context)
    return await resource.delete(requestPack, adapter, context)
  }

  // #endregion

  // #region Custom actions

  public async collectionAction(resourceType: string, action: string, requestPack: Pack<any>, context: RequestContext, options: ActionOptions = {}): Promise<Pack<any>> {
    const resource = this.registry.get(resourceType)
    const adapter = () => this.adapter(resource, context)

    await resource.runBeforeHandlers(context)
    return await resource.callCollectionAction(action, requestPack, adapter, context, options)
  }

  public async documentAction(resourceType: string, locator: DocumentLocator<ID>, action: string, requestPack: Pack<any>, context: RequestContext, options: ActionOptions = {}): Promise<Pack<any>> {
    const resource = this.registry.get(resourceType)
    const adapter = () => this.adapter(resource, context)

    await resource.runBeforeHandlers(context)
    return await resource.callDocumentAction(action, locator, requestPack, adapter, context, options)
  }

  // #endregion

  // #region Serialization

  public async modelsToCollection(resourceType: string, models: Model[], context: RequestContext, options: ModelsToCollectionOptions = {}) {
    const resource = this.registry.get(resourceType)
    const adapter = this.adapter(resource, context)

    return await resource.modelsToCollection(models, adapter, context, options)
  }

  public async modelToDocument(resourceType: string, model: Model, context: RequestContext, options: ModelToDocumentOptions = {}) {
    const resource = this.registry.get(resourceType)
    const adapter = this.adapter(resource, context)

    return await resource.modelToDocument(model, adapter, context, options)
  }

  public toLinkage<M, I>(arg: M | I | Linkage<I>, type: string): Linkage<I> {
    const linkage = Linkage.isLinkage(arg) ? (
      arg
    ) : isObject(arg) && 'id' in arg ? (
      {type, id: arg.id as any}
    ) : (
      {type, id: arg}
    )
  
    return linkage
  }

  // #endregion

  // #region Routes

  private readonly routes: RouteMap

  public route<M extends Model, Q extends Query, I extends ID>(action: CommonActions) {    
    return this.routes[action]
  }

  public customCollectionRoute(resource: Resource<any, any, any>, name: string) {
    if (this.options.router?.routes?.customCollection === false) { return false }
    return this.options.router?.routes?.customCollection?.(resource, name) ?? `/${resource.plural}/${name}`
  }

  public customDocumentRoute(resource: Resource<any, any, any>, name: string) {
    if (this.options.router?.routes?.customCollection === false) { return false }
    return this.options.router?.routes?.customCollection?.(resource, name) ?? `/${resource.plural}/${name}`
  }

  // #endregion

  // #region OpenAPI

  public async openAPISpec(context: RequestContext, options?: OpenAPIOptions) {
    const generator = new OpenAPIGenerator(this, context, {...this.options?.openAPI, ...options})
    return await generator.generate()
  }

  // #endregion

}

export interface JSONAPIOptions<M, Q, I> {
  middleware?: Middleware<M, Q, I>[]
  router?:     RouterOptions
  openAPI?:    OpenAPIOptions
}

export interface RouterOptions {
  routes?:             Partial<RouteMap>
  requestContext?:     (action: string, request: Request) => RequestContext | Promise<RequestContext>
  openAPI?:            OpenAPIGenerator
  enforceContentType?: boolean
}

// #region Defaults
  
const defaultRoutes: RouteMap = {
  list: {
    method: 'get',
    path:   resource => `/${resource.plural}/::label?`,
  },
  show: {
    method: 'get',
    path:   resource => `/${resource.plural}/:id`,
  },
  create: {
    method: 'post',
    path:   resource => `/${resource.plural}`,
  },
  update: {
    method: 'patch',
    path:   resource => `/${resource.plural}/:id`,
  },
  replace: {
    method: 'put',
    path:   resource => `/${resource.plural}/:id`,
  },
  delete: {
    method: 'delete',
    path:   resource => `/${resource.plural}`,
  },

  customCollection: name => `/{{plural}}/${name}`,
  customDocument:   name => `/{{plural}}/:id/${name}`,
}

// #endregion

