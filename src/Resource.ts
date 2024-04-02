import { singularize } from 'inflected'
import { isArray, isFunction, mapValues } from 'lodash'
import { any, boolean, dictionary, number, string } from 'validator/types'
import { isPlainObject, objectEntries } from 'ytil'

import APIError from './APIError'
import Adapter, { GetResponse } from './Adapter'
import Collection from './Collection'
import Document from './Document'
import IncludeCollector from './IncludeCollector'
import JSONAPI from './JSONAPI'
import Pack from './Pack'
import RequestContext from './RequestContext'
import { AttributeConfig, RelationshipConfig, ResourceConfig } from './ResourceConfig'
import config from './config'
import {
  ActionOptions,
  BulkSelector,
  DocumentLocator,
  Linkage,
  ListActionOptions,
  ListParams,
  ModelsToCollectionOptions,
  ModelToDocumentOptions,
  Relationship,
  RetrievalActionOptions,
  Sort,
} from './types'

export default class Resource<Model, Query, ID> {

  constructor(
    public readonly jsonAPI: JSONAPI<Model, Query, ID>,
    public readonly type:    string,
    public readonly config:  ResourceConfig<Model, Query, ID>,
  ) {}

  // #region Naming

  public get plural(): string {
    return this.config.plural ?? this.type
  }

  public get singular(): string {
    return this.config.singular ?? singularize(this.type)
  }

  // #endregion

  // #region Adapter

  public adapter(context: RequestContext): Adapter<Model, Query, ID> {
    const adapter = this.jsonAPI.adapter(this, context)
    if (adapter == null) {
      throw new APIError(509, `No adapter available for resource \`${this.type}\``)
    }

    return adapter
  }

  // #endregion

  // #region Validation

  public async validate(adapter: Adapter<Model, Query, ID> | undefined) {
    for (const [name, attribute] of objectEntries(this.attributes)) {
      if (attribute.get != null) { continue }
      if (adapter?.attributeExists == null) { continue }

      if (!adapter.attributeExists?.(name)) {
        throw new APIError(509, `Attribute \`${this.type}:${name}\` not found`)
      }
    }
  }

  // #endregion

  // #region Queries

  public async listQuery(adapter: Adapter<Model, Query, ID>, params: Partial<ListParams> = {}, context: RequestContext) {
    let query = adapter.query()
    query = await this.applyQueryDefaults(query, context)
    query = await this.applyScope(query, context)

    if (params.filters != null) {
      query = await this.applyFilters(query, params.filters, adapter, context)
    }
    if (params.search != null) {
      query = await this.applySearch(query, params.search, context)
    }
    if (params.label != null) {
      query = await this.applyLabel(query, params.label, context)
    }
    if (params.sorts != null) {
      query = adapter.clearSorts(query)
      query = await this.applySorts(query, params.sorts, adapter, context)
    }
    if (params.offset != null) {
      query = await adapter.applyOffset(query, params.offset)
    }
    if (params.limit != null) {
      query = await adapter.applyLimit(query, params.limit)
    }

    return query
  }

  public async bulkSelectorQuery(adapter: Adapter<Model, Query, ID>, selector: BulkSelector<ID>, context: RequestContext) {
    let query = await this.listQuery(adapter, {}, context)

    if (selector.filters != null) {
      query = await this.applyFilters(query, selector.filters, adapter, context)
    }
    if (selector.search != null) {
      query = await this.applySearch(query, selector.search, context)
    }
    if (selector.ids != null) {
      query = await adapter.applyFilter(query, 'id', selector.ids)
    }

    return query
  }


  public async applyQueryDefaults(query: Query, context: RequestContext): Promise<Query> {
    if (this.config.query == null) { return query }
    return await this.config.query.call(this, query, context)
  }

  public async applyScope(query: Query, context: RequestContext): Promise<Query> {
    if (this.config.scope == null) { return query }
    return await this.config.scope.query.call(this, query, context)
  }

  public async applyFilters(query: Query, filters: Record<string, any>, adapter: Adapter<Model, Query, ID>, context: RequestContext): Promise<Query> {
    for (const [name, value] of objectEntries(filters)) {
      const modifier = this.config.filters?.[name]
      if (modifier != null) {
        query = await modifier.call(this, query, value, context)
      } else {
        query = await adapter.applyFilter(query, name, value)
      }
    }

    return query
  }

  public async applySearch(query: Query, term: string, context: RequestContext): Promise<Query> {
    if (this.config.search == null) {
      throw new APIError(409, `resource \`${this.type}\` does not support searching`)
    }

    return await this.config.search.call(this, query, term, context)
  }

  public async applyLabel(query: Query, label: string, context: RequestContext): Promise<Query> {
    const labelModifier = this.config.labels?.[label]
    if (labelModifier == null) {
      throw new APIError(404, `Label \`${label}\` not found`)
    }

    return await labelModifier.call(this, query, context)
  }

  public async applySorts(query: Query, sorts: Sort[], adapter: Adapter<Model, Query, ID>, context: RequestContext): Promise<Query> {
    for (const sort of sorts) {
      const modifier = this.config.sorts?.[sort.field]
      if (modifier != null) {
        query = await modifier.call(this, query, sort.direction, context)
      } else {
        query = await adapter.applySort(query, sort)
      }
    }

    return query
  }

  // #endregion

  // #region Attributes

  public get attributes(): Record<string, AttributeConfig<Model, Query, ID>> {
    return mapValues(this.config.attributes ?? {}, val => val === true ? {} : val)
  }

  private async getAttributes(model: Model, detail: boolean, adapter: Adapter<Model, Query, ID> | undefined, context: RequestContext) {
    const attributes: Record<string, any> = {}
    for (const [name, attribute] of objectEntries(this.attributes)) {
      if (!await this.attributeAvailable(attribute, model, true, context)) { continue }
      if (!detail && attribute.detail) { continue }
      attributes[name] = await this.getAttributeValue(model, name, attribute, adapter, context)
    }
    return attributes
  }

  private async getAttributeValue(model: Model, name: string, attribute: AttributeConfig<Model, Query, ID>, adapter: Adapter<Model, Query, ID> | undefined, context: RequestContext) {
    if (attribute.get != null) {
      return await attribute.get.call(this, model, context)
    } else if (adapter?.getAttribute != null) {
      return await adapter.getAttribute(model, name, attribute)
    } else {
      return (model as any)[name]
    }
  }

  private async setAttributes(model: Model, document: Document<ID>, create: boolean, adapter: Adapter<Model, Query, ID> | undefined, context: RequestContext) {
    for (const [name, value] of Object.entries(document.attributes)) {
      const attribute = this.attributes[name]

      if (!await this.attributeAvailable(attribute, model, true, context)) {
        throw new APIError(403, `Attribute "${name}" is not available`)
      }
      if (!await this.attributeWritable(attribute, model, create, context)) {
        throw new APIError(403, `Attribute "${name}" is not writable`)
      }

      await this.setAttribute(model, name, value, attribute, adapter, context)
    }
  }

  private async setAttribute(model: Model, name: string, value: any, attribute: AttributeConfig<Model, Query, ID>, adapter: Adapter<Model, Query, ID> | undefined, context: RequestContext) {
    if (attribute.set != null) {
      await attribute.set.call(this, model, value, context)
    } else if (adapter?.setAttribute != null) {
      await adapter.setAttribute(model, name, value, attribute)
    } else {
      (model as any)[name] = value
    }
  }

  public async attributeAvailable(attribute: AttributeConfig<Model, Query, ID> | undefined, model: Model, detail: boolean, context: RequestContext) {
    if (attribute == null) { return false }
    if (attribute.detail && !detail) { return false }
    if (attribute.if == null) { return true }
    if (!await attribute.if.call(this, model, context)) { return false }
    return true
  }

  public attributeWritable(attribute: AttributeConfig<Model, Query, ID> , model: Model, create: boolean, context: RequestContext) {
    if (attribute.writable == null) { return true }
    if (isFunction(attribute.writable)) { return attribute.writable.call(this, model, context) }
    if (attribute.writable === 'create') { return create }
    return attribute.writable
  }

  // #endregion

  // #region Relationships

  public get relationships(): Record<string, RelationshipConfig<Model, Query, ID>> {
    return this.config.relationships ?? {}
  }

  public async relationshipAvailable(relationship: RelationshipConfig<Model, Query, ID>, model: Model, detail: boolean, context: RequestContext) {
    if (relationship.detail && !detail) { return false }
    if (relationship.if == null) { return true }
    return await relationship.if.call(this, model, context)
  }

  private async getRelationships(model: Model, detail: boolean, adapter: Adapter<Model, Query, ID> | undefined, context: RequestContext) {
    const relationships: Record<string, Relationship<ID>> = {}
    for (const [name, relationship] of Object.entries(this.relationships)) {
      if (!await this.relationshipAvailable(relationship, model, detail, context)) { continue }
      relationships[name] = await this.getRelationshipValue(model, name, relationship, adapter, context)
    }
    return relationships
  }

