import Adapter from './Adapter'
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

export default class JSONAPI<Model, Query> {

  constructor(
    private readonly registry: ResourceRegistry<Model, Query>,
    private readonly adapter: (resource: Resource<Model, Query>, context: RequestContext) => Adapter,
  ) {}

    // #region Interface

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
      const document = await resource.extractRequestDocument(pack, false, context)
      const adapter  = this.adapter(resource, context)

      await resource.runBeforeHandlers(context)
      return await resource.create(document, pack, adapter, context, options)
    }

    public async update(resourceType: string, locator: ResourceLocator, pack: Pack, context: RequestContext, options: ActionOptions = {}) {
      const resource = this.registry.get(resourceType)
      const document = await resource.extractRequestDocument(pack, true, context)
      const adapter  = this.adapter(resource, context)

      await resource.runBeforeHandlers(context)
      return await resource.update(locator, document, pack, adapter, context, options)
    }

    public async delete(resourceType: string, selector: BulkSelector, context: RequestContext) {
      const resource = this.registry.get(resourceType)
      const adapter = this.adapter(resource, context)

      await resource.runBeforeHandlers(context)
      return await resource.delete(selector, adapter, context)
    }

    // #endregion

  }