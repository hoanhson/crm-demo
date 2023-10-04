import {
  Allow,
  BackendMethod,
  Entity,
  Field,
  Fields,
  Relations,
  remult,
  repo
} from 'remult'
import { AccountManager } from '../AccountManagers/AccountManager.entity'
import { Company } from '../Companies/Company.entity'
import { Contact } from '../Contacts/Contact.entity'

@Entity('deals', {
  allowApiCrud: Allow.authenticated
})
export class Deal {
  @Fields.uuid()
  id?: string
  @Fields.string()
  name = ''
  @Relations.toOne(() => Company, { defaultIncluded: true })
  company!: Company
  @Fields.string()
  type = ''
  @Fields.string()
  stage = ''
  @Fields.string()
  description = ''
  @Fields.integer()
  amount = 0
  @Fields.date()
  createdAt = new Date()
  @Fields.date()
  updatedAt = new Date()
  @Relations.toOne(() => AccountManager)
  accountManager?: AccountManager
  @Fields.integer()
  index = 0
  @Relations.toMany(() => DealContact)
  contacts?: DealContact[]

  @BackendMethod({ allowed: Allow.authenticated })
  static async DealDroppedOnKanban(
    dealId: string,
    stage: string,
    onDealId: string | undefined
  ) {
    const dealRepo = remult!.repo(Deal)
    const deal = await dealRepo.findId(dealId)
    const origList = await dealRepo.find({
      where: { stage: deal.stage },
      orderBy: { index: 'asc' }
    })
    let targetList = origList
    if (deal.stage !== stage) {
      targetList = await (
        await dealRepo.find({ where: { stage }, orderBy: { index: 'asc' } })
      ).filter((d) => d.id !== deal.id)
      deal.stage = stage
    }
    Deal.organizeLists({ dealId, stage, onDealId, origList, targetList })
    let i = 0
    for (const deal of targetList) {
      deal.index = i++
      await dealRepo.save(deal)
    }
    if (targetList !== origList) {
      i = 0
      for (const deal of origList) {
        deal.index = i++
        await dealRepo.save(deal)
      }
    }
  }
  static organizeLists({
    dealId,
    onDealId,
    stage,
    origList,
    targetList
  }: {
    dealId: string
    stage: string
    onDealId: string | undefined
    origList: Deal[]
    targetList: Deal[]
  }) {
    if (dealId === onDealId) return
    const deal = origList.find((d) => d.id === dealId)!
    deal.stage = stage
    const origIndex = origList.findIndex((d) => d.id === deal.id)
    origList.splice(origIndex, 1)
    if (!onDealId) {
      targetList.push(deal)
    } else {
      let insertAt = targetList.findIndex((d) => d.id === onDealId)
      if (insertAt >= origIndex && origList === targetList) insertAt++
      targetList.splice(insertAt, 0, deal)
    }
  }
  @BackendMethod({ allowed: Allow.authenticated })
  async saveWithContacts?(contacts: string[]) {
    const isNew = !this.id
    console.log('#### 0')
    const deal = await repo(Deal).save(this)
    console.log('#### 1')
    const dealContactRepo = repo(Deal).relations(deal).contacts
    const existingContacts = isNew
      ? []
      : await dealContactRepo.find({
          include: {
            contact: false
          }
        })
    const contactsToDelete = existingContacts.filter(
      (c) => !contacts.includes(c.contactId)
    )
    const contactsToAdd = contacts.filter(
      (c) => !existingContacts.find((e) => e.contactId == c)
    )
    console.log('#### 2', {
      existingContacts,
      contactsToDelete,
      contactsToAdd
    })
    await Promise.all(contactsToDelete.map((dc) => dealContactRepo.delete(dc)))
    await dealContactRepo.insert(
      contactsToAdd.map((contactId) => ({ contactId }))
    )
  }
}

@Entity<DealContact>('dealContacts', {
  allowApiCrud: Allow.authenticated,
  id: { deal: true, contactId: true }
})
export class DealContact {
  @Relations.toOne(() => Deal)
  deal!: Deal
  @Relations.toOne<DealContact, Contact>(() => Contact, 'contactId')
  contact!: Contact
  @Fields.string({ dbName: 'contact' })
  contactId!: string
}