  private async getRelationshipValue(model: Model, name: string, relationship: RelationshipConfig<Model, Query, ID>, adapter: Adapter<Model, Query, ID> | undefined, context: RequestContext): Promise<Relationship<ID>> {
    const coerce = (value: Relationship<ID> | Linkage<ID> | ID | Array<Linkage<ID> | ID> | null): Relationship<ID> => {
      if (Relationship.isRelationship(value)) {
        return value
      } else if (value == null) {
        return {data: relationship.plural ? [] : null}
      }

      const {type} = relationship
      if (type == null) {
        throw new APIError(509, `Relationship "${name}" is polymorphic but its getter doesn't return linkages.`)
      }

      const data = isArray(value)
        ? value.map(it => this.jsonAPI.toLinkage(it, type))
        : this.jsonAPI.toLinkage(value, type)

      if (isArray(data) !== relationship.plural) {
        if (relationship.plural) {
          throw new APIError(509, `Relationship "${name}" is plural, but does not yield an array.`)
        } else {
          throw new APIError(509, `Relationship "${name}" is singular, but yields an array.`)
        }
      }

      return {data}
    }

    if (relationship.plural && relationship.get != null) {
      return coerce(await relationship.get.call(this, model, context))
    } else if (!relationship.plural && relationship.get != null) {
      return coerce(await relationship.get.call(this, model, context))
    } else if (adapter?.getRelationship != null) {
      return coerce(await adapter.getRelationship(model, name, relationship))
    } else {
      return coerce((model as any)[name])
    }
  }

  // #endregion

  // #region Meta

  private async injectPackMeta(pack: Pack<ID>, model: Model | null, context: RequestContext) {
    if (isFunction(this.config.meta)) {
      pack.meta = await this.config.meta.call(this, pack.meta, model, context)
    } else if (this.config.meta != null) {
      Object.assign(pack.meta, this.config.meta)
    }
  }

  private async injectDocumentMeta(document: Document<ID>, model: Model, context: RequestContext) {
    if (isFunction(this.config.documentMeta)) {
      document.meta = await this.config.documentMeta.call(this, document.meta, model, context)
    } else if (this.config.documentMeta != null) {
      Object.assign(document.meta, this.config.documentMeta)
    }
  }

  // #endregion

  // #region Pagination

  private get pageSize(): number {
    if (this.config.pageSize != null) {
      return this.config.pageSize
    } else {
      return config.defaultPageSize
    }
  }

  /**
   * Injects proper pagination metadata in a pack containing this resource.
   *
   * @param pack The result pack.
   * @param context The request context.
   * @param pagination Supplied pagination parameters.
   */
  private async injectPaginationMeta(pack: Pack<ID>, offset: number | undefined, total: number | undefined, context: RequestContext) {
    const count = pack.data instanceof Collection ? pack.data.length : 1

    offset ??= 0

    if (total == null) {
      Object.assign(pack.meta, {
        offset,
        count,
        nextOffset: offset + count,
      })
    } else {
      const nextOffset = offset + count >= total ? null : offset + count
      Object.assign(pack.meta, {
        offset,
        count,
        total,
        nextOffset,
        isFirst: offset === 0,
        isLast:  nextOffset == null,
      })
    }
  }

  // #endregion

  // #region Actions

  public async runBeforeHandlers(context: RequestContext) {
    for (const handler of this.config.before ?? []) {
      await handler.call(this, context)
    }
  }

  public async list(params: ListParams, getAdapter: () => Adapter<Model, Query, ID>, context: RequestContext, options: ListActionOptions = {}): Promise<Pack<ID>> {
    if (this.config.list === false) {
      throw new APIError(405, `Action \`list\` not available`)
    }
    if (this.config.list != null) {
      return await this.config.list.call(this, params, getAdapter, context, options)
    }

    if (params.limit == null && this.config.forcePagination) {
      params.limit = this.pageSize
    }

    const {totals = this.config.totals ?? true} = options
    const adapter = getAdapter()
    const query = await this.listQuery(adapter, params, context)
    const response = await adapter.list(query, params, {...options, totals})

    return await this.collectionPack(
      response.models,
      response.included,
      params.offset,
      response.total,
      adapter,
      context,
      options
    )
  }

