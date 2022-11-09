import { Request } from 'express'
import { singularize } from 'inflected'
import { isFunction } from 'lodash'
import URL, { Url } from 'url'
import URLTemplate from 'url-template'
import * as actions from './actions'
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
  Adapter,
  AttributeBag,
  BulkSelector,
  Links,
  ListOptions,
  Meta,
  PaginationSpec,
  RelationshipBag,
  ResourceLocator,
} from './types'

export default class Resource<Model, Query> {

  constructor(
    public readonly registry: ResourceRegistry,
    public readonly type:     string,
    public readonly config:   ResourceConfig<Model, Query>
  ) {}

  //------
  // Naming

  public get plural(): string {
    return this.config.plural || this.type
  }

  public get singular(): string {
    return this.config.singular || singularize(this.type)
  }

  //------
  // Overall

  /**
   * Builds a proper URL to this resource.
   *
   * @param request The Express request object, to get a proper hostname.
   * @param overrides An URL object that serves as a base, if not found from the request.
   */
  public formatResourceURL(request: Request, overrides: Partial<Url> = {}) {
    return URL.format({
      ...overrides,
      protocol: overrides.protocol || request.protocol,
      host:     overrides.host || request.get('Host'),
      pathname: overrides.pathname || URLTemplate.parse(this.type).expand(request.params),
    })
  }

  /**
   * Obtains an adapter to handle this resource.
   *
   * @param context A request context.
   */
  public adapter(context: RequestContext): Adapter<Model, Query> {
    if (this.config.adapter == null) {
      throw new Error(`Resource \`${this.type}\` has no defined adapter`)
    }

    return this.config.adapter.call(this, this.registry, context)
  }

  //------
  // Data retrieval

  /**
   * Gets all defined labels.
   */
  public get labels(): LabelMap<Query> {
    return this.config.labels || {}
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
    return this.config.singletons || {}
  }

  /**
   * Loads a singleton.
   * @param name The defined name of the singleton.
   */
  public async loadSingleton(name: string, query: Query, context: RequestContext): Promise<Model | null> {
    const singleton = this.singletons[name]
    if (singleton == null) { return null }

    return await singleton(query, context)
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
    return this.config.sorts || {}
  }

  public get filters(): FilterMap<Query> {
    return this.config.filters || {}
  }

  public async applyScope(query: Query, context: RequestContext): Promise<Query> {
    if (this.config.scope == null) { return query }
    return await this.config.scope(query, context)
  }

  public async getDefaults(context: RequestContext): Promise<AnyObject | null> {
    return this.config.defaults?.(context) ?? null
  }

  public async applyLabel(query: Query, label: string, context: RequestContext): Promise<Query> {
    let labelModifier = this.labels[label]
    if (labelModifier == null && this.config.wildcardLabel != null) {
      labelModifier = this.config.wildcardLabel.bind(null, label)
    }

    if (labelModifier == null) {
      throw new APIError(404, `Label \`${label}\` not found`)
    }

    return await labelModifier.call(this, query, context)
  }

  public hasSort(field: string) {
    return field in this.sorts
  }

  public applySort(query: Query, field: string, direction: 1 | -1, context: RequestContext): Query {
    const sortModifier = this.sorts[field]
    if (sortModifier == null) {
      throw new APIError(404, `Sort \`${field}\` not defined`)
    }

    return sortModifier.call(this, query, direction, context)
  }

  public hasFilter(filter: string) {
    return filter in this.filters
  }

  public async applyFilter(query: Query, filter: string, value: string, context: RequestContext): Promise<Query> {
    const filterModifier = this.filters[filter]
    if (filterModifier == null) {
      throw new APIError(404, `Filter \`${filter}\` not defined`)
    }

    return await filterModifier.call(this, query, value, context)
  }

  public applySearch(query: Query, term: string): Query {
    if (this.config.search == null) {
      throw new APIError(409, `resource \`${this.type}\` does not support searching`)
    }

    return this.config.search.call(this, query, term)
  }

  public async applyBulkSelector(query: Query, selector: BulkSelector, context: RequestContext) {
    const db = this.adapter(context)

    const {ids, search, filters} = selector
    if (ids != null) {
      query = await db.applyFilters(query, {id: {$in: ids}})
    }
    if (filters != null) {
      query = await db.applyFilters(query, filters)
    }
    if (search != null) {
      query = this.applySearch(query, search)
    }

    return query
  }

