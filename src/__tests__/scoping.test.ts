
import { context, mockJSONAPI } from './mock'

import db from './db'

describe("scoping", () => {

  const jsonAPI = mockJSONAPI()

  beforeEach(() => {
    db.seed()
  })

  describe.each([
    {action: 'list', call: () => jsonAPI.list('children', {filters: {id: 'charlie'}}, context('list'), {})},
    {action: 'show', call: () => jsonAPI.show('children', {id: 'charlie'}, context('show'), {})},
    {action: 'delete', call: () => jsonAPI.delete('children', jsonAPI.bulkSelectorPack('children', {id: 'charlie'}), context('show'))},
  ])("$action", ({call}) => {

    it.todo("should only consider data from the current scope")

  })

  describe.each([
    {action: 'create', call: () => jsonAPI.list('children', {filters: {id: 'alice'}}, context('list'), {})},
    {action: 'replace', call: () => jsonAPI.show('children', {id: 'alice'}, context('show'), {})},
    {action: 'update', call: () => jsonAPI.show('children', {id: 'alice'}, context('show'), {})},
  ])("$action", ({action, call}) => {

    if (action !== 'update') {
      it.todo("should apply scope filters")
      it.todo("should apply defaults")
    }

    it.todo("should overwrite any maliciously added data to break out of the scope")

  })


})