import Document from './Document'
import Pack from './Pack'
import {
  ActionOptions,
  BulkSelector,
  ListParams,
  ResourceLocator,
  RetrievalActionOptions,
} from './types'

export default interface Adapter {

  list(params: ListParams, options: RetrievalActionOptions): Promise<Pack>
  get(locator: ResourceLocator, options: RetrievalActionOptions): Promise<Pack>
  create(document: Document, pack: Pack, options: ActionOptions): Promise<Pack>
  update(locator: ResourceLocator, document: Document, pack: Pack, options: ActionOptions): Promise<Pack>
  delete(selector: BulkSelector): Promise<Pack>
  listRelated(locator: ResourceLocator, relationship: string, params: ListParams, options: RetrievalActionOptions): Promise<Pack>
  getRelated(locator: ResourceLocator, relationship: string, options: RetrievalActionOptions): Promise<Pack>

}