  //------
  // Serialization

  /**
   * Obtains a full list of all attributes and their configuration.
   */
  public get attributes(): Map<string, Required<AttributeConfig<Model>>> {
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

  public get relationships(): RelationshipMap<Model> {
    if (isFunction(this.config.relationships)) { return {} }
    return this.config.relationships ?? {}
  }

  public get relationshipNames(): string[] {
    return Object.keys(this.relationships)
  }

  /**
   * Obtains a relationship by name.
   */
  public relationship(name: string): RelationshipConfig<Model> | null {
    if (this.config.relationships == null) { return null }
    if (isFunction(this.config.relationships)) { return null }
    return this.config.relationships[name] ?? null
  }

  public async collectAttributes(models: Model[], context: RequestContext): Promise<void> {
    for (const [, attribute] of this.attributes.entries()) {
      await attribute.collect?.call(this, models, context)
    }
  }

  //------
  // Meta & links

  public async getPackMeta(context: RequestContext) {
    const meta: Record<string, any> = {}

    for (const [key, config] of Object.entries(this.config.meta ?? {})) {
      meta[key] = await config.get(context)
    }

    return meta
  }

  public async getDocumentMeta(model: Model, context: RequestContext) {
    const meta: Record<string, any> = {}

    for (const [key, config] of Object.entries(this.config.documentMeta ?? {})) {
      meta[key] = await config.get(model, context)
    }

    return meta
  }

  public async getPackLinks(context: RequestContext) {
    const links: Record<string, any> = {}

    for (const [key, config] of Object.entries(this.config.links ?? {})) {
      links[key] = await config.get(context)
    }

    return links
  }

  public async getDocumentLinks(model: Model, context: RequestContext) {
    const links: Record<string, any> = {}

    for (const [key, config] of Object.entries(this.config.documentLinks ?? {})) {
      links[key] = await config.get(model, context)
    }

    return links
  }

  /**
   * Injects proper 'self' links into the resulting pack for this resource.
   *
   * @param pack The resulting pack.
   * @param request The request.
   */
  public injectPackSelfLinks(pack: Pack, request: Request<any>) {
    // Start by interpolating current request parameters in our base. This is useful in case resources
    // use interpolation values in their base (e.g. `scripts/:scriptID/messages`).
    const base = this.formatResourceURL(request)
    const baseWithQuery = this.formatResourceURL(request, {query: request.query as any})

    if (pack.data == null || pack.data instanceof Collection) {
      // This is a request for some collection, the self link is the base.
      pack.links.self = baseWithQuery
    }
    if (pack.data instanceof Document && pack.data.id != null) {
      pack.links.self = `${baseWithQuery}/${pack.data.id}`
    }

    if (pack.data instanceof Collection) {
      // Insert a self link for each document in the collection.
      for (const document of pack.data.documents) {
        this.injectDocumentSelfLinks(document, base)
      }
    }
    if (pack.data instanceof Document) {
      this.injectDocumentSelfLinks(pack.data, base)
    }
  }

  private injectDocumentSelfLinks(document: Document, base: string) {
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

  //------
  // Pagination

  public get pageSize(): number {
    if (this.config.pageSize != null) {
      return this.config.pageSize
    } else {
      return config.defaultPageSize
    }
  }

  public paginationParams(pagination: PaginationSpec): {offset: number, limit: number | null} {
    const offset = pagination.offset == null ? 0 : pagination.offset

    let limit
    if (pagination.limit != null) {
      limit = pagination.limit
    } else if (this.config.forcePagination !== false) {
      limit = this.pageSize
    } else {
      limit = null
    }

    return {offset, limit}
  }

  /**
   * Injects proper pagination metadata in a pack containing this resource.
   *
   * @param pack The result pack.
   * @param context The request context.
   * @param pagination Supplied pagination parameters.
   */
  public async injectPaginationMeta(pack: Pack, context: RequestContext, pagination?: PaginationSpec) {
    const offset = pagination ? this.paginationParams(pagination).offset : 0

    const count = pack.data instanceof Collection ? pack.data.length : 1
    const total = typeof pack.meta.total === 'number'
      ? pack.meta.total
      : null

    if (context.request != null) {
      pack.links.first = this.formatResourceURL(context.request, {query: {offset: '0'}})
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

      if (context.request != null) {
        pack.links.next = this.formatResourceURL(context.request, {query: {offset: `${nextOffset}`}})
      }
    }
  }

  //------
  // Actions

  public async authenticateRequest(request: Request, context: RequestContext) {
    if (this.config.authenticateRequest == null) { return }
    await this.config.authenticateRequest.call(this, request, context)
  }

  public async emitBefore(context: RequestContext) {
    if (this.config.before == null) { return }
    await this.config.before.call(this, context)
  }

  public async emitAfter(pack: Pack, context: RequestContext) {
    if (this.config.after == null) { return }
    await this.config.after.call(this, pack, context)
  }

  public async list(context: RequestContext, options: ListOptions = {}): Promise<Pack> {
    if (this.config.list === false) {
      throw new APIError(405, `Action \`list\` not available`)
    }

    const action = this.config.list || actions.list
    const pack = await action.call(this, context, options)

    await this.injectPaginationMeta(
      pack,
      context,
      options.pagination
    )

    return pack
  }

  public async show(context: RequestContext, locator: ResourceLocator, options: ActionOptions): Promise<Pack> {
    if (this.config.show === false) {
      throw new APIError(405, `Action \`show\` not available`)
    }

    const action = this.config.show || actions.show
    return await action.call(this, context, locator, options)
  }

  public async create(context: RequestContext, document: Document, pack: Pack, options: ActionOptions): Promise<Pack> {
    if (this.config.create === false) {
      throw new APIError(405, `Action \`create\` not available`)
    }

    const action = this.config.create || actions.create
    return await action.call(this, context, document, pack, options)
  }

  public async update(context: RequestContext, document: Document, pack: Pack, options: ActionOptions): Promise<Pack> {
    if (this.config.update === false) {
      throw new APIError(405, `Action \`update\` not available`)
    }

    const action = this.config.update || actions.update
    return await action.call(this, context, document, pack, options)
  }

  public async delete(context: RequestContext, selector: BulkSelector, options: ActionOptions = {}): Promise<Pack> {
    if (this.config.delete === false) {
      throw new APIError(405, `Action \`delete\` not available`)
    }

    const action = this.config.delete || actions.delete
    return await action.call(this, context, selector, options)
  }

  public async listRelated(
    context:          RequestContext,
    relationshipName: string,
    parentID:         string,
    options:          ListOptions
  ): Promise<Pack> {
    if (this.config.listRelated === false) {
      throw new APIError(405, `Action \`listRelated\` not available`)
    }

    const action = this.config.listRelated || actions.listRelated
    return await action.call(this, context, relationshipName, parentID, options)
  }

  public async showRelated(
    context:          RequestContext,
    relationshipName: string,
    parentID:         string,
    options:          ActionOptions
  ): Promise<Pack> {
    if (this.config.showRelated === false) {
      throw new APIError(405, `Action \`showRelated\` not available`)
    }

    const action = this.config.showRelated || actions.showRelated
    return await action.call(this, context, relationshipName, parentID, options)
  }

  //------
  // Custom actions

  public get collectionActions() {
    return this.config.collectionActions || []
  }

  public get documentActions() {
    return this.config.documentActions || []
  }

  //------
  // Custom document building

  public buildDocument(id: string, detail: boolean, attributes: AttributeBag, relationships: RelationshipBag = {}, meta: Meta = {}, links: Links = {}) {
    return new Document(this, id, detail, attributes, relationships, meta, links)
  }

  public buildCollection<T>(data: T[], detail: boolean, config: BuildCollectionConfig<T>) {
    const documents = data.map((item, index) => {
      return this.buildDocument(
        config.id(item, index),
        detail,
        config.attributes(item, index),
        config.relationships == null ? {} : config.relationships(item, index),
        config.meta == null ? {} : config.meta(item, index),
        config.links == null ? {} : config.links(item, index)
      )
    })

    return new Collection(documents)
  }

}

export interface BuildCollectionConfig<T> {
  id:             (item: T, index: number) => string
  attributes:     (item: T, index: number) => AttributeBag
  relationships?: (item: T, index: number) => RelationshipBag
  meta?:          (item: T, index: number) => Meta
  links?:         (item: T, index: number) => Links
}

const defaultAttribute: AttributeConfig<any> = {
  writable:    true,
  serialize:   value => value,
  deserialize: raw => raw,
}