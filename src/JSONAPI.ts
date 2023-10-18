import Adapter, { ModelsToCollectionOptions, ModelToDocumentOptions } from './Adapter'
import Pack from './Pack'
import RequestContext from './RequestContext'
import Resource from './Resource'
import ResourceRegistry from './ResourceRegistry'
import {
  ActionOptions,
  BulkSelector,
  ListParams,
  ResourceLocator,
  RetrievalActionOptions,
} from './types'

export default abstract class JSONAPI<Model, Query> {

  public abstract registry: ResourceRegistry<Model, Query>
  public abstract adapter(resource: Resource<Model, Query>, context: RequestContext): Adapter

  // #region CRUD

  public async show(resourceType: string, locator: ResourceLocator, context: RequestContext, options: RetrievalActionOptions = {}) {
    const resource = this.registry.get(resourceType)
    const adapter = this.adapter(resource, context)

    await resource.runBeforeHandlers(context)
    return await resource.get(locator, adapter, context, options)
  }

  public async list(resourceType: string, params: ListParams, context: RequestContext, options: RetrievalActionOptions = {}) {
    const resource = this.registry.get(resourceType)
    const adapter = this.adapter(resource, context)

    await resource.runBeforeHandlers(context)
    return await resource.list(params, adapter, context, options)
  }

  public async create(resourceType: string, pack: Pack, context: RequestContext, options: ActionOptions = {}) {
    const resource = this.registry.get(resourceType)
    const document = resource.extractRequestDocument(pack, false, context)
    const adapter  = this.adapter(resource, context)

    await resource.runBeforeHandlers(context)
    return await resource.create(document, pack, adapter, context, options)
  }

  public async update(resourceType: string, pack: Pack, context: RequestContext, options: ActionOptions = {}) {
    const resource = this.registry.get(resourceType)
    const document = resource.extractRequestDocument(pack, true, context)
    const adapter  = this.adapter(resource, context)

    await resource.runBeforeHandlers(context)
    return await resource.update({id: document.id}, document, pack.meta, adapter, context, options)
  }

  public async delete(resourceType: string, selector: BulkSelector, context: RequestContext) {
    const resource = this.registry.get(resourceType)
    const adapter = this.adapter(resource, context)

    await resource.runBeforeHandlers(context)
    return await resource.delete(selector, adapter, context)
  }

  // #endregion

  // #region Custom actions

  public async collectionAction(resourceType: string, action: string, requestPack: Pack, context: RequestContext, options: ActionOptions = {}) {
    const resource = this.registry.get(resourceType)
    const adapter  = this.adapter(resource, context)

    await resource.runBeforeHandlers(context)
    return await resource.callCollectionAction(action, requestPack, adapter, context, options)
  }

  public async documentAction(resourceType: string, locator: ResourceLocator, action: string, requestPack: Pack, context: RequestContext, options: ActionOptions = {}) {
    const resource = this.registry.get(resourceType)
    const adapter  = this.adapter(resource, context)

    await resource.runBeforeHandlers(context)
    return await resource.callDocumentAction(action, locator, requestPack, adapter, context, options)
  }

  // #endregion

  // #region Serialization

  public async modelToDocument(resourceType: string, model: Model, context: RequestContext, options: ModelToDocumentOptions = {}) {
    const resource = this.registry.get(resourceType)
    const adapter  = this.adapter(resource, context)

    return await adapter.modelToDocument(model, options)
  }

  public async modelsToCollection(resourceType: string, models: Model[], context: RequestContext, options: ModelsToCollectionOptions = {}) {
    const resource = this.registry.get(resourceType)
    const adapter  = this.adapter(resource, context)

    return await adapter.modelsToCollection(models, options)
  }

  // #endregion

}