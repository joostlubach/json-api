import { context, mockJSONAPI } from './mock'

import { expectAsyncError } from 'yest'

import APIError from '../APIError'
import Pack from '../Pack'
import db from './db'

describe("create", () => {

  const jsonAPI = mockJSONAPI()

  it("should allow creating a document", async () => {
    const requestPack = jsonAPI.documentPack('parents', null, {
      name: "Alice",
      age:  30,
    })

    const pack = await jsonAPI.create('parents', requestPack, context('create'))
    expect(pack.serialize()).toEqual({
      data: {
        type: 'parents',
        id:   'alice',

        attributes: {
          name: "Alice",
          age:  30,
        },
        relationships: {
          spouse:   {data: null},
          children: {data: []},
        },
      },
      included: [],
      meta:     {},
    })

    expect(db('parents').get('alice')).toEqual({
      id:   'alice',
      name: "Alice",
      age:  30,
    })
  })

  it("should not accept a mismatch between pack type and document", async () => {
    const requestPack = jsonAPI.documentPack('children', null, {
      name: "Eve",
      age:  10,
    })

    await expectAsyncError(() => (
      jsonAPI.create('parents', requestPack, context('create'))
    ), APIError, error => {
      expect(error.status).toEqual(409)
    })

    expect(db('parents').get('alice')).toBeNull()
    expect(db('children').get('alice')).toBeNull()
  })

  it("should not accept an array for data", async () => {
    await expectAsyncError(() => (
      jsonAPI.create('parents', Pack.deserialize(jsonAPI.registry, {
        data: [],
      }), context('create'))
    ), APIError, error => {
      expect(error.status).toEqual(400)
    })
  })

  it.todo("should not allow specifying an unconfigured attribute")
  it.todo("should not allow specifying an unavailable attribute")
  it.todo("should not allow specifying an read-only attribute")
  it.todo("should allow specifying an read-only-except-on-write attribute")
  it.todo("should allow specifying an explicit ID")

})