  public async show(locator: DocumentLocator<ID>, getAdapter: () => Adapter<Model, Query, ID>, context: RequestContext, options: RetrievalActionOptions = {}): Promise<Pack<ID>> {
    if (this.config.show === false) {
      throw new APIError(405, `Action \`show\` not available`)
    }
    if (this.config.show != null) {
      return await this.config.show.call(this, locator, getAdapter, context, options)
    }

    const adapter = getAdapter()
    const response = await this.getModel(locator, adapter, context)
    
    return await this.documentPack(
      response.model,
      response.included,
      adapter,
      context,
      options
    )
  }

  public async create(requestPack: Pack<ID>, getAdapter: () => Adapter<Model, Query, ID>, context: RequestContext, options: ActionOptions = {}): Promise<Pack<ID>> {
    if (this.config.create === false) {
      throw new APIError(405, `Action \`show\` not available`)
    }
    if (this.config.create != null) {
      return await this.config.create.call(this, requestPack, getAdapter, context, options)
    }

    const document = this.extractRequestDocument(requestPack, null)
    const adapter = getAdapter()

    const model = await adapter.emptyModel(document.id)
    await this.setAttributes(model, document, true, adapter, context)
    await this.config.scope?.ensure.call(this, model, context)

    const response = await adapter.save(model, requestPack, options)
    return await this.documentPack(response.model, undefined, adapter, context, options)
  }

  public async replace(id: ID, requestPack: Pack<ID>, getAdapter: () => Adapter<Model, Query, ID>, context: RequestContext, options: ActionOptions = {}): Promise<Pack<ID>> {
    if (this.config.replace === false) {
      throw new APIError(405, `Action \`replace\` not available`)
    }
    if (this.config.replace != null) {
      return await this.config.replace.call(this, id, requestPack, getAdapter, context, options)
    }

    const adapter = getAdapter()
    const document = this.extractRequestDocument(requestPack, id)
    
    // Run a getModel just to make sure the model exists.
    await this.getModel({id}, adapter, context)

    // Continue with a fresh model.
    const model = await adapter.emptyModel(id)
    await this.setAttributes(model, document, false, adapter, context)
    await this.config.scope?.ensure.call(this, model, context)

    const response = await adapter.save(model, requestPack, options)
    return await this.documentPack(response.model, undefined, adapter, context, options)
  }

  public async update(id: ID, requestPack: Pack<ID>, getAdapter: () => Adapter<Model, Query, ID>, context: RequestContext, options: ActionOptions = {}): Promise<Pack<ID>> {
    if (this.config.update === false) {
      throw new APIError(405, `Action \`update\` not available`)
    }
    if (this.config.update != null) {
      return await this.config.update.call(this, id, requestPack, getAdapter, context, options)
    }

    const adapter = getAdapter()
    const document = this.extractRequestDocument(requestPack, id)
    const {model} = await this.getModel({id}, adapter, context)
    await this.setAttributes(model, document, false, adapter, context)
    await this.config.scope?.ensure.call(this, model, context)

    const response = await adapter.save(model, requestPack, options)
    return await this.documentPack(response.model, undefined, adapter, context, options)
  }

  public async delete(requestPack: Pack<ID>, getAdapter: () => Adapter<Model, Query, ID>, context: RequestContext): Promise<Pack<ID>> {
    if (this.config.delete === false) {
      throw new APIError(405, `Action \`delete\` not available`)
    }
    if (this.config.delete != null) {
      return await this.config.delete.call(this, requestPack, getAdapter, context)
    }

    const adapter = getAdapter()
    const selector = this.extractBulkSelector(requestPack, context)
    const modelsOrIDs = await adapter.delete(await this.bulkSelectorQuery(adapter, selector, context))

    const linkages = modelsOrIDs.map(it => this.jsonAPI.toLinkage(it, this.type))
    const pack = new Pack<ID>(linkages, undefined, {
      deletedCount: linkages.length,
    })
    return pack
  }

  public async collectionPack(models: Model[], includedModels: Model[] | undefined, offset: number | undefined, total: number | undefined, adapter: Adapter<Model, Query, ID> | undefined, context: RequestContext, options: RetrievalActionOptions = {}) {
    const collection = await this.modelsToCollection(models, adapter, context, {
      detail: options.detail,
    })

    const included = await this.resolveIncluded(collection.documents, includedModels, context, options)
    const pack = new Pack<ID>(collection, included)
    await this.injectPaginationMeta(pack, offset, total, context)
    await this.injectPackMeta(pack, null, context)

    return pack
  }

