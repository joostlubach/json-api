
import { context, mockJSONAPI } from './mock'


import Pack from '../Pack'
import db from './db'

describe("scoping", () => {

  const jsonAPI = mockJSONAPI()

  beforeEach(() => {
    db.seed()
  })

  describe.each([
    {action: 'list', call: () => jsonAPI.list('parents', {filters: {id: 'alice'}}, context('list'), {})},
    {action: 'show', call: () => jsonAPI.show('parents', {id: 'alice'}, context('show'), {})},
    {action: 'delete', call: () => jsonAPI.delete('parents', Pack.deserialize(jsonAPI.registry, {meta: {filters: {id: 'alice'}}}), context('show'))},
  ])("$action", ({call}) => {

    it.todo("should only consider data from the current scope")

  })

  describe.each([
    {action: 'create', call: () => jsonAPI.list('parents', {filters: {id: 'alice'}}, context('list'), {})},
    {action: 'replace', call: () => jsonAPI.show('parents', {id: 'alice'}, context('show'), {})},
    {action: 'update', call: () => jsonAPI.show('parents', {id: 'alice'}, context('show'), {})},
  ])("$action", ({action, call}) => {

    if (action !== 'update') {
      it.todo("should apply scope filters")
      it.todo("should apply defaults")
    }

    it.todo("should overwrite any maliciously added data to break out of the scope")

  })


})