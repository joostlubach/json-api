import { expectAsyncError } from 'yest'

import APIError from '../APIError.js'
import db from './db.js'
import { context, mockJSONAPI } from './mock.js'

describe("delete", () => {

  const jsonAPI = mockJSONAPI()

  beforeEach(() => {
    db.seed()
  })

  it("should allow deleting a document", async () => {
    const requestPack = jsonAPI.bulkSelectorPack('parents', ['alice'])

    const pack = await jsonAPI.delete('parents', requestPack, context('delete'))
    expect(pack.serialize()).toEqual({
      data: [
        {type: 'parents', id: 'alice'},
      ],
      included: [],
      meta:     {
        deletedCount: 1,
      },
    })

    expect(db('parents').ids()).toEqual(['bob', 'eve', 'frank'])
  })

  it("should allow deleting multiple documents by ID", async () => {
    const requestPack = jsonAPI.bulkSelectorPack('parents', ['alice', 'bob'])

    const pack = await jsonAPI.delete('parents', requestPack, context('delete'))
    expect(pack.serialize()).toEqual({
      data: [
        {type: 'parents', id: 'alice'},
        {type: 'parents', id: 'bob'},
      ],
      included: [],
      meta:     {
        deletedCount: 2,
      },
    })

    expect(db('parents').ids()).toEqual(['eve', 'frank'])
  })

  it("should allow deleting multiple documents by filters", async () => {
    const requestPack = jsonAPI.bulkSelectorPack('parents', {
      age: (age: number) => age > 40,
    })

    const pack = await jsonAPI.delete('parents', requestPack, context('delete'))
    expect(pack.serialize()).toEqual({
      data: [
        {type: 'parents', id: 'eve'},
        {type: 'parents', id: 'frank'},
      ],
      included: [],
      meta:     {
        deletedCount: 2,
      },
    })

    expect(db('parents').ids()).toEqual(['alice', 'bob'])
  })

  it("should allow deleting multiple documents by search", async () => {
    jsonAPI.registry.modify('parents', cfg => {
      cfg.search = (query, term) => ({
        ...query,
        filters: {
          ...query.filters,
          name: (name: string) => name.includes(term),
        },
      })
    })

    const requestPack = jsonAPI.bulkSelectorPack('parents', 'e')

    const pack = await jsonAPI.delete('parents', requestPack, context('delete'))
    expect(pack.serialize()).toEqual({
      data: [
        {type: 'parents', id: 'alice'},
        {type: 'parents', id: 'eve'},
      ],
      included: [],
      meta:     {
        deletedCount: 2,
      },
    })

    expect(db('parents').ids()).toEqual(['bob', 'frank'])
  })

  it("should silently allow deleting documents that does not exist, but not report them as deleted", async () => {
    const requestPack = jsonAPI.bulkSelectorPack('parents', ['yves', 'zachary'])
    const pack = await jsonAPI.delete('parents', requestPack, context('delete'))
    expect(pack.data).toEqual([])
    expect(pack.meta).toEqual({deletedCount: 0})
    expect(db('parents').ids()).toEqual(['alice', 'bob', 'eve', 'frank'])
  })

  it("should not accept a mismatch between pack type and document", async () => {
    const requestPack = jsonAPI.bulkSelectorPack('children', ['alice'])
    await expectAsyncError(() => (
      jsonAPI.delete('parents', requestPack, context('delete'))
    ), APIError, error => {
      expect(error.status).toEqual(409)
    })
    expect(db('parents').ids()).toEqual(['alice', 'bob', 'eve', 'frank'])
  })

})