  public async documentPack(model: Model, includedModels: Model[] | undefined, adapter: Adapter<Model, Query, ID> | undefined, context: RequestContext, options: RetrievalActionOptions = {}) {
    const document = await this.modelToDocument(model, adapter, context, {
      detail: options.detail,
    })

    const included = await this.resolveIncluded([document], includedModels, context, options)
    await this.injectDocumentMeta(document, model, context)

    const pack = new Pack<ID>(document, included)
    await this.injectPackMeta(pack, model, context)

    return pack
  }

  private async resolveIncluded(base: Document<ID>[], includedModels: Model[] | undefined, context: RequestContext, options: RetrievalActionOptions): Promise<Collection<ID> | undefined> {
    if (options.include == null) { return undefined }

    const collector = new IncludeCollector(this.jsonAPI, context)
    const documents = includedModels != null
      ? await collector.wrap(includedModels)
      : await collector.collect(base, options.include)

    return new Collection(documents)
  }

  public async getModel(locator: DocumentLocator<ID>, adapter: Adapter<Model, Query, ID>, context: RequestContext, options: RetrievalActionOptions = {}): Promise<LoadResponse<Model>> {
    const query = await this.listQuery(adapter, {}, context)
    if ('singleton' in locator) {
      const singleton = this.config.singletons?.[locator.singleton]
      if (singleton == null) {
        throw new APIError(404, `Singleton \`${locator.singleton}\` (of ${this.type}) not found`)
      }
  
      const response = await singleton(query, context, options)
      if (response.model == null) {
        throw new APIError(404, `Singleton \`${locator.singleton}\` (of ${this.type}) not found`)
      }
  
      return response as GetResponse<Model> & {model: Model}
    } else {
      const response = await adapter.get(query, locator.id, options)
      if (response.model == null) {
        throw new APIError(404, `Resource \`${this.type}\` with ID \`${locator.id}\` not found`)
      }

      return response as GetResponse<Model> & {model: Model}
    }
  }

  // #endregion

  // #region Custom actions

  public async callCollectionAction(name: string, requestPack: Pack<ID>, getAdapter: () => Adapter<Model, Query, ID>, context: RequestContext, options: ActionOptions = {}) {
    const action = this.config.collectionActions?.[name]
    if (action == null) {
      throw new APIError(405, `Action \`${name}\` not found`)
    }

    const handler = isFunction(action) ? action : action.handler
    return await handler.call(this, requestPack, getAdapter, context, options)
  }

  public async callDocumentAction(name: string, locator: DocumentLocator<ID>, requestPack: Pack<ID>, getAdapter: () => Adapter<Model, Query, ID>, context: RequestContext, options: ActionOptions = {}) {
    const action = this.config.documentActions?.[name]
    if (action == null) {
      throw new APIError(405, `Action \`${name}\` not found`)
    }

    const handler = isFunction(action) ? action : action.handler
    return await handler.call(this, locator, requestPack, getAdapter, context, options)
  }

  public get collectionActions() {
    return this.config.collectionActions ?? {}
  }

  public get documentActions() {
    return this.config.documentActions ?? {}
  }

  // #endregion

  // #region Serialization
  
  public async modelsToCollection(models: Model[], adapter: Adapter<Model, Query, ID> | undefined, context: RequestContext, options: ModelsToCollectionOptions = {}): Promise<Collection<ID>> {
    const {
      detail = false,
    } = options

    const documents = await Promise.all(models.map(model => {
      return this.modelToDocument(model, adapter, context, {detail})
    }))
    return new Collection(documents)
  }

  public async modelToDocument(model: Model, adapter: Adapter<Model, Query, ID> | undefined, context: RequestContext, options: ModelToDocumentOptions = {}): Promise<Document<ID>> {
    const {
      detail = true,
    } = options

    const id = await this.getAttributeValue(model, this.config.idAttribute ?? 'id', {}, adapter, context)

    const attributes = await this.getAttributes(model, detail, adapter, context)
    const relationships = await this.getRelationships(model, detail, adapter, context)

    const document = new Document(this, id, attributes, relationships)
    await this.injectDocumentMeta(document, model, context)
    return document
  }
  
  // #endregion

  // #region Request extracters

