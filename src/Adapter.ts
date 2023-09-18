import Document from './Document'
import Pack from './Pack'
import {
  BulkSelector,
  DeleteActionOptions,
  ListParams,
  ResourceLocator,
  RetrievalActionOptions,
  UpdateActionOptions,
} from './types'

export default interface Adapter {

  list(params: ListParams, options: RetrievalActionOptions): Promise<Pack>
  get(locator: ResourceLocator, options: RetrievalActionOptions): Promise<Pack>
  create(document: Document, pack: Pack, options: UpdateActionOptions): Promise<Pack>
  update(locator: ResourceLocator, document: Document, pack: Pack, options: UpdateActionOptions): Promise<Pack>
  delete(selector: BulkSelector, options: DeleteActionOptions): Promise<Pack>
  listRelated(locator: ResourceLocator, relationship: string, params: ListParams, options: RetrievalActionOptions): Promise<Pack>
  getRelated(locator: ResourceLocator, relationship: string, options: RetrievalActionOptions): Promise<Pack>

}
