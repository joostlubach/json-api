import { singularize } from 'inflected'
import { isArray, isFunction, isPlainObject, mapValues } from 'lodash'
import { any, boolean, dictionary, number, string } from 'validator/types'
import { objectEntries } from 'ytil'

import APIError from './APIError'
import Adapter from './Adapter'
import Collection from './Collection'
import Document from './Document'
import JSONAPI from './JSONAPI'
import Pack from './Pack'
import RequestContext from './RequestContext'
import {
  AttributeConfig,
  FilterMap,
  LabelMap,
  RelationshipConfig,
  ResourceConfig,
  SingletonMap,
  SortMap,
} from './ResourceConfig'
import config from './config'
import {
  ActionOptions,
  BulkSelector,
  DocumentLocator,
  Linkage,
  ListParams,
  Meta,
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

  // #region Data retrieval

  /**
   * Gets all defined labels.
   */
  public get labels(): LabelMap<Model, Query, ID> {
    return this.config.labels ?? {}
  }

  /**
   * Gets all defined label names.
   */
  public get labelNames(): string[] {
    return Object.keys(this.labels)
  }

  /**
   * Gets all defined singletons.
   */
  public get singletons(): SingletonMap<Query, Model> {
    return this.config.singletons ?? {}
  }

  /**
   * Loads a singleton.
   * @param name The defined name of the singleton.
   */
  public async loadSingleton(name: string, query: Query, include: string[], context: RequestContext): Promise<[Model, Model[]]> {
    const singleton = this.singletons[name]
    if (singleton == null) {
      throw new APIError(404, `Singleton \`${name}\` (of ${this.type}) not found`)
    }

    return await singleton(query, include, context)
  }

  /**
   * Gets all defined singleton names.
   */
  public get singletonNames(): string[] {
    return Object.keys(this.singletons)
  }

  public get totals() {
    return this.config.totals ?? true
  }

  public get sorts(): SortMap<Query> {
    return this.config.sorts ?? {}
  }

  public get filters(): FilterMap<Query> {
    return this.config.filters ?? {}
  }

  // #region Queries

  public async listQuery(adapter: Adapter<Model, Query, ID>, params: Partial<ListParams> = {}, context: RequestContext) {
    let query = adapter.query()
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


  public async applyScope(query: Query, context: RequestContext): Promise<Query> {
    if (this.config.scope == null) { return query }
    return await this.config.scope.call(this, query, context)
  }

  public async getDefaults(context: RequestContext): Promise<Record<string, any> | null> {
    return this.config.defaults?.call(this, context) ?? null
  }

  public async applyFilters(query: Query, filters: Record<string, any>, adapter: Adapter<Model, Query, ID>, context: RequestContext): Promise<Query> {
    for (const [name, value] of objectEntries(filters)) {
      const modifier = this.filters[name]
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
    let labelModifier = this.labels[label]
    if (labelModifier == null && this.config.wildcardLabel != null) {
      labelModifier = this.config.wildcardLabel.bind(this, label)
    }

    if (labelModifier == null) {
      throw new APIError(404, `Label \`${label}\` not found`)
    }

    return await labelModifier.call(this, query, context)
  }

  public async applySorts(query: Query, sorts: Sort[], adapter: Adapter<Model, Query, ID>, context: RequestContext): Promise<Query> {
    for (const sort of sorts) {
      const modifier = this.sorts[sort.field]
      if (modifier != null) {
        query = await modifier.call(this, query, sort.direction, context)
      } else {
        query = await adapter.applySort(query, sort)
      }
    }

    return query
  }

  // #endregion

  // #region Attributes & relationships

  public get attributes(): Record<string, AttributeConfig<Model, Query, ID>> {
    return mapValues(this.config.attributes ?? {}, val => val === true ? {} : val)
  }

  public get relationships(): Record<string, RelationshipConfig<Model, Query, ID>> {
    return this.config.relationships ?? {}
  }

  public async attributeAvailable(attribute: AttributeConfig<Model, Query, ID>, model: Model, context: RequestContext) {
    if (attribute.if == null) { return true }
    return await attribute.if.call(this, model, context)
  }

  public attributeWritable(attribute: AttributeConfig<Model, Query, ID>, model: Model, create: boolean, context: RequestContext) {
    if (!this.attributeAvailable(attribute, model, context)) { return false }
    if (attribute.writable == null) { return true }
    if (isFunction(attribute.writable)) { return attribute.writable.call(this, model, context) }
    if (attribute.writable === 'create') { return create }
    return attribute.writable
  }

  public async relationshipAvailable(relationship: RelationshipConfig<Model, Query, ID>, model: Model, context: RequestContext) {
    if (relationship.if == null) { return true }
    return await relationship.if.call(this, model, context)
  }

  private async getAttribute(model: Model, name: string, attribute: AttributeConfig<Model, Query, ID>, adapter: Adapter<Model, Query, ID>, context: RequestContext) {
    if (attribute.get != null) {
      return await attribute.get.call(this, model, context)
    } else if (adapter.getAttribute != null) {
      return await adapter.getAttribute(model, name)
    } else {
      return (model as any)[name]
    }
  }

  private async getRelationship(model: Model, name: string, relationship: RelationshipConfig<Model, Query, ID>, adapter: Adapter<Model, Query, ID>, context: RequestContext): Promise<Relationship<ID>> {
    const coerce = (value: Relationship<ID> | Linkage<ID> | ID | Array<Linkage<ID> | ID> | null): Relationship<ID> => {
      if (Relationship.isRelationship(value)) {
        return value
      } else if (isArray(value)) {
        return {
          data: value.map(it => this.jsonAPI.toLinkage(it, relationship.type)),
        }
      } else if (value != null) {
        return {
          data: this.jsonAPI.toLinkage(value, relationship.type),
        }
      } else {
        return {
          data: null,
        }
      }
    }

    if (relationship.plural && relationship.get != null) {
      return coerce(await relationship.get.call(this, model, context))
    } else if (!relationship.plural && relationship.get != null) {
      return coerce(await relationship.get.call(this, model, context))
    } else if (adapter.getRelationship != null) {
      return coerce(await adapter.getRelationship(model, name))
    } else {
      return coerce((model as any)[name])
    }
  }

  // #endregion

  // #region Meta & links

  public async getPackMeta(context: RequestContext) {
    const meta: Record<string, any> = {}

    const promises = objectEntries(this.config.meta ?? {}).map(async ([key, config]) => {
      meta[key] = await config.get.call(this, context)
    })
    await Promise.all(promises)

    return meta
  }

  public async getDocumentMeta(model: Model, context: RequestContext) {
    const meta: Record<string, any> = {}

    const promises = objectEntries(this.config.documentMeta ?? {}).map(async ([key, config]) => {
      meta[key] = await config.get.call(this, model, context)
    })
    await Promise.all(promises)

    return meta
  }

  public async getPackLinks(context: RequestContext) {
    const links: Record<string, any> = {}

    for (const [key, config] of objectEntries(this.config.links ?? {})) {
      links[key] = await config.get.call(this, context)
    }

    return links
  }

  public async getDocumentLinks(model: Model, context: RequestContext) {
    const links: Record<string, any> = {}

    for (const [key, config] of objectEntries(this.config.documentLinks ?? {})) {
      links[key] = await config.get.call(this, model, context)
    }

    return links
  }

  /**
   * Injects pack meta into a response pack.
   *
   * @param pack The pack to inject the meta into.
   * @param context The request context.
   */
  private async injectPackMeta(pack: Pack<ID>, context: RequestContext) {
    Object.assign(pack.meta, await this.getPackMeta(context))
  }

  /**
   * Injects proper 'self' links into the response pack for this resource.
   *
   * @param pack The response pack.
   * @param context The request context.
   */
  private injectPackSelfLinks(pack: Pack<ID>, context: RequestContext) {
    // Start by interpolating current request parameters in our base. This is useful in case resources
    // use interpolation values in their base (e.g. `scripts/:scriptID/messages`).
    if (context.requestURI == null) { return null }

    const base = context.requestURI
    const baseNoQuery = new URL({...context.requestURI, search: ''})
    if (base == null ?? baseNoQuery == null) { return }

    if (pack.data == null ?? pack.data instanceof Collection) {
      // This is a request for some collection, the self link is the base.
      pack.links.self = `${base}`
    }
    if (pack.data instanceof Document && pack.data.id != null) {
      pack.links.self = `${base}/${pack.data.id}`
    }

    if (pack.data instanceof Collection) {
      // Insert a self link for each document in the collection.
      for (const document of pack.data.documents) {
        this.injectDocumentSelfLinks(document, baseNoQuery)
      }
    }
    if (pack.data instanceof Document) {
      this.injectDocumentSelfLinks(pack.data, baseNoQuery)
    }
  }

  private injectDocumentSelfLinks(document: Document<ID>, base: URL) {
    const {id} = document
    if (id == null) { return }

    document.links.self = `${base}/${id}`

    for (const name of Object.keys(document.relationships)) {
      const relationship = document.relationships[name]
      relationship.links = {
        self:    `${base}/${id}/relationships/${name}`,
        related: `${base}/${id}/${name}`,
        ...relationship.links,
      }
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
  private async injectPaginationMeta(pack: Pack<ID>, context: RequestContext, offset: number | undefined) {
    const count = pack.data instanceof Collection ? pack.data.length : 1
    const total = typeof pack.meta.total === 'number'
      ? pack.meta.total
      : null

    offset ??= 0

    if (context.requestURI != null) {
      const url = new URL({
        ...context.requestURI,
        searchParams: new URLSearchParams({offset: '0'}),
      })
      if (url != null) {
        pack.links.first = url.toString()
      }
    }

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
        nextOffset,
        isFirst: offset === 0,
        isLast:  nextOffset == null,
      })

      if (context.requestURI != null) {
        const url = new URL({
          ...context.requestURI,
          searchParams: new URLSearchParams({offset: `${nextOffset}`}),
        })
        if (url != null) {
          pack.links.next = url.toString()
        }
      }
    }
  }

  // #endregion

  // #region Actions

  public async runBeforeHandlers(context: RequestContext) {
    for (const handler of this.config.before ?? []) {
      await handler.call(this, context)
    }
  }

  public async list(params: ListParams, getAdapter: () => Adapter<Model, Query, ID>, context: RequestContext, options: RetrievalActionOptions = {}): Promise<Pack<ID>> {
    if (this.config.list === false) {
      throw new APIError(405, `Action \`list\` not available`)
    }

    if (params.limit == null && this.config.forcePagination) {
      params.limit = this.pageSize
    }

    const adapter = getAdapter()
    const models = this.config.list != null
      ? await this.config.list.call(this, params, adapter, context, options)
      : await adapter.list(await this.listQuery(adapter, params, context), params, options)

    const pack = await this.collectionPack(models, adapter, context, options)
    await this.injectPaginationMeta(pack, context, params.offset)
    return pack
  }

  public async show(locator: DocumentLocator<ID>, getAdapter: () => Adapter<Model, Query, ID>, context: RequestContext, options: RetrievalActionOptions = {}): Promise<Pack<ID>> {
    if (this.config.get === false) {
      throw new APIError(405, `Action \`show\` not available`)
    }

    const adapter = getAdapter()
    const model = this.config.get != null
      ? await this.config.get.call(this, locator, adapter, context, options)
      : await adapter.get(await this.listQuery(adapter, {}, context), locator, options)
    
    return await this.documentPack(model, adapter, context)
  }

  public async create(document: Document<ID>, requestPack: Pack<ID>, getAdapter: () => Adapter<Model, Query, ID>, context: RequestContext, options: ActionOptions = {}): Promise<Pack<ID>> {
    if (this.config.create === false) {
      throw new APIError(405, `Action \`show\` not available`)
    }

    const adapter = getAdapter()
    const model = this.config.create != null
      ? await this.config.create.call(this, document, requestPack, adapter, context, options)
      : await adapter.create(await this.listQuery(adapter, {}, context), document, requestPack, options)

    return await this.documentPack(model, adapter, context)
  }

  public async replace(locator: DocumentLocator<ID>, document: Document<ID>, meta: Meta, getAdapter: () => Adapter<Model, Query, ID>, context: RequestContext, options: ActionOptions = {}): Promise<Pack<ID>> {
    if (this.config.replace === false) {
      throw new APIError(405, `Action \`replace\` not available`)
    }

    const adapter = getAdapter()
    const model = this.config.replace != null
      ? await this.config.replace.call(this, locator, document, meta, adapter, context, options)
      : await adapter.replace(await this.listQuery(adapter, {}, context), locator, document, meta, options)

    return await this.documentPack(model, adapter, context)
  }

  public async update(locator: DocumentLocator<ID>, document: Document<ID>, meta: Meta, getAdapter: () => Adapter<Model, Query, ID>, context: RequestContext, options: ActionOptions = {}): Promise<Pack<ID>> {
    if (this.config.update === false) {
      throw new APIError(405, `Action \`update\` not available`)
    }

    const adapter = getAdapter()
    const model = this.config.update != null
      ? await this.config.update.call(this, locator, document, meta, adapter, context, options)
      : await adapter.update(await this.listQuery(adapter, {}, context), locator, document, meta, options)

    return await this.documentPack(model, adapter, context)
  }

  public async delete(selector: BulkSelector<ID>, getAdapter: () => Adapter<Model, Query, ID>, context: RequestContext): Promise<Pack<ID>> {
    if (this.config.delete === false) {
      throw new APIError(405, `Action \`delete\` not available`)
    }

    const adapter = getAdapter()
    const models = this.config.delete != null
      ? await this.config.delete.call(this, selector, adapter, context)
      : await adapter.delete(await this.bulkSelectorQuery(adapter, selector, context))

    const linkages = models.map(model => this.jsonAPI.toLinkage(model, this.type))
    const pack = new Pack<ID>(linkages, undefined, undefined, {
      deletedCount: models.length,
    })
    this.injectPackSelfLinks(pack, context)
    return pack
  }

  public async listRelated(
    locator:      DocumentLocator<ID>,
    relationship: string,
    params:       ListParams,
    getAdapter:      () => Adapter<Model, Query, ID>,
    context:      RequestContext,
    options:      ActionOptions,
  ): Promise<Pack<ID>> {
    if (this.config.listRelated === false) {
      throw new APIError(405, `Action \`listRelated\` not available`)
    }

    if (params.limit == null && this.config.forcePagination) {
      params.limit = this.pageSize
    }

    const adapter = getAdapter()
    const models = this.config.listRelated != null
      ? await this.config.listRelated.call(this, locator, relationship, params, adapter, context, options)
      : await adapter.listRelated(locator, relationship, await this.listQuery(adapter, params, context), params, options)

    const pack = await this.collectionPack(models, adapter, context, options)
    await this.injectPaginationMeta(pack, context, params.offset)
    return pack
  }

  public async showRelated(
    locator:      DocumentLocator<ID>,
    relationship: string,
    getAdapter:      () => Adapter<Model, Query, ID>,
    context:      RequestContext,
    options:      ActionOptions,
  ): Promise<Pack<ID>> {
    if (this.config.showRelated === false) {
      throw new APIError(405, `Action \`showRelated\` not available`)
    }

    const adapter = getAdapter()
    const models = this.config.showRelated != null
      ? await this.config.showRelated.call(this, locator, relationship, adapter, context, options)
      : await adapter.showRelated(locator, relationship, await this.listQuery(adapter, {}, context), options)

    return await this.documentPack(models, adapter, context, options)
  }

  private async collectionPack(models: Model[], adapter: Adapter<Model, Query, ID>, context: RequestContext, options: RetrievalActionOptions = {}) {
    const collection = await this.modelsToCollection(models, adapter, context, {
      detail: options.detail,
    })

    const included = options.include != null && adapter.collectIncludes != null ? (
      await adapter.collectIncludes(models, options.include)
    ) : (
      []
    )

    const pack = new Pack<ID>(collection, new Collection(included))
    this.injectPackSelfLinks(pack, context)
    await this.injectPackMeta(pack, context)
    return pack
  }

  private async documentPack(model: Model, adapter: Adapter<Model, Query, ID>, context: RequestContext, options: RetrievalActionOptions = {}) {
    const document = await this.modelToDocument(model, adapter, context, {
      detail: options.detail,
    })

    const included = options.include != null && adapter.collectIncludes != null ? (
      await adapter.collectIncludes([model], options.include)
    ) : (
      []
    )

    const pack = new Pack<ID>(document, new Collection(included))
    this.injectPackSelfLinks(pack, context)
    Object.assign(pack.links, this.getDocumentLinks(model, context))

    await this.injectPackMeta(pack, context)
    Object.assign(pack.meta, this.getDocumentMeta(model, context))

    return pack
  }

  // #endregion

  // #region Custom actions

  public async callCollectionAction(name: string, requestPack: Pack<ID>, adapter: () => Adapter<Model, Query, ID>, context: RequestContext, options: ActionOptions = {}) {
    const action = this.config.collectionActions?.find(it => it.name === name)
    if (action == null) {
      throw new APIError(405, `Action \`${name}\` not found`)
    }

    const responsePack = await action.action.call(this, requestPack, adapter, context, options)
    this.injectPackSelfLinks(responsePack, context)
    return responsePack
  }

  public async callDocumentAction(name: string, locator: DocumentLocator<ID>, requestPack: Pack<ID>, adapter: () => Adapter<Model, Query, ID>, context: RequestContext, options: ActionOptions = {}) {
    const action = this.config.documentActions?.find(it => it.name === name)
    if (action == null) {
      throw new APIError(405, `Action \`${name}\` not found`)
    }

    const responsePack = await action.action.call(this, locator, requestPack, adapter, context, options)
    this.injectPackSelfLinks(responsePack, context)
    await this.injectPackMeta(responsePack, context)
    return responsePack
  }

  public get collectionActions() {
    return this.config.collectionActions ?? []
  }

  public get documentActions() {
    return this.config.documentActions ?? []
  }

  // #endregion

  // #region Serialization
  
  public async modelsToCollection(models: Model[], adapter: Adapter<Model, Query, ID>, context: RequestContext, options: ModelsToCollectionOptions = {}): Promise<Collection<ID>> {
    const {
      detail = false,
    } = options

    const documents = await Promise.all(models.map(model => {
      return this.modelToDocument(model, adapter, context, {detail})
    }))
    return new Collection(documents)
  }

  public async modelToDocument(model: Model, adapter: Adapter<Model, Query, ID>, context: RequestContext, options: ModelToDocumentOptions = {}): Promise<Document<ID>> {
    const attributes: Record<string, any> = {}
    const relationships: Record<string, Relationship<ID>> = {}

    const id = adapter.getID != null
      ? adapter.getID(model)
      : (model as any).id

    for (const [name, attribute] of Object.entries(this.attributes)) {
      if (!await this.attributeAvailable(attribute, model, context)) { continue }
      attributes[name] = await this.getAttribute(model, name, attribute, adapter, context)
    }
    for (const [name, relationship] of Object.entries(this.relationships)) {
      if (!await this.relationshipAvailable(relationship, model, context)) { continue }
      relationships[name] = await this.getRelationship(model, name, relationship, adapter, context)
    }

    const links = await this.getDocumentLinks(model, context)
    const meta = await this.getDocumentMeta(model, context)
    return new Document(this, id, attributes, relationships, links, meta)
  }
  
  // #endregion

  // #region Request extracters

  public extractRequestDocument(pack: Pack<ID>, requireID: true, context: RequestContext): Document<ID> & {id: string}
  public extractRequestDocument(pack: Pack<ID>, requireID: boolean, context: RequestContext): Document<ID>
  public extractRequestDocument(pack: Pack<ID>, requireID: boolean, context: RequestContext): Document<ID> {
    const document = pack.data
    const idParam = context.param('id', string({required: false}))

    if (document == null) {
      throw new APIError(400, "No document sent")
    }
    if (!(document instanceof Document)) {
      throw new APIError(400, "Expected Document")
    }
    if (requireID && document.id == null) {
      throw new APIError(400, "Document ID required")
    }
    if (document.id != null && idParam != null && document.id !== idParam) {
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
    const label = context.param('label', string({required: false}))
    const filters = this.extractFilters(context)
    const search = this.extractSearch(context)
    const sorts = this.extractSorts(context)
    const {limit, offset} = this.extractPagination(context)

    return {filters, label, search, sorts, limit, offset}
  }

  public extractFilters(context: RequestContext) {
    return context.param('filter', dictionary({
      valueType: any(),
      default:   () => ({}),
    }))
  }

  public extractSearch(context: RequestContext) {
    return context.param('search', string({required: false}))
  }

  public extractSorts(context: RequestContext) {
    const sort = context.param('sort', string({required: false}))
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
    const offset = context.param('limit', number({integer: true, defaultValue: 0}))
    const limit = context.param('limit', number({integer: true, required: false}))

    return {offset, limit}
  }

  public extractDocumentLocator(context: RequestContext): DocumentLocator<ID> {
    const id = context.param('id', string())
    if (this.singletonNames.includes(id)) {
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

    if (data != null) {
      return {ids: this.extractBulkSelectorIDs(data)}
    } else {
      if (filters != null && !isPlainObject(filters)) {
        throw new APIError(400, "Node `meta.filters`: must be a plain object")
      }
      if (search != null && typeof search !== 'string') {
        throw new APIError(400, "Node `meta.search`: must be a string")
      }

      return {
        filters,
        search,
      }
    }
  }

  private extractBulkSelectorIDs(data: any): ID[] {
    if (!(data instanceof Collection)) {
      throw new APIError(400, "Collection expected")
    }

    const ids: string[] = []
    for (const linkage of data) {
      if (!Linkage.isLinkage(linkage)) {
        throw new APIError(400, `Invalid linkage: ${JSON.stringify(linkage)}`)
      }

      if (linkage.resource.type !== this.type) {
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

export interface QueryOptions {
  label?:   string
  filters?: Record<string, any>
}