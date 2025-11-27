import { singularize } from 'inflected'
import { isArray, isFunction, mapValues } from 'lodash'
import { isPlainObject, objectEntries } from 'ytil'
import { z } from 'zod'

import APIError from './APIError'
import Adapter, { GetResponse } from './Adapter'
import Collection from './Collection'
import Document from './Document'
import IncludeCollector from './IncludeCollector'
import JSONAPI, { CollectionPackOptions, DocumentPackOptions } from './JSONAPI'
import Pack from './Pack'
import RequestContext from './RequestContext'
import { AttributeConfig, RelationshipConfig, ResourceConfig } from './ResourceConfig'
import config from './config'
import { relationship } from './openapi/objects'
import {
  AnyResource,
  BulkSelector,
  CreateActionOptions,
  DocumentLocator,
  Linkage,
  ListActionOptions,
  ListParams,
  ModelsToCollectionOptions,
  ModelToDocumentOptions,
  Relationship,
  RelationshipDataLike,
  ReplaceActionOptions,
  RetrievalActionOptions,
  ShowActionOptions,
  Sort,
  UpdateActionOptions,
} from './types'

export default class Resource<Entity, Query, ID> {

  constructor(
    public readonly jsonAPI: JSONAPI<Entity, Query, ID>,
    public readonly type:    string,
    public readonly config:  ResourceConfig<Entity, Query, ID>,
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

  public adapter(context: RequestContext): Adapter<Entity, Query, ID> {
    const adapter = this.jsonAPI.adapter(this, context)
    if (adapter == null) {
      throw new APIError(509, `No adapter available for resource \`${this.type}\``)
    }

    return adapter
  }

  public maybeAdapter(context: RequestContext): Adapter<Entity, Query, ID> | undefined {
    return this.jsonAPI.adapter(this, context)
  }

  // #endregion

  // #region Validation

  public async validate(adapter: Adapter<Entity, Query, ID> | undefined) {
    for (const [name, attribute] of objectEntries(this.attributes)) {
      if (attribute.get != null || attribute.set != null) { continue }
      if (adapter?.attributeExists == null) { continue }

      if (!adapter.attributeExists?.(name)) {
        throw new APIError(509, `Attribute \`${this.type}:${name}\` not found`)
      }
    }
  }

  // #endregion

  // #region Queries

  public async listQuery(adapter: Adapter<Entity, Query, ID>, params: Partial<ListParams> = {}, context: RequestContext) {
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
    if (params.limit != null) {
      query = await adapter.applyPagination(query, params.limit, params.offset)
    }

    return query
  }

  public async bulkSelectorQuery(adapter: Adapter<Entity, Query, ID>, selector: BulkSelector<ID>, context: RequestContext) {
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

  public async applyFilters(query: Query, filters: Record<string, any>, adapter: Adapter<Entity, Query, ID>, context: RequestContext): Promise<Query> {
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

  public async applySorts(query: Query, sorts: Sort[], adapter: Adapter<Entity, Query, ID>, context: RequestContext): Promise<Query> {
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

  public get attributes(): Record<string, AttributeConfig<Entity, Query, ID>> {
    return mapValues(this.config.attributes ?? {}, val => val === true ? {} : val)
  }

  private async getAttributes(entity: Entity, detail: boolean, adapter: Adapter<Entity, Query, ID> | undefined, context: RequestContext) {
    const attributes: Record<string, any> = {}
    for (const [name, attribute] of objectEntries(this.attributes)) {
      if (!await this.attributeAvailable(attribute, entity, true, context)) { continue }
      if (!this.attributeReadable(attribute, entity, context)) { continue }
      if (!detail && attribute.detail) { continue }
      attributes[name] = await this.getAttributeValue(entity, name, attribute, adapter, context)
    }
    return attributes
  }

  private async getAttributeValue(entity: Entity, name: string, attribute: AttributeConfig<Entity, Query, ID>, adapter: Adapter<Entity, Query, ID> | undefined, context: RequestContext) {
    if (!await this.attributeAvailable(attribute, entity, true, context)) {
      throw new APIError(403, `Attribute "${name}" is not available`)
    }
    if (!this.attributeReadable(attribute, entity, context)) {
      throw new APIError(403, `Attribute "${name}" is not readable`)
    }

    if (attribute.get != null) {
      return await attribute.get.call(this, entity, context)
    } else if (adapter?.getAttribute != null) {
      return await adapter.getAttribute(entity, name, attribute)
    } else {
      return (entity as any)[name]
    }
  }

  private async setAttributes(entity: Entity, document: Document<ID>, create: boolean, adapter: Adapter<Entity, Query, ID> | undefined, context: RequestContext) {
    for (const [name, value] of Object.entries(document.attributes)) {
      const attribute = this.attributes[name]

      if (!await this.attributeAvailable(attribute, entity, true, context)) {
        throw new APIError(403, `Attribute "${name}" is not available`)
      }
      if (!await this.attributeWritable(attribute, entity, create, context)) {
        throw new APIError(403, `Attribute "${name}" is not writable`)
      }

      await this.setAttribute(entity, name, value, attribute, adapter, context)
    }
  }

  private async setAttribute(entity: Entity, name: string, value: any, attribute: AttributeConfig<Entity, Query, ID>, adapter: Adapter<Entity, Query, ID> | undefined, context: RequestContext) {
    if (attribute.set != null) {
      await attribute.set.call(this, entity, value, context)
    } else if (adapter?.setAttribute != null) {
      await adapter.setAttribute(entity, name, value, attribute)
    } else {
      (entity as any)[name] = value
    }
  }

  public async attributeAvailable(attribute: AttributeConfig<Entity, Query, ID> | undefined, entity: Entity, detail: boolean, context: RequestContext) {
    if (attribute == null) { return false }
    if (attribute.detail && !detail) { return false }
    if (attribute.if == null) { return true }
    if (!await attribute.if.call(this, entity, context)) { return false }
    return true
  }

  public attributeWritable(attribute: AttributeConfig<Entity, Query, ID> , entity: Entity, create: boolean, context: RequestContext) {
    if (attribute.writable == null) {
      if (attribute.set == null && attribute.get != null) { return false }
      return true
    }
    if (isFunction(attribute.writable)) { return attribute.writable.call(this, entity, context) }
    if (attribute.writable === 'create') { return create }
    return attribute.writable
  }

  public attributeReadable(attribute: AttributeConfig<Entity, Query, ID> , entity: Entity, context: RequestContext) {
    // There is only one situation where an attribute is not readable, which is when a setter is specified, but a
    // getter is not.
    if (attribute.get == null && attribute.set != null) { return false }
    return true
  }

  // #endregion

  // #region Relationships

  public get relationships(): Record<string, RelationshipConfig<Entity, Query, ID>> {
    return this.config.relationships ?? {}
  }

  public async relationshipAvailable(relationship: RelationshipConfig<Entity, Query, ID>, entity: Entity, detail: boolean, context: RequestContext) {
    if (relationship.detail && !detail) { return false }
    if (relationship.if == null) { return true }
    return await relationship.if.call(this, entity, context)
  }

  private async getRelationships(entity: Entity, detail: boolean, adapter: Adapter<Entity, Query, ID> | undefined, context: RequestContext) {
    const relationships: Record<string, Relationship<ID>> = {}
    for (const [name, relationship] of Object.entries(this.relationships)) {
      if (!await this.relationshipAvailable(relationship, entity, detail, context)) { continue }
      relationships[name] = await this.getRelationshipValue(entity, name, relationship, adapter, context)
    }
    return relationships
  }

  private getAutoIncludes(detail: boolean): string[] {
    const includes: Array<[string, RelationshipConfig<Entity, Query, ID>]> = []
    for (const [name, relationship] of this.getOwnAutoIncludeRelationships(detail)) {
      this.collectAutoIncludes(includes, name, relationship, detail, new Set([this]), null)
    }
    return includes.map(it => it[0])
  }

  private collectAutoIncludes(includes: Array<[string, RelationshipConfig<any, any, any>]>, name: string, relationship: RelationshipConfig<Entity, Query, ID>, detail: boolean, processed: Set<AnyResource>, prefix: string | null) {
    const prefixedName = prefix == null ? name : `${prefix}+${name}`
    const nestedResource = relationship.type == null ? null : this.jsonAPI.registry.get(relationship.type)
    if (nestedResource == null) { return }

    // Prevent loops by checking that we didn't process this resource already
    if (processed.has(nestedResource)) { return }
    processed.add(nestedResource)

    includes.push([prefixedName, relationship])
    for (const [name, relationship] of nestedResource.getOwnAutoIncludeRelationships(detail)) {
      nestedResource.collectAutoIncludes(includes, name, relationship, detail, processed, prefixedName)
    }
  }

  private getOwnAutoIncludeRelationships(detail: boolean): Array<[string, RelationshipConfig<Entity, Query, ID>]> {
    return objectEntries(this.relationships).filter(([name, rel]) => {
      if (!rel.include) { return false }
      if (rel.include === true) { return true }
      if (rel.include.detail && !detail) { return false }
      return true
    })
  }

  private async getRelationshipValue(entity: Entity, name: string, relationship: RelationshipConfig<Entity, Query, ID>, adapter: Adapter<Entity, Query, ID> | undefined, context: RequestContext): Promise<Relationship<ID>> {
    const coerce = (value: Relationship<ID> | RelationshipDataLike<ID>): Relationship<ID> => {
      if (Relationship.isRelationship<ID>(value)) {
        return value
      }

      const {type} = relationship
      const toLinkage = (value: ID | Linkage<ID>): Linkage<ID> => {
        if (Linkage.is<ID>(value)) {
          return value
        } else if (type != null) {
          return this.jsonAPI.toLinkage(value, type)
        } else {
          throw new APIError(509, `Relationship "${name}" is polymorphic but its getter returns at least one single ID.`)
        }
      }

      if (relationship.plural) {
        if (!isArray(value)) {
          throw new APIError(509, `Relationship "${name}" is plural, but does not yield an array.`)
        } else {
          return {data: value.map(toLinkage)}
        }
      } else {
        if (isArray(value)) {
          throw new APIError(509, `Relationship "${name}" is singular, but yields an array.`)
        } else {
          return {data: value == null ? null : toLinkage(value)}
        }
      }
    }

    if (relationship.plural && relationship.get != null) {
      return coerce(await relationship.get.call(this, entity, context))
    } else if (!relationship.plural && relationship.get != null) {
      return coerce(await relationship.get.call(this, entity, context))
    } else if (adapter?.getRelationship != null) {
      return coerce(await adapter.getRelationship(entity, name, relationship))
    } else {
      return coerce((entity as any)[name])
    }
  }

  // #endregion

  // #region Meta

  private async injectPackMeta(pack: Pack<ID>, entity: Entity | null, context: RequestContext) {
    if (isFunction(this.config.meta)) {
      pack.meta = await this.config.meta.call(this, pack.meta, entity, context)
    } else if (this.config.meta != null) {
      Object.assign(pack.meta, this.config.meta)
    }
  }

  private async injectDocumentMeta(document: Document<ID>, entity: Entity, context: RequestContext) {
    if (isFunction(this.config.documentMeta)) {
      document.meta = await this.config.documentMeta.call(this, document.meta, entity, context)
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

  public async list(params: ListParams, getAdapter: () => Adapter<Entity, Query, ID>, context: RequestContext, options: ListActionOptions = {}): Promise<Pack<ID>> {
    if (this.config.list === false) {
      throw new APIError(405, `Action \`list\` not available`)
    }
    if (this.config.list != null) {
      return await this.config.list.call(this, params, getAdapter, context, options)
    }

    if (params.limit == null && this.config.forcePagination) {
      params.limit = this.pageSize
    }

    const {
      totals = this.config.totals ?? true,
      include = [],
      detail = false,
    } = options

    const adapter = getAdapter()
    const query = await this.listQuery(adapter, params, context)
    const response = await adapter.list(query, params, {totals})

    return await this.collectionPack(
      response.data,
      response.included,
      params.offset,
      response.total,
      adapter,
      context,
      {include, detail},
    )
  }

  public async show(locator: DocumentLocator<ID>, getAdapter: () => Adapter<Entity, Query, ID>, context: RequestContext, options: ShowActionOptions = {}): Promise<Pack<ID>> {
    if (this.config.show === false) {
      throw new APIError(405, `Action \`show\` not available`)
    }
    if (this.config.show != null) {
      return await this.config.show.call(this, locator, getAdapter, context, options)
    }

    const {
      include = [],
      detail = true,
    } = options

    const adapter = getAdapter()
    const response = await this.load(locator, adapter, context)
    
    return await this.documentPack(
      response.data,
      response.included,
      adapter,
      context,
      {include, detail},
    )
  }

  public async create(requestPack: Pack<ID>, getAdapter: () => Adapter<Entity, Query, ID>, context: RequestContext, options: CreateActionOptions = {}): Promise<Pack<ID>> {
    if (this.config.create === false) {
      throw new APIError(405, `Action \`show\` not available`)
    }
    if (this.config.create != null) {
      return await this.config.create.call(this, requestPack, getAdapter, context, options)
    }

    const document = this.extractRequestDocument(requestPack, null)
    const adapter = getAdapter()

    const response = await adapter.create(async entity => {
      await this.setAttributes(entity, document, true, adapter, context)
      await this.config.scope?.ensure.call(this, entity, context)
    }, options)
    return await this.documentPack(response.data, undefined, adapter, context, options)
  }

  public async replace(id: ID, requestPack: Pack<ID>, getAdapter: () => Adapter<Entity, Query, ID>, context: RequestContext, options: ReplaceActionOptions = {}): Promise<Pack<ID>> {
    if (this.config.replace === false) {
      throw new APIError(405, `Action \`replace\` not available`)
    }
    if (this.config.replace != null) {
      return await this.config.replace.call(this, id, requestPack, getAdapter, context, options)
    }

    const adapter = getAdapter()
    const document = this.extractRequestDocument(requestPack, id)
    
    // Run a loadInstance just to make sure the entity exists.
    await this.load({id}, adapter, context)

    // Continue with a fresh entity.
    const response = await adapter.replace(id, async entity => {
      await this.setAttributes(entity, document, false, adapter, context)
      await this.config.scope?.ensure.call(this, entity, context)
    }, options)
    return await this.documentPack(response.data, undefined, adapter, context, options)
  }

  public async update(id: ID, requestPack: Pack<ID>, getAdapter: () => Adapter<Entity, Query, ID>, context: RequestContext, options: UpdateActionOptions = {}): Promise<Pack<ID>> {
    if (this.config.update === false) {
      throw new APIError(405, `Action \`update\` not available`)
    }
    if (this.config.update != null) {
      return await this.config.update.call(this, id, requestPack, getAdapter, context, options)
    }

    const adapter = getAdapter()
    const document = this.extractRequestDocument(requestPack, id)
    const response = await adapter.update(id, async entity => {
      await this.setAttributes(entity, document, false, adapter, context)
      await this.config.scope?.ensure.call(this, entity, context)
    }, options)
    return await this.documentPack(response.data, undefined, adapter, context, options)
  }

  public async delete(requestPack: Pack<ID>, getAdapter: () => Adapter<Entity, Query, ID>, context: RequestContext): Promise<Pack<ID>> {
    if (this.config.delete === false) {
      throw new APIError(405, `Action \`delete\` not available`)
    }
    if (this.config.delete != null) {
      return await this.config.delete.call(this, requestPack, getAdapter, context)
    }

    const adapter = getAdapter()
    const selector = this.extractBulkSelector(requestPack, context)
    const query = await this.bulkSelectorQuery(adapter, selector, context)
    const entitiesOrIDs = await adapter.delete(query, {})

    const linkages = entitiesOrIDs.map(it => this.jsonAPI.toLinkage(it, this.type))
    const pack = new Pack<ID>(linkages, undefined, {
      deletedCount: linkages.length,
    })
    return pack
  }

  public async collectionPack(entities: Entity[], includedModels: Entity[] | undefined, offset: number | undefined, total: number | undefined, adapter: Adapter<Entity, Query, ID> | undefined, context: RequestContext, options: CollectionPackOptions<Entity, any> = {}) {
    const {
      include = [],
      detail = true,
      meta = {},
    } = options
    include.push(...this.getAutoIncludes(detail))

    const collection = await this.entitiesToCollection(entities, adapter, context, {detail})

    const included = await this.resolveIncluded(collection.documents, includedModels, context, {include, detail})
    const pack = new Pack<ID>(collection, included, meta)
    await this.injectPaginationMeta(pack, offset, total, context)
    await this.injectPackMeta(pack, null, context)

    return pack
  }

  public async documentPack(entity: Entity, includedModels: Entity[] | undefined, adapter: Adapter<Entity, Query, ID> | undefined, context: RequestContext, options: DocumentPackOptions<Entity, any> = {}) {
    const {
      include = [],
      detail = true,
      meta = {},
    } = options
    include.push(...this.getAutoIncludes(detail))

    const document = await this.entityToDocument(entity, adapter, context, {detail})

    const included = await this.resolveIncluded([document], includedModels, context, {include, detail})
    await this.injectDocumentMeta(document, entity, context)

    const pack = new Pack<ID>(document, included, meta)
    await this.injectPackMeta(pack, entity, context)

    return pack
  }

  private async resolveIncluded(base: Document<ID>[], includedModels: Entity[] | undefined, context: RequestContext, options: RetrievalActionOptions): Promise<Collection<ID> | undefined> {
    const collector = new IncludeCollector(this.jsonAPI, context)
    const documents =
      includedModels != null ? await collector.wrap(includedModels) :
        options.include != null ? await collector.collect(base, options.include) :
          []

    return new Collection(documents)
  }

  public async load(locator: DocumentLocator<ID>, adapter: Adapter<Entity, Query, ID>, context: RequestContext): Promise<LoadResponse<Entity>> {
    const query = await this.listQuery(adapter, {}, context)
    if ('singleton' in locator) {
      const singleton = this.config.singletons?.[locator.singleton]
      if (singleton == null) {
        throw new APIError(404, `Singleton \`${locator.singleton}\` (of ${this.type}) not found`)
      }
  
      const response = await singleton.call(this, query, context)
      if (response.data == null) {
        throw new APIError(404, `Singleton \`${locator.singleton}\` (of ${this.type}) not found`)
      }
  
      return response as GetResponse<Entity> & {data: Entity}
    } else {
      const response = await adapter.get(query, locator.id)
      if (response.data == null) {
        throw new APIError(404, `Resource \`${this.type}\` with ID \`${locator.id}\` not found`)
      }

      return response as GetResponse<Entity> & {data: Entity}
    }
  }

  // #endregion

  // #region Custom actions

  public async callCollectionAction(name: string, requestPack: Pack<ID>, getAdapter: () => Adapter<Entity, Query, ID>, context: RequestContext) {
    const action = this.config.collectionActions?.[name]
    if (action == null) {
      throw new APIError(404, `Collection action \`${this.type}::${name}\` not found`)
    }

    const handler = isFunction(action) ? action : action.handler
    return await handler.call(this, requestPack, getAdapter, context)
  }

  public async callDocumentAction(name: string, locator: DocumentLocator<ID>, requestPack: Pack<ID>, getAdapter: () => Adapter<Entity, Query, ID>, context: RequestContext) {
    const action = this.config.documentActions?.[name]
    if (action == null) {
      throw new APIError(404, `Document action \`${this.type}::${name}\` not found`)
    }

    const handler = isFunction(action) ? action : action.handler
    return await handler.call(this, locator, requestPack, getAdapter, context)
  }

  public get collectionActions() {
    return this.config.collectionActions ?? {}
  }

  public get documentActions() {
    return this.config.documentActions ?? {}
  }

  // #endregion

  // #region Serialization
  
  public async entitiesToCollection(entities: Entity[], adapter: Adapter<Entity, Query, ID> | undefined, context: RequestContext, options: ModelsToCollectionOptions = {}): Promise<Collection<ID>> {
    const {
      detail = false,
    } = options

    const documents = await Promise.all(entities.map(entity => {
      return this.entityToDocument(entity, adapter, context, {detail})
    }))
    return new Collection(documents)
  }

  public async entityToDocument(entity: Entity, adapter: Adapter<Entity, Query, ID> | undefined, context: RequestContext, options: ModelToDocumentOptions = {}): Promise<Document<ID>> {
    const {
      detail = true,
    } = options

    const id = await this.getAttributeValue(entity, this.config.idAttribute ?? 'id', {}, adapter, context)

    const attributes = await this.getAttributes(entity, detail, adapter, context)
    const relationships = await this.getRelationships(entity, detail, adapter, context)

    const document = new Document(this, id, attributes, relationships)
    await this.injectDocumentMeta(document, entity, context)
    Object.assign(document.meta, options.meta ?? {})
    return document
  }
  
  // #endregion

  // #region Request extracters

  public extractRequestDocument(pack: Pack<ID>, endpointID: ID): Document<ID> & {id: string}
  public extractRequestDocument(pack: Pack<ID>, endpointID: null): Document<ID>
  public extractRequestDocument(pack: Pack<ID>, endpointID: ID | null): Document<ID>
  public extractRequestDocument(pack: Pack<ID>, endpointID: ID | null): Document<ID> {
    const document = pack.data

    if (document == null) {
      throw new APIError(400, "No document sent")
    }
    if (!(document instanceof Document)) {
      throw new APIError(400, "Expected Document")
    }
    if (endpointID != null && document.id == null) {
      throw new APIError(400, "Document ID required")
    }
    if (endpointID != null && `${document.id}` !== `${endpointID}`) {
      throw new APIError(409, "Document ID does not match endpoint ID")
    }
    if (document.resource.type !== this.type) {
      throw new APIError(409, "Document type does not match endpoint type")
    }

    return document
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

    return {offset, limit: limit ?? null}
  }

  public extractDocumentLocator(context: RequestContext, singleton: false): {id: ID}
  public extractDocumentLocator(context: RequestContext, singleton?: boolean): DocumentLocator<ID>
  public extractDocumentLocator(context: RequestContext, singleton: boolean = true): DocumentLocator<ID> {
    const id = context.param('id', z.string())
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
      if (!Linkage.is<string | number>(linkage)) {
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

const labelParam = z.string().optional()
const filterParam = z.record(z.string(), z.any()).default(() => ({}))
const searchParam = z.string().optional()
const sortParam = z.string().optional()
const offsetParam = z.number().int().default(0)
const limitParam = z.number().int().optional()

export interface LoadResponse<M> {
  data:      M
  included?: M[]
}
