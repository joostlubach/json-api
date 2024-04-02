import { context, mockJSONAPI } from './mock'

import { expectAsyncError } from 'yest'

import APIError from '../APIError'
import Pack from '../Pack'
import db from './db'

describe("create", () => {

  const jsonAPI = mockJSONAPI()

  beforeEach(() => {
    jsonAPI.registry.modify('parents', cfg => {
      cfg.attributes.age = {detail: true}
    })
  })

  it("should allow creating a document", async () => {
    const requestPack = jsonAPI.documentRequestPack('parents', null, {
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
    const requestPack = jsonAPI.documentRequestPack('children', null, {
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

  it("should not allow specifying an unconfigured attribute", async () => {
    const requestPack = jsonAPI.documentRequestPack('parents', null, {
      name:    "Alice",
      hobbies: ["soccer", "piano"],
    })

    await expectAsyncError(() => (
      jsonAPI.create('parents', requestPack, context('create'))
    ), APIError, error => {
      expect(error.status).toEqual(403)
    })

    expect(db('parents').get('alice')).toBeNull()
  })

  it("should not allow specifying an unavailable attribute", async () => {
    jsonAPI.registry.modify('parents', cfg => {
      cfg.attributes.age = {if: () => false}
    })

    const requestPack = jsonAPI.documentRequestPack('parents', null, {
      name: "Alice",
      age:  40,
    })

    await expectAsyncError(() => (
      jsonAPI.create('parents', requestPack, context('create'))
    ), APIError, error => {
      expect(error.status).toEqual(403)
    })

    expect(db('parents').get('alice')).toBeNull()
  })

  it("should not allow specifying a read-only attribute", async () => {
    jsonAPI.registry.modify('parents', cfg => {
      cfg.attributes.age = {writable: false}
    })

    const requestPack = jsonAPI.documentRequestPack('parents', null, {
      name: "Alice",
      age:  40,
    })

    await expectAsyncError(() => (
      jsonAPI.create('parents', requestPack, context('create'))
    ), APIError, error => {
      expect(error.status).toEqual(403)
    })

    expect(db('parents').get('alice')).toBeNull()
  })

  it("should allow specifying a writable-on-create attribute", async () => {
    jsonAPI.registry.modify('parents', cfg => {
      cfg.attributes.age = {writable: 'create'}
    })

    const requestPack = jsonAPI.documentRequestPack('parents', null, {
      name: "Alice",
      age:  40,
    })

    await jsonAPI.create('parents', requestPack, context('create'))
    expect(db('parents').get('alice')).toEqual({
      id:   'alice',
      name: "Alice",
      age:  40,
    })
  })

  it("should allow specifying an explicit ID", async () => {
    jsonAPI.registry.modify('parents', cfg => {
      cfg.attributes.age = {writable: 'create'}
    })

    const requestPack = jsonAPI.documentRequestPack('parents', 'ALICE', {
      name: "Alice",
      age:  40,
    })

    await jsonAPI.create('parents', requestPack, context('create'))
    expect(db('parents').get('ALICE')).toEqual({
      id:   "ALICE",
      name: "Alice",
      age:  40,
    })
  })

})