  public extractRequestDocument(pack: Pack<ID>, expectID: ID): Document<ID> & {id: string}
  public extractRequestDocument(pack: Pack<ID>, expectID: null): Document<ID>
  public extractRequestDocument(pack: Pack<ID>, expectID: ID | null): Document<ID>
  public extractRequestDocument(pack: Pack<ID>, expectID: ID | null): Document<ID> {
    const document = pack.data

    if (document == null) {
      throw new APIError(400, "No document sent")
    }
    if (!(document instanceof Document)) {
      throw new APIError(400, "Expected Document")
    }
    if (expectID != null && document.id == null) {
      throw new APIError(400, "Document ID required")
    }
    if (expectID != null && document.id !== expectID) {
      throw new APIError(409, "Document ID does not match endpoint ID")
    }
    if (document.resource.type !== this.type) {
      throw new APIError(409, "Document type does not match endpoint type")
    }

    return document
  }

  public extractActionOptions(context: RequestContext): ActionOptions {
    return {}
  }

  public extractRetrievalActionOptions(context: RequestContext): RetrievalActionOptions {
    const include = context.param('include', string({default: ''})).split(',').map(it => it.trim()).filter(it => it !== '')
    const detail = context.param('detail', boolean({default: false}))

    return {
      ...this.extractActionOptions(context),
      include,
      detail,
    }
  }

  public extractListParams(context: RequestContext): ListParams {
    const label = context.param('label', labelParam)
    const filters = this.extractFilters(context)
    const search = this.extractSearch(context)
    const sorts = this.extractSorts(context)
    const {limit, offset} = this.extractPagination(context)

    return {filters, label, search, sorts, limit, offset}
  }

  public extractFilters(context: RequestContext) {
    return context.param('filter', filterParam)
  }

  public extractSearch(context: RequestContext) {
    return context.param('search', searchParam)
  }

  public extractSorts(context: RequestContext) {
    const sort = context.param('sort', sortParam)
    if (sort == null) { return [] }

    const parts = sort.split(',')
    const sorts: Sort[] = []

    for (const part of parts) {
      if (part.charAt(0) === '-') {
        sorts.push({field: part.slice(1), direction: -1})
      } else {
        sorts.push({field: part, direction: 1})
      }
    }

    return sorts
  }

  public extractPagination(context: RequestContext): {offset: number, limit: number | null} {
    const offset = context.param('offset', offsetParam)
    const limit = context.param('limit', limitParam)

    return {offset, limit}
  }

  public extractDocumentLocator(context: RequestContext, singleton: false): {id: ID}
  public extractDocumentLocator(context: RequestContext, singleton?: boolean): DocumentLocator<ID>
  public extractDocumentLocator(context: RequestContext, singleton: boolean = true): DocumentLocator<ID> {
    const id = context.param('id', string())
    if (singleton && this.config.singletons != null && id in this.config.singletons) {
      return {singleton: id}
    } else {
      return {id: this.jsonAPI.parseID(id)}
    }
  }

  public extractBulkSelector(requestPack: Pack<ID>, context: RequestContext): BulkSelector<ID> {
    const {data, meta: {filters, search}} = requestPack

    if (data != null && (filters != null || search != null)) {
      throw new APIError(400, "Mix of explicit linkages and filters/search specified")
    }

    const selector: BulkSelector<ID> = {}
    if (data != null) {
      selector.ids = this.extractBulkSelectorIDs(data)
    } else {
      if (filters != null && !isPlainObject(filters)) {
        throw new APIError(400, "Node `meta.filters`: must be a plain object")
      }

      if (search != null && typeof search !== 'string') {
        throw new APIError(400, "Node `meta.search`: must be a string")
      }

      selector.filters = filters
      selector.search = search
    }

    return selector
  }

  private extractBulkSelectorIDs(data: any): ID[] {
    if (!isArray(data)) {
      throw new APIError(400, "Array expected")
    }

    const ids: Array<string | number> = []
    for (const linkage of data) {
      if (!Linkage.isLinkage<string | number>(linkage)) {
        throw new APIError(400, `Invalid linkage: ${JSON.stringify(linkage)}`)
      }
      if (linkage.type !== this.type) {
        throw new APIError(409, "Linkage type does not match endpoint type")
      }
      if (linkage.id == null) {
        throw new APIError(400, "ID required in linkage")
      }

      ids.push(linkage.id)
    }

    return ids.map(it => this.jsonAPI.parseID(it))
  }

  // #endregion

}

const labelParam = string({required: false})
const filterParam = dictionary({valueType: any(), default: () => ({})})
const searchParam = string({required: false})
const sortParam = string({required: false})
const offsetParam = number({integer: true, default: 0})
const limitParam = number({integer: true, required: false})

interface LoadResponse<M> {
  model:     M
  included?: M[]
}
