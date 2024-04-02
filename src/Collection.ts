import Document from './Document'
import ResourceRegistry from './ResourceRegistry'

export default class Collection<ID> {

  constructor(documents: Document<ID>[] = []) {
    this.documents = documents
  }

  public documents: Document<ID>[]

  public get length(): number {
    return this.documents.length
  }

  public add(...documents: Document<ID>[]): void
  public add(collection: Collection<ID>): void
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

  public static deserialize<M, Q, I>(registry: ResourceRegistry<M, Q, I>, objects: any[]): Collection<I> {
    const documents = objects.map(obj => Document.deserialize<M, Q, I>(registry, obj))
    return new Collection(documents)
  }

  public [Symbol.iterator]() {
    return this.documents[Symbol.iterator]()
  }

}
