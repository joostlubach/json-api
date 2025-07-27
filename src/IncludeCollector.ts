import { MapBuilder } from 'ytil'

import Document from './Document'
import JSONAPI from './JSONAPI'
import RequestContext from './RequestContext'
import { Linkage, ModelToDocumentOptions, Relationship } from './types'

export default class IncludeCollector<Model, Query, ID> {

  constructor(
    private readonly jsonAPI: JSONAPI<Model, Query, ID>,
    private readonly context: RequestContext
  ) {}

  private readonly collected = new Map<string, ID[]>()

  /**
   * Wraps a bunch of models of different resource types and converts them to a list of documents.
   */
  public async wrap(models: Model[], options: ModelToDocumentOptions = {}) {
    const byResource = MapBuilder.groupBy(models, model => {
      const name = this.jsonAPI.nameForModel(model)
      return this.jsonAPI.registry.resourceForModel(name)
    })

    const collected: Document<ID>[] = []
    for (const [resource, models] of byResource) {
      const adapter = this.jsonAPI.adapter(resource, this.context)
      const documents = await Promise.all(models.map(model => (
        resource.modelToDocument(model, adapter, this.context, options)
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
    collected.push(...documents)

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
      let ids = linkages.map(it => it.id)

      // Remove any already collected IDs.
      ids = ids.filter(it => !this.collected.get(type)?.includes(it))      
      
      const query = await resource.applyFilters(adapter.query(), {id: ids}, adapter, this.context)
      const response = await adapter.list(query, {}, {totals: false})
      for (const model of response.data) {
        const document = await resource.modelToDocument(model, adapter, this.context)
        documents.push(document)
      }
    }

    return documents
  }

  private markCollected(documents: Document<ID>[]) {
    for (const doc of documents) {
      if (doc.id == null) { continue }

      const ids = MapBuilder.setDefault(this.collected, doc.resource.type, [])
      ids.push(doc.id)
    }
  }

}
