import { isObject } from 'lodash'
import { wrapArray } from 'ytil'

import Adapter from './Adapter'
import Pack from './Pack'
import RequestContext from './RequestContext'
import Resource from './Resource'
import ResourceRegistry from './ResourceRegistry'
import { Middleware } from './middleware'
import {
  ActionOptions,
  DocumentLocator,
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

  constructor(
    options: JSONAPIOptions<Model, Query, ID> = {},
  ) {
    this.registry = new ResourceRegistry<Model, Query, ID>(
      this,
      options.middleware == null ? [] : wrapArray(options.middleware)
    )
  }

  public readonly registry: ResourceRegistry<Model, Query, ID>
  
  public abstract adapter(resource: Resource<Model, Query, ID>, context: RequestContext): Adapter<Model, Query, ID>
  public abstract parseID(id: string): ID
  
  // #region Registration
  
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
    const document = resource.extractRequestDocument(requestPack, false, context)
    const adapter = () => this.adapter(resource, context)

    await resource.runBeforeHandlers(context)
    return await resource.create(document, requestPack, adapter, context, options)
  }

  public async update(resourceType: string, requestPack: Pack<ID>, context: RequestContext, options: ActionOptions = {}) {
    const resource = this.registry.get(resourceType)
    const document = resource.extractRequestDocument(requestPack, true, context)
    const adapter = () => this.adapter(resource, context)

    await resource.runBeforeHandlers(context)
    return await resource.update({id: document.id}, document, requestPack.meta, adapter, context, options)
  }

  public async delete(resourceType: string, requestPack: Pack<ID>, context: RequestContext) {
    const resource = this.registry.get(resourceType)
    const selector = resource.extractBulkSelector(requestPack, context)
    const adapter = () => this.adapter(resource, context)

    await resource.runBeforeHandlers(context)
    return await resource.delete(selector, adapter, context)
  }

  // #endregion

  // #region Custom actions

  public async collectionAction(resourceType: string, action: string, requestPack: Pack<ID>, context: RequestContext, options: ActionOptions = {}) {
    const resource = this.registry.get(resourceType)
    const adapter = () => this.adapter(resource, context)

    await resource.runBeforeHandlers(context)
    return await resource.callCollectionAction(action, requestPack, adapter, context, options)
  }

  public async documentAction(resourceType: string, locator: DocumentLocator<ID>, action: string, requestPack: Pack<ID>, context: RequestContext, options: ActionOptions = {}) {
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

}

export interface JSONAPIOptions<M, Q, I> {
  middleware?: Middleware<M, Q, I>[]
}
