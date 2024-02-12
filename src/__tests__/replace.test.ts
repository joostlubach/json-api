import { context, mockJSONAPI } from './mock'

import { expectAsyncError } from 'yest'

import APIError from '../APIError'
import Pack from '../Pack'
import db from './db'

describe("replace", () => {

  const jsonAPI = mockJSONAPI()

  beforeEach(() => {
    db.seed()
  })

  it("should allow replacing a document", async () => {
    const requestPack = jsonAPI.documentPack('parents', 'alice', {
      name: "Alice",
      age:  40,
    })

    const pack = await jsonAPI.replace('parents', requestPack, context('replace'))
    expect(pack.serialize()).toEqual({
      data: {
        type: 'parents',
        id:   'alice',

        attributes: {
          name: "Alice",
          age:  40,
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
      age:  40,
    })
  })

  it("should not update, but replace fully", async () => {
    const requestPack = jsonAPI.documentPack('parents', 'alice', {name: "Alice"})
    await jsonAPI.replace('parents', requestPack, context('replace'))

    expect(db('parents').get('alice')).toEqual({
      id:   'alice',
      name: "Alice",
      age:  undefined,
    })
  })

  it("should not allow replacing a document that does not exist", async () => {
    const requestPack = jsonAPI.documentPack('parents', 'zachary', {})
    await expectAsyncError(() => (
      jsonAPI.replace('parents', requestPack, context('replace'))
    ), APIError, error => {
      expect(error.status).toEqual(404)
    })
  })

  it("should not accept a mismatch between pack type and document", async () => {
    const requestPack = jsonAPI.documentPack('children', 'alice', {})
    await expectAsyncError(() => (
      jsonAPI.replace('parents', requestPack, context('replace'))
    ), APIError, error => {
      expect(error.status).toEqual(409)
    })
  })

  it("should not accept an array for data", async () => {
    await expectAsyncError(() => (
      jsonAPI.replace('parents', Pack.deserialize(jsonAPI.registry, {
        data: [],
      }), context('replace'))
    ), APIError, error => {
      expect(error.status).toEqual(400)
    })
  })

})