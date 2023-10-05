import { singularize } from 'inflected'
import { isFunction, isPlainObject } from 'lodash'
import { any, boolean, dictionary, number, string } from 'validator/types'
import { objectEntries } from 'ytil'
import Adapter from './Adapter'
import APIError from './APIError'
import Collection from './Collection'
import config from './config'
import Document from './Document'
import Pack from './Pack'
import RequestContext from './RequestContext'
import {
  AttributeConfig,
  FilterMap,
  LabelMap,
  RelationshipConfig,
  RelationshipMap,
  ResourceConfig,
  SingletonMap,
  SortMap,
} from './ResourceConfig'
import ResourceRegistry from './ResourceRegistry'
import {
  ActionOptions,
  AttributeBag,
  BulkSelector,
  Links,
  ListParams,
  Meta,
  RelationshipBag,
  ResourceLocator,
  RetrievalActionOptions,
  Sort,
} from './types'

export default class Resource<Model, Query> {

  constructor(
    public readonly registry: ResourceRegistry<any, any>,
    public readonly type:     string,
    public readonly config:   ResourceConfig<Model, Query>
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
  public get labels(): LabelMap<Model, Query> {
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

  public async applyScope(query: Query, context: RequestContext): Promise<Query> {
    if (this.config.scope == null) { return query }
    return await this.config.scope.call(this, query, context)
  }

  public async getDefaults(context: RequestContext): Promise<Record<string, any> | null> {
    return this.config.defaults?.call(this, context) ?? null
  }

  public async applyFilters(query: Query, filters: Record<string, any>, apply: (query: Query, name: string, value: any) => Query | Promise<Query>, context: RequestContext): Promise<Query> {
    for (const [name, value] of objectEntries(filters)) {
      const modifier = this.filters[name]
      if (modifier != null) {
        query = await modifier.call(this, query, value, context)
      } else {
        query = await apply(query, name, value)
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

  public async applySorts(query: Query, sorts: Sort[], apply: (query: Query, sort: Sort) => Query | Promise<Query>, context: RequestContext): Promise<Query> {
    for (const sort of sorts) {
      const modifier = this.sorts[sort.field]
      if (modifier != null) {
        query = await modifier.call(this, query, sort.direction, context)
      } else {
        query = await apply(query, sort)
      }
    }

    return query
  }

  public attributeAvailable(attribute: AttributeConfig<Model, Query>, model: Model, context: RequestContext) {
    if (attribute.if == null) { return true }
    return attribute.if.call(this, model, context)
  }

  public attributeWritable(attribute: AttributeConfig<Model, Query>, model: Model, create: boolean, context: RequestContext) {
    if (!this.attributeAvailable(attribute, model, context)) { return false }
    if (attribute.writable == null) { return true }
    if (isFunction(attribute.writable)) { return attribute.writable.call(this, model, context) }
    if (attribute.writable === 'create') { return create }
    return attribute.writable
  }

  // #endregion

  // #region Attributes & relationships

  /**
   * Obtains a full list of all attributes and their configuration.
   */
  public get attributes(): Map<string, Required<AttributeConfig<Model, Query>>> {
    const {attributes} = this.config
    if (attributes == null) { return new Map() }

    const result = new Map()
    for (const name of Object.keys(attributes)) {
      const attribute = attributes[name]
      result.set(name, {
        ...defaultAttribute,
        ...(attribute !== true ? attribute : {}),
      })
    }
    return result
  }

  public get relationships(): RelationshipMap<Model, Query> {
    if (isFunction(this.config.relationships)) { return {} }
    return this.config.relationships ?? {}
  }

  public get relationshipNames(): string[] {
    return Object.keys(this.relationships)
  }

  /**
   * Obtains a relationship by name.
   */
  public relationship(name: string): RelationshipConfig<Model, Query> | null {
    if (this.config.relationships == null) { return null }
    if (isFunction(this.config.relationships)) { return null }
    return this.config.relationships[name] ?? null
  }

  public async collectAttributes(models: Model[], context: RequestContext): Promise<void> {
    for (const [, attribute] of this.attributes.entries()) {
      await attribute.collect?.call(this, models, context)
    }
  }

  // #endregion

  // #region Meta & links

  public async getPackMeta(context: RequestContext) {
    const meta: Record<string, any> = {}

    for (const [key, config] of objectEntries(this.config.meta ?? {})) {
      meta[key] = await config.get.call(this, context)
    }

    return meta
  }

  public async getDocumentMeta(model: Model, context: RequestContext) {
    const meta: Record<string, any> = {}

    for (const [key, config] of objectEntries(this.config.documentMeta ?? {})) {
      meta[key] = await config.get.call(this, model, context)
    }

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
   * Injects proper 'self' links into the resulting pack for this resource.
   *
   * @param pack The resulting pack.
   * @param request The request.
   */
  private injectPackSelfLinks(pack: Pack, context: RequestContext) {
    // Start by interpolating current request parameters in our base. This is useful in case resources
    // use interpolation values in their base (e.g. `scripts/:scriptID/messages`).
    if (context.requestURI == null) { return null }

    const base        = context.requestURI
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

  private injectDocumentSelfLinks(document: Document, base: URL) {
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
  private async injectPaginationMeta(pack: Pack, context: RequestContext, offset: number | undefined) {
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
          searchParams: new URLSearchParams({offset: `${nextOffset}`})
        })
        if (url != null) {
          pack.links.next = url.toString()
        }
      }
    }
  }

  // #endregion

  // #region Actions

  public async authenticateRequest(context: RequestContext) {
    await this.config.authenticateRequest?.call(this, context)
  }

  public async runBeforeHandlers(context: RequestContext) {
    for (const handler of this.config.before ?? []) {
      await handler.call(this, context)
    }
  }

  public async list(params: ListParams, adapter: Adapter, context: RequestContext, options: RetrievalActionOptions = {}): Promise<Pack> {
    if (this.config.list === false) {
      throw new APIError(405, `Action \`list\` not available`)
    }

    if (params.limit == null && this.config.forcePagination) {
      params.limit = this.pageSize
    }

    const pack = this.config.list != null
      ? await this.config.list.call(this, params, adapter, context, options)
      : await adapter.list(params, options)

    this.injectPackSelfLinks(pack, context)
    await this.injectPaginationMeta(pack, context, params.offset)
    return pack
  }

  public async get(locator: ResourceLocator, adapter: Adapter, context: RequestContext, options: RetrievalActionOptions = {}): Promise<Pack> {
    if (this.config.get === false) {
      throw new APIError(405, `Action \`show\` not available`)
    }

    const responsePack = this.config.get != null
      ? await this.config.get.call(this, locator, adapter, context, options)
      : await adapter.get(locator, options)

    this.injectPackSelfLinks(responsePack, context)
    return responsePack
  }

  public async create(document: Document, requestPack: Pack, adapter: Adapter, context: RequestContext, options: ActionOptions = {}): Promise<Pack> {
    if (this.config.create === false) {
      throw new APIError(405, `Action \`show\` not available`)
    }

    const responsePack = this.config.create != null
      ? await this.config.create.call(this, document, requestPack, adapter, context, options)
      : await adapter.create(document, requestPack, options)

    this.injectPackSelfLinks(responsePack, context)
    return responsePack
  }

  public async update(locator: ResourceLocator, document: Document, meta: Meta, adapter: Adapter, context: RequestContext, options: ActionOptions = {}): Promise<Pack> {
    if (this.config.update === false) {
      throw new APIError(405, `Action \`update\` not available`)
    }

    const responsePack = this.config.update != null
      ? await this.config.update.call(this, document, meta, adapter, context, options)
      : await adapter.update(locator, document, meta, options)

    this.injectPackSelfLinks(responsePack, context)
    return responsePack
  }

  public async delete(selector: BulkSelector, adapter: Adapter, context: RequestContext): Promise<Pack> {
    if (this.config.delete === false) {
      throw new APIError(405, `Action \`delete\` not available`)
    }

    const responsePack = this.config.delete != null
      ? await this.config.delete.call(this, selector, adapter, context)
      : await adapter.delete(selector)

    this.injectPackSelfLinks(responsePack, context)
    return responsePack
  }

  public async listRelated(
    locator:      ResourceLocator,
    relationship: string,
    params:       ListParams,
    adapter:      Adapter,
    context:      RequestContext,
    options:      ActionOptions,
  ): Promise<Pack> {
    if (this.config.listRelated === false) {
      throw new APIError(405, `Action \`listRelated\` not available`)
    }

    if (params.limit == null && this.config.forcePagination) {
      params.limit = this.pageSize
    }
    const pack = this.config.listRelated != null
      ? await this.config.listRelated.call(this, locator, relationship, params, adapter, context, options)
      : await adapter.listRelated(locator, relationship, params, options)

    this.injectPackSelfLinks(pack, context)
    await this.injectPaginationMeta(pack, context, params.offset)
    return pack
  }

  public async getRelated(
    locator:      ResourceLocator,
    relationship: string,
    adapter:      Adapter,
    context:      RequestContext,
    options:      ActionOptions
  ): Promise<Pack> {
    if (this.config.getRelated === false) {
      throw new APIError(405, `Action \`getRelated\` not available`)
    }

    const pack = this.config.getRelated != null
      ? await this.config.getRelated.call(this, locator, relationship, adapter, context, options)
      : await adapter.getRelated(locator, relationship, options)

    this.injectPackSelfLinks(pack, context)
    return pack
  }

  // #endregion

  // #region Custom actions

  public async callCollectionAction(name: string, requestPack: Pack, adapter: Adapter, context: RequestContext, options: ActionOptions = {}) {
    const action = this.config.collectionActions?.find(it => it.name === name)
    if (action == null) {
      throw new APIError(405, `Action \`${name}\` not found`)
    }

    const responsePack = await action.action.call(this, requestPack, adapter, context, options)
    this.injectPackSelfLinks(responsePack, context)
    return responsePack
  }

  public async callDocumentAction(name: string, locator: ResourceLocator, requestPack: Pack, adapter: Adapter, context: RequestContext, options: ActionOptions = {}) {
    const action = this.config.documentActions?.find(it => it.name === name)
    if (action == null) {
      throw new APIError(405, `Action \`${name}\` not found`)
    }

    const responsePack = await action.action.call(this, locator, requestPack, adapter, context, options)
    this.injectPackSelfLinks(responsePack, context)
    return responsePack
  }

  public get collectionActions() {
    return this.config.collectionActions ?? []
  }

  public get documentActions() {
    return this.config.documentActions ?? []
  }

  // #endregion

  // #region Request extracters

  public extractRequestDocument(pack: Pack, requireID: true, context: RequestContext): Document & {id: string}
  public extractRequestDocument(pack: Pack, requireID: boolean, context: RequestContext): Document
  public extractRequestDocument(pack: Pack, requireID: boolean, context: RequestContext): Document {
    const document = pack.data
    const idParam  = context.param('id', string({required: false}))

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
    const detail  = context.param('detail', boolean({default: false}))

    return {
      ...this.extractActionOptions(context),
      include,
      detail
    }
  }

  public extractListParams(context: RequestContext): ListParams {
    const label           = context.param('label', string({required: false}))
    const filters         = this.extractFilters(context)
    const search          = this.extractSearch(context)
    const sorts           = this.extractSorts(context)
    const {limit, offset} = this.extractPagination(context)

    return {filters, label, search, sorts, limit, offset}
  }

  public extractFilters(context: RequestContext) {
    return context.param('filter', dictionary({
      valueType: any(),
      default:   () => ({})
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
    const limit  = context.param('limit', number({integer: true, required: false}))

    return {offset, limit}
  }

  public extractResourceLocator(context: RequestContext): ResourceLocator {
    const id        = context.param('id', string({required: false}))
    const singleton = context.param('singleton', string({required: false}))

    if (id != null) {
      return {id}
    } else if (singleton != null) {
      return {singleton}
    } else {
      throw new APIError(400, "Invalid resource locator, specify either `id` or `singleton`.")
    }
  }

  public extractBulkSelector(requestPack: Pack, context: RequestContext): BulkSelector {
    const id = context.param('id', string({required: false}))
    if (id != null) { return {ids: [id]} }

    const {data, meta: {filters, search}} = requestPack

    if (data != null && (filters != null || search != null)) {
      throw new APIError(400, "Mix of explicit linkages and filters/search specified")
    }

    if (data != null) {
      return {ids: this.extractBulkSelectorIDs(data, this)}
    } else {
      if (filters != null && !isPlainObject(filters)) {
        throw new APIError(400, "Node `meta.filters`: must be a plain object")
      }
      if (search != null && typeof search !== 'string') {
        throw new APIError(400, "Node `meta.search`: must be a string")
      }

      return {
        filters: filters,
        search:  search,
      }
    }
  }

  private extractBulkSelectorIDs<M, Q>(data: any, resource: Resource<M, Q>) {
    if (!(data instanceof Collection)) {
      throw new APIError(400, "Collection expected")
    }

    const ids: string[] = []
    for (const linkage of data) {
      if (linkage.resource.type !== resource.type) {
        throw new APIError(409, "Linkage type does not match endpoint type")
      }
      if (linkage.id == null) {
        throw new APIError(400, "ID required in linkage")
      }
      ids.push(linkage.id)
    }

    return ids
  }

  // #endregion

}

export interface QueryOptions {
  label?:   string
  filters?: Record<string, any>
}

export interface BuildCollectionConfig<T> {
  id:             (item: T, index: number) => string
  attributes:     (item: T, index: number) => AttributeBag
  relationships?: (item: T, index: number) => RelationshipBag
  meta?:          (item: T, index: number) => Meta
  links?:         (item: T, index: number) => Links
}

const defaultAttribute: AttributeConfig<any, any> = {
  writable:    true,
  serialize:   value => value,
  deserialize: raw => raw,
}