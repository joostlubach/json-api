import { MapBuilder, sparse } from 'ytil'

import Document from './Document'
import JSONAPI from './JSONAPI'
import RequestContext from './RequestContext'
import { EntityToDocumentOptions, Linkage, Relationship } from './types'

export default class IncludeCollector<Entity, Query, ID> {

  constructor(
    private readonly jsonAPI: JSONAPI<Entity, Query, ID>,
    private readonly context: RequestContext,
  ) {}

  private readonly collected = new Map<string, Document<ID>[]>()

  /**
   * Wraps a bunch of models of different resource types and converts them to a list of documents.
   */
  public async wrap(models: Entity[], options: EntityToDocumentOptions = {}) {
    const byResource = MapBuilder.groupBy(models, entity => {
      const name = this.jsonAPI.nameForEntity(entity)
      return this.jsonAPI.registry.resourceForEntity(name)
    })

    const collected: Document<ID>[] = []
    for (const [resource, models] of byResource) {
      const adapter = this.jsonAPI.adapter(resource, this.context)
      const documents = await Promise.all(models.map(entity => (
        resource.entityToDocument(entity, adapter, this.context, options)
      )))
      collected.push(...documents)
    }

    return collected
  }

  /**
   * 
   * @param base The base documents to start from.
   * @param expressions The include expression.
   */
  public async collect(base: Document<ID>[], expressions: string[]) {
    const collected: Document<ID>[] = []

    // Mark all of these as collected.
    this.markCollected(base)

    for (const expression of expressions) {
      await this.collectOne(base, expression, collected)
    }

    return collected
  }

  private async collectOne(base: Document<ID>[], expression: string, collected: Document<ID>[]) {
    const [head, ...tail] = expression.split('+')

    // Find the relationships in the document and flatten to all linkages.
    const relationships = this.collectRelationships(base, head)
    const linkages = relationships.flatMap(it => it.data == null ? [] : it.data)

    // Split linkages by type (relationships can be polymorphic).
    const documents = await this.collectDocuments(linkages)

    // Add the newly collected documents to the collected array. Skip any previously collected documents.
    collected.push(...documents.filter(doc => !collected.some(other => other.id === doc.id && other.resource.type === doc.resource.type)))

    // Mark all of these as collected.
    this.markCollected(documents)

    // Drill down into the expression from here if there are more parts.
    if (tail.length > 0) {
      await this.collectOne(documents, tail.join('+'), collected)
    }
  }

  private collectRelationships(documents: Document<ID>[], name: string): Relationship<ID>[] {
    const relationships: Relationship<ID>[] = []
    for (const document of documents) {
      if (document.relationships[name] != null) {
        relationships.push(document.relationships[name])
      }
    }
    return relationships
  }

  private async collectDocuments(linkages: Linkage<ID>[]) {
    const byType = MapBuilder.groupBy(linkages, it => it.type)
    const documents: Document<ID>[] = []

    for (const [type, linkages] of byType) {
      const resource = this.jsonAPI.registry.get(type)
      if (resource == null) { continue }

      const adapter = resource.adapter(this.context)
      const allIDs = linkages.map(it => it.id)

      // Check if we have already collected some.
      const existingDocuments = sparse(allIDs.map(id => this.collected.get(type)?.find(doc => doc.id === id)))
      const newIDs = allIDs.filter(id => !existingDocuments.some(doc => doc.id === id))

      documents.push(...existingDocuments)

      const query = await resource.applyFilters(adapter.query(), {id: newIDs}, adapter, this.context)
      const response = await adapter.list(query, {}, {totals: false})
      for (const entity of response.data) {
        const document = await resource.entityToDocument(entity, adapter, this.context)
        documents.push(document)
      }
    }

    return documents
  }

  private markCollected(documents: Document<ID>[]) {
    for (const doc of documents) {
      if (doc.id == null) { continue }

      const ids = MapBuilder.setDefault(this.collected, doc.resource.type, [])
      ids.push(doc)
    }
  }

}
