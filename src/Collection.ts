import Document from './Document'
import ResourceRegistry from './ResourceRegistry'

export default class Collection {

  constructor(documents: Document[] = []) {
    this.documents = documents
  }

  public documents: Document[]

  public get length(): number {
    return this.documents.length
  }

  public add(...documents: Document[]): void
  public add(collection: Collection): void
  public add(...args: any[]) {
    if (args.length === 1 && args[0] instanceof Collection) {
    this.documents.push(...args[0].documents)
    } else {
      this.documents.push(...args)
    }
  }

  public serialize(): any[] {
    return this.documents.map(doc => doc.serialize())
  }

  public static deserialize(registry: ResourceRegistry, objects: any[]): Collection {
    const documents = objects.map(obj => Document.deserialize(registry, obj, false))
    return new Collection(documents)
  }

  public [Symbol.iterator]() {
    return this.documents[Symbol.iterator]()
  }

}