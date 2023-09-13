import Document from './Document'
import Pack from './Pack'
import { ActionOptions, BulkSelector, ListParams, ResourceLocator } from './types'

export default interface Adapter {

  count(params: ListParams, options: ActionOptions): Promise<number>
  list(params: ListParams, options: ActionOptions): Promise<Pack>
  get(locator: ResourceLocator, options: ActionOptions): Promise<Pack>
  create(document: Document, pack: Pack, options: ActionOptions): Promise<Pack>
  update(document: Document, pack: Pack, options: ActionOptions): Promise<Pack>
  delete(selector: BulkSelector, options: ActionOptions): Promise<Pack>

  listRelated(locator: ResourceLocator, relationship: string, params: ListParams, options: ActionOptions): Promise<Pack>
  getRelated(locator: ResourceLocator, relationship: string, options: ActionOptions): Promise<Pack>

}
