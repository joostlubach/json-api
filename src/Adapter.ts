import Collection from './Collection'
import Document from './Document'
import Pack from './Pack'
import {
  ActionOptions,
  BulkSelector,
  ListParams,
  Meta,
  ResourceLocator,
  RetrievalActionOptions,
} from './types'

export default interface Adapter {

  list(params: ListParams, options: RetrievalActionOptions): Promise<Pack>
  get(locator: ResourceLocator, options: RetrievalActionOptions): Promise<Pack>
  create(document: Document, meta: Meta, options: ActionOptions): Promise<Pack>
  update(locator: ResourceLocator, document: Document, meta: Meta, options: ActionOptions): Promise<Pack>
  delete(selector: BulkSelector): Promise<Pack>
  listRelated(locator: ResourceLocator, relationship: string, params: ListParams, options: RetrievalActionOptions): Promise<Pack>
  getRelated(locator: ResourceLocator, relationship: string, options: RetrievalActionOptions): Promise<Pack>

  modelToDocument(model: any, options?: ModelToDocumentOptions): Promise<Document>
  modelsToCollection(models: any[], options?: ModelsToCollectionOptions): Promise<Collection>

}

export interface ModelToDocumentOptions {
  detail?: boolean
}

export interface ModelsToCollectionOptions {
  detail?: boolean
}
