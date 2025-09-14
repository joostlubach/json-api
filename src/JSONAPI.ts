import { isObject } from 'lodash'
import { wrapArray } from 'ytil'

import Adapter from './Adapter'
import Collection from './Collection'
import IncludeCollector from './IncludeCollector'
import Pack from './Pack'
import RequestContext from './RequestContext'
import Resource from './Resource'
import ResourceRegistry, { ResourceRegistryOptions } from './ResourceRegistry'
import config from './config'
import { Middleware } from './middleware'
import { OpenAPIGenerator } from './openapi'
import { createExpressRouter, defaultRoutes } from './router'
import {
  ActionOptions,
  CommonActions,
  DocumentLocator,
  Linkage,
  ListParams,
  ModelsToCollectionOptions,
  ModelToDocumentOptions,
  OpenAPIGeneratorOptions,
  RetrievalActionOptions,
  RouteMap,
  RouterOptions,
} from './types'

/**
 * Facade base class. Derive from this class in your application to expose a JSON API.
 */
export default abstract class JSONAPI<Entity, Query, ID> {

  // #region Constructor & properties

  constructor(
    public readonly options: JSONAPIOptions<Entity, Query, ID> = {},
  ) {
    this.registry = new ResourceRegistry<Entity, Query, ID>(
      this,
      options.middleware == null ? [] : wrapArray(options.middleware),
    )
    this._routes = {...defaultRoutes, ...this.options.router?.routes}
  }

  public readonly registry: ResourceRegistry<Entity, Query, ID>

  public validateResources(context: RequestContext) {
    for (const resource of this.registry.all()) {
      const adapter = this.adapter(resource, context)
      resource.validate(adapter)
    }
  }

  public resourceForModel(entity: Entity): Resource<Entity, Query, ID> {
    return this.registry.resourceForEntity(this.nameForModel(entity))
  }

  // #endregion
  
  // #region Abstract interface
    
  public abstract adapter(resource: Resource<Entity, Query, ID>, context: RequestContext): Adapter<Entity, Query, ID> | undefined
  public abstract nameForModel(entity: Entity): string
  public abstract parseID(id: string | number): ID

  // #endregion

  // #region CRUD

  public async show(resourceType: string, locator: DocumentLocator<ID>, context: RequestContext, options: RetrievalActionOptions = {}) {
    const resource = this.registry.get(resourceType)
    const adapter = () => resource.adapter(context)

    await resource.runBeforeHandlers(context)
    return await resource.show(locator, adapter, context, options)
  }

  public async list(resourceType: string, params: ListParams, context: RequestContext, options: RetrievalActionOptions = {}) {
    const resource = this.registry.get(resourceType)
    const adapter = () => resource.adapter(context)

    await resource.runBeforeHandlers(context)
    return await resource.list(params, adapter, context, options)
  }

  public async create(resourceType: string, requestPack: Pack<ID>, context: RequestContext, options: ActionOptions = {}) {
    const resource = this.registry.get(resourceType)
    const adapter = () => resource.adapter(context)

    await resource.runBeforeHandlers(context)
    return await resource.create(requestPack, adapter, context, options)
  }

  public async replace(resourceType: string, id: ID, requestPack: Pack<ID>, context: RequestContext, options: ActionOptions = {}) {
    const resource = this.registry.get(resourceType)
    const adapter = () => resource.adapter(context)

    await resource.runBeforeHandlers(context)
    return await resource.replace(id,requestPack, adapter, context, options)
  }

  public async update(resourceType: string, id: ID, requestPack: Pack<ID>, context: RequestContext, options: ActionOptions = {}) {
    const resource = this.registry.get(resourceType)
    const adapter = () => resource.adapter(context)

    await resource.runBeforeHandlers(context)
    return await resource.update(id, requestPack, adapter, context, options)
  }

  public async delete(resourceType: string, requestPack: Pack<ID>, context: RequestContext) {
    const resource = this.registry.get(resourceType)
    const adapter = () => resource.adapter(context)

    await resource.runBeforeHandlers(context)
    return await resource.delete(requestPack, adapter, context)
  }

  // #endregion

  // #region Custom actions

  public async collectionAction(resourceType: string, action: string, requestPack: Pack<any>, context: RequestContext, options: ActionOptions = {}): Promise<Pack<any>> {
    const resource = this.registry.get(resourceType)
    const adapter = () => resource.adapter(context)

    await resource.runBeforeHandlers(context)
    return await resource.callCollectionAction(action, requestPack, adapter, context, options)
  }

