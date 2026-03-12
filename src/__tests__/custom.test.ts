import { isPlainObject } from 'lodash'
import { vi } from 'vitest'
import Pack from '../Pack'
import RequestContext from '../RequestContext'
import Resource from '../Resource'
import db, { Entity, Query } from './db'
import { context, MockAdapter, mockJSONAPI } from './mock'

describe("custom actions", () => {

  const jsonAPI = mockJSONAPI()
  let handler: ReturnType<typeof vi.fn>

  beforeEach(() => {
    db.seed()

    handler = vi.fn()

    jsonAPI.registry.modify('parents', cfg => {
      cfg.collectionActions = {
        test: handler,
      }

      cfg.documentActions = {
        test: handler,
      }
    })
  })

  describe("overriding common actions", () => {

    let handler: ReturnType<typeof vi.fn>
    let requestPack: Pack<string>
    let responsePack: Pack<string>
    
    beforeEach(() => {
      handler = vi.fn()
      jsonAPI.registry.modify('parents', cfg => {
        cfg.list = handler
        cfg.show = handler
        cfg.create = handler
        cfg.replace = handler
        cfg.update = handler
        cfg.delete = handler
      })

      requestPack = new Pack<string>('request')
      responsePack = new Pack<string>('response')
      
      handler.mockImplementation(function (this: Resource<Entity, Query, string>, ...args) {
        if (isPlainObject(args[args.length - 1])) {
          args.pop()
        }
        const context = args.pop()
        const adapter = args.pop()

        expect(this).toBe(jsonAPI.registry.get('parents'))
        expect(context).toBeInstanceOf(RequestContext)
        expect(adapter()).toBeInstanceOf(MockAdapter)
        
        return responsePack
      })
    })

    it("should override list", async () => {
      const ctx = context('custom:list')
      const pack = await jsonAPI.list('parents', ctx)
      expect(handler).toHaveBeenCalledTimes(1)
      expect(handler).toHaveBeenCalledWith(expect.any(Function), ctx, {})
      expect(pack).toBe(responsePack)
    })

    it("should override show", async () => {
      const ctx = context('custom:show')
      const pack = await jsonAPI.show('parents', {id: 'alice'}, ctx)
      expect(handler).toHaveBeenCalledTimes(1)
      expect(handler).toHaveBeenCalledWith({id: 'alice'}, expect.any(Function), ctx, {})
      expect(pack).toBe(responsePack)
    })

    it("should override replace", async () => {
      const ctx = context('custom:replace')
      const pack = await jsonAPI.replace('parents', 'alice', requestPack, ctx)
      expect(handler).toHaveBeenCalledTimes(1)
      expect(handler).toHaveBeenCalledWith('alice', requestPack, expect.any(Function), ctx, {})
      expect(pack).toBe(responsePack)
    })

    it("should override update", async () => {
      const ctx = context('custom:update')
      const pack = await jsonAPI.update('parents', 'alice', requestPack, ctx)
      expect(handler).toHaveBeenCalledTimes(1)
      expect(handler).toHaveBeenCalledWith('alice', requestPack, expect.any(Function), ctx, {})
      expect(pack).toBe(responsePack)
    })

    it("should override delete", async () => {
      const ctx = context('custom:delete')
      const requestPack = jsonAPI.bulkSelectorPack('parents', ['alice'])
      const pack = await jsonAPI.delete('parents', requestPack, ctx)
      expect(handler).toHaveBeenCalledTimes(1)
      expect(handler).toHaveBeenCalledWith(requestPack, expect.any(Function), ctx)
      expect(pack).toBe(responsePack)
    })

  })

  describe("collection actions", () => {

    it("should call the collection action with the pack and return the response pack", async () => {
      const requestPack = new Pack('request')
      const responsePack = new Pack('response')
      handler.mockReturnValue(responsePack)

      const testContext = context('custom:test')
      const response = await jsonAPI.collectionAction('parents', 'test', requestPack, testContext)

      expect(handler).toHaveBeenCalledTimes(1)
      expect(handler).toHaveBeenCalledWith(requestPack, expect.any(Function), testContext)
      expect(response).toBe(responsePack)
    })

    it("should provide a function that can be used to get an adapter for the resource", async () => {
      const requestPack = new Pack('request')
      handler.mockImplementation(function (this: Resource<Entity, Query, string>, pack, adapter) {
        expect(this).toBe(jsonAPI.registry.get('parents'))
        expect(adapter()).toBeInstanceOf(MockAdapter)
      })

      const testContext = context('custom:test')
      await jsonAPI.collectionAction('parents', 'test', requestPack, testContext)
    })

    it("should not allow calling an undefined action", async () => {
      await expect(
        jsonAPI.collectionAction('parents', 'doesnotexist', jsonAPI.nullPack(), context('custom:doesnotexist'))
      ).rejects.toMatchObject({ status: 404 })
    })

  })

  describe("document actions", () => {

    it("should call the document action with the pack and return the response pack", async () => {
      const requestPack = new Pack('request')
      const responsePack = new Pack('response')
      handler.mockReturnValue(responsePack)

      const testContext = context('custom:test')
      const response = await jsonAPI.documentAction('parents', {id: 'alice'}, 'test', requestPack, testContext)

      expect(handler).toHaveBeenCalledTimes(1)
      expect(handler).toHaveBeenCalledWith({id: 'alice'}, requestPack, expect.any(Function), testContext)
      expect(response).toBe(responsePack)
    })

    it("should provide a function that can be used to get an adapter for the resource", async () => {
      const requestPack = new Pack('request')
      handler.mockImplementation(function (this: Resource<Entity, Query, string>, locator, pack, adapter) {
        expect(this).toBe(jsonAPI.registry.get('parents'))
        expect(adapter()).toBeInstanceOf(MockAdapter)
      })

      const testContext = context('custom:test')
      await jsonAPI.documentAction('parents', {id: 'alice'}, 'test', requestPack, testContext)
    })

    it("should not allow calling an undefined action", async () => {
      await expect(
        jsonAPI.documentAction('parents', {id: 'alice'}, 'doesnotexist', jsonAPI.nullPack(), context('custom:doesnotexist'))
      ).rejects.toMatchObject({ status: 404 })
    })
  })

})
