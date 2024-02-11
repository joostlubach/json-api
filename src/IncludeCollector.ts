import { flatMap, MapBuilder } from 'ytil'

import Document from './Document'
import JSONAPI from './JSONAPI'
import RequestContext from './RequestContext'
import { Linkage, Relationship } from './types'

export default class IncludeCollector<Model, Query, ID> {

  constructor(
    private readonly jsonAPI: JSONAPI<Model, Query, ID>,
    private readonly context: RequestContext
  ) {}

  private readonly collected = new Map<string, ID[]>()

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
    const linkages = flatMap(relationships, it => it.data == null ? [] : it.data)

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

      const adapter = this.jsonAPI.adapter(resource, this.context)
      let ids = linkages.map(it => it.id)

      // Remove any already collected IDs.
      ids = ids.filter(it => !this.collected.get(type)?.includes(it))      
      
      const query = await resource.applyFilters(adapter.query(), {id: ids}, adapter, this.context)
      for (const model of await adapter.list(query, {}, {totals: false})) {
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