  public async documentAction(resourceType: string, locator: DocumentLocator<ID>, action: string, requestPack: Pack<any>, context: RequestContext, options: ActionOptions = {}): Promise<Pack<any>> {
    const resource = this.registry.get(resourceType)
    const adapter = () => resource.adapter(context)

    await resource.runBeforeHandlers(context)
    return await resource.callDocumentAction(action, locator, requestPack, adapter, context, options)
  }

  // #endregion

  // #region Other interface

  public async load(linkage: Linkage<any>, context: RequestContext, options: ActionOptions = {}): Promise<Pack<ID>> {
    const resource = this.registry.get(linkage.type)
    const adapter = resource.adapter(context)

    const {data} = await resource.load({id: linkage.id}, adapter, context, {detail: true, ...options})
    return await resource.documentPack(data, undefined, adapter, context, {detail: true, ...options})
  }

  // #endregion

  // #region Serialization

  public async documentPack(entity: Entity, context: RequestContext, options: DocumentPackOptions<Entity, any> = {}) {
    const resource = this.resourceForModel(entity)
    const adapter = resource.maybeAdapter(context)
    return await resource.documentPack(entity, options.included, adapter, context, options)
  }

  public async collectionPack(entities: Entity[], context: RequestContext, options: CollectionPackOptions<Entity, any> = {}) {
    if (entities.length === 0) { return new Pack(new Collection()) }

    const resource = this.resourceForModel(entities[0])
    const adapter = resource.maybeAdapter(context)
    return await resource.collectionPack(entities, options.included, undefined, undefined, adapter, context, options)
  }

  public async entitiesToCollection(resourceType: string, entities: Entity[], context: RequestContext, options: ModelsToCollectionOptions = {}) {
    const resource = this.registry.get(resourceType)
    const adapter = resource.maybeAdapter(context)

    return await resource.entitiesToCollection(entities, adapter, context, options)
  }

  public async entityToDocument(resourceType: string, entity: Entity, context: RequestContext, options: ModelToDocumentOptions = {}) {
    const resource = this.registry.get(resourceType)
    const adapter = resource.maybeAdapter(context)

    return await resource.entityToDocument(entity, adapter, context, options)
  }

  public async buildIncluded(entities: Entity[], context: RequestContext, options: ModelToDocumentOptions = {}): Promise<Collection<ID> | undefined> {
    const collector = new IncludeCollector(this, context)
    const documents = await collector.wrap(entities, options)
    
    return new Collection(documents)
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

  // #region Router & HTTP

  private readonly _routes: RouteMap

  public get allowedContentTypes() {
    return this.options.router?.allowedContentTypes ?? config.allowedContentTypes
  }

  public get preferredContentType() {
    return this.allowedContentTypes[0] ?? 'application/vnd+json'
  }

  /**
   * Builds a router, optionally configuring JSON API for the router.
   */
  public router() {
    return createExpressRouter(this)
  }

  public routes(resource: Resource<Entity, Query, ID>, action: CommonActions) {    
    return this._routes[action](resource)
  }

  public customCollectionRoute(resource: Resource<any, any, any>, name: string) {
    if (this.options.router?.routes?.customCollection === false) { return false }
    return this.options.router?.routes?.customCollection?.(resource, name) ?? `/${resource.plural}/${name}`
  }

  public customDocumentRoute(resource: Resource<any, any, any>, name: string) {
    if (this.options.router?.routes?.customDocument === false) { return false }
    return this.options.router?.routes?.customDocument?.(resource, name) ?? `/${resource.plural}/:id/${name}`
  }

  // #endregion

  // #region OpenAPI

  public get openAPIEnabled() {
    return this.options.openAPI != null
  }

  public async openAPISpec(context: RequestContext, options?: OpenAPIGeneratorOptions) {
    const mergedOptions: OpenAPIGeneratorOptions = {
      ...(this.options?.openAPI === true ? {} : (this.options?.openAPI ?? {})),
      ...options,
    }

    const generator = new OpenAPIGenerator(this, context, mergedOptions)
    return await generator.generate()
  }

  // #endregion

}

export interface JSONAPIOptions<E, Q, I> {
  middleware?: Middleware<E, Q, I>[]
  router?:     RouterOptions
  openAPI?:    OpenAPIGeneratorOptions | true
  registry?:   ResourceRegistryOptions
}


export interface DocumentPackOptions<E, M> {
  detail?:   boolean
  include?:  string[]
  included?: E[]
  meta?:     M
}

export interface CollectionPackOptions<E, M> {
  detail?:   boolean
  include?:  string[]
  included?: E[]
  meta?:     M
}