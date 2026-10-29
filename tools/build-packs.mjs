// Сборка компендиумов: src/data/*.mjs -> packs/_source/<pack>/*.json -> packs/<pack> (LevelDB).
// Запуск: npm run build
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { compilePack } from '@foundryvtt/foundryvtt-cli'

import { DISCIPLINES } from '../src/data/disciplines.mjs'
import { CLANS, PREDATOR_TYPES, RESONANCES } from '../src/data/clans.mjs'
import { BACKGROUNDS, BACKGROUND_FLAWS, MERITS, FLAWS, WEAPONS } from '../src/data/features.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE_DIR = path.join(ROOT, 'packs', '_source')
const PACKS_DIR = path.join(ROOT, 'packs')

const SOURCE_BOOK = 'Vampire: The Masquerade 5th Edition'
const STATS = { coreVersion: '14.360', systemId: 'wod5e', systemVersion: '5.3.28' }

const ICONS = {
  power: 'systems/wod5e/assets/icons/items/discipline.png',
  feature: 'systems/wod5e/assets/icons/items/feature.svg',
  clan: 'icons/svg/castle.svg',
  predatorType: 'icons/svg/pawprint.svg',
  resonance: 'icons/svg/blood.svg',
  weapon: 'icons/svg/sword.svg'
}

// Ключи wod5e (system/api/def/attributes.js, skills.js, disciplines.js)
const ATTRIBUTES = ['strength', 'dexterity', 'stamina', 'charisma', 'manipulation', 'composure',
  'intelligence', 'wits', 'resolve']
const SKILLS = ['athletics', 'brawl', 'craft', 'drive', 'firearms', 'larceny', 'melee', 'stealth',
  'survival', 'animalken', 'etiquette', 'insight', 'intimidation', 'leadership', 'performance',
  'persuasion', 'streetwise', 'subterfuge', 'academics', 'awareness', 'finance', 'investigation',
  'medicine', 'occult', 'politics', 'science', 'technology']
const DISCIPLINE_NAMES = Object.fromEntries(
  Object.entries(DISCIPLINES).map(([key, d]) => [key, d.ru])
)

const RU_TRAITS = {
  strength: 'Сила', dexterity: 'Ловкость', stamina: 'Выносливость', charisma: 'Харизма',
  manipulation: 'Манипулирование', composure: 'Самообладание', intelligence: 'Интеллект',
  wits: 'Смекалка', resolve: 'Решимость', athletics: 'Атлетика', brawl: 'Драка', craft: 'Ремесло',
  drive: 'Вождение', firearms: 'Стрельба', larceny: 'Воровство', melee: 'Ближний бой',
  stealth: 'Скрытность', survival: 'Выживание', animalken: 'Обращение с животными',
  etiquette: 'Этикет', insight: 'Проницательность', intimidation: 'Запугивание',
  leadership: 'Лидерство', performance: 'Выступление', persuasion: 'Убеждение',
  streetwise: 'Знание улиц', subterfuge: 'Хитрость', academics: 'Академические знания',
  awareness: 'Осведомлённость', finance: 'Финансы', investigation: 'Расследование',
  medicine: 'Медицина', occult: 'Оккультизм', politics: 'Политика', science: 'Наука',
  technology: 'Технологии', ...DISCIPLINE_NAMES
}

function tracePath(key) {
  if (ATTRIBUTES.includes(key)) return `attributes.${key}`
  if (SKILLS.includes(key)) return `skills.${key}`
  if (key in DISCIPLINE_NAMES) return `disciplines.${key}`
  throw new Error(`Неизвестный ключ пула: ${key}`)
}

// Детерминированный ID документа (16 символов), чтобы пересборка не меняла ссылки
function makeId(seed) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  const bytes = crypto.createHash('sha256').update(seed).digest()
  let id = ''
  for (let i = 0; i < 16; i++) id += alphabet[bytes[i] % alphabet.length]
  return id
}

// Повторяет formatDataItemId из wod5e
function dataItemId(type, name) {
  return `${type}-${name.toLowerCase().trim().replace(/\s+/g, '-')}`
}

function dicepool(seed, keys = []) {
  return Object.fromEntries(keys.map((key, i) => [makeId(`${seed}:dice:${i}`).slice(0, 8), { path: tracePath(key) }]))
}

function poolLabel(keys = []) {
  return keys.map((key) => RU_TRAITS[key]).join(' + ')
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function html(rows, text) {
  const meta = rows
    .filter(([, value]) => value)
    .map(([label, value]) => `<p><strong>${label}:</strong> ${esc(String(value))}</p>`)
    .join('')
  return `${meta}<p>${esc(text)}</p>`
}

function rouseLabel(cost) {
  if (!cost) return 'Бесплатно'
  return cost === 1 ? '1 проверка пробуждения' : `${cost} проверки пробуждения`
}

function folderDoc(pack, name, sort) {
  const _id = makeId(`${pack}:folder:${name}`)
  return { _id, _key: `!folders!${_id}`, name, type: 'Item', folder: null, sorting: 'a', sort, color: null, flags: {} }
}

function itemDoc({ pack, type, en, ru, system, folder = null, sort = 0, img }) {
  const id = dataItemId(type, en)
  const _id = makeId(`${pack}:${id}`)
  return {
    _id,
    _key: `!items!${_id}`,
    name: `${ru} (${en})`,
    type,
    img: img ?? ICONS[type],
    system: {
      macroid: '',
      bonuses: [],
      dataItemId: '',
      source: { book: SOURCE_BOOK, page: '' },
      ...system
    },
    effects: [],
    folder,
    sort,
    ownership: { default: 0 },
    flags: { wod5e: { dataItemId: id } },
    _stats: { ...STATS }
  }
}

// ---------- Паки ----------

function buildDisciplines() {
  const pack = 'vtm-disciplines'
  const docs = []
  Object.entries(DISCIPLINES).forEach(([key, discipline], index) => {
    const folder = folderDoc(pack, discipline.ru, index * 1000)
    docs.push(folder)
    discipline.powers.forEach((power, i) => {
      docs.push(itemDoc({
        pack,
        type: 'power',
        en: power.en,
        ru: power.ru,
        folder: folder._id,
        sort: power.level * 100 + i,
        system: {
          description: html([
            ['Дисциплина', `${discipline.ru} ${'•'.repeat(power.level)}`],
            ['Амальгама', power.amalgam],
            ['Стоимость', rouseLabel(power.cost)],
            ['Бросок', poolLabel(power.pool)],
            ['Сопротивление', power.resist],
            ['Длительность', power.duration]
          ], power.text),
          level: power.level,
          cost: power.cost,
          discipline: key,
          selected: false,
          dicepool: dicepool(`${pack}:${power.en}`, power.pool),
          source: { book: discipline.source ?? SOURCE_BOOK, page: '' }
        }
      }))
    })
  })
  return { pack, docs }
}

function buildClans() {
  const pack = 'vtm-clans'
  const docs = CLANS.map((clan, i) => itemDoc({
    pack,
    type: 'clan',
    en: clan.en,
    ru: clan.ru,
    sort: i,
    system: {
      description: html([
        ['Клановые дисциплины', clan.disciplines.map((d) => DISCIPLINE_NAMES[d]).join(', ') || 'Любые'],
        ['Порок', clan.compulsion]
      ], clan.text),
      bane: `<p>${esc(clan.bane)}</p>`
    }
  }))
  return { pack, docs }
}

function buildPredatorTypes() {
  const pack = 'vtm-predator-types'
  const docs = PREDATOR_TYPES.map((pt, i) => itemDoc({
    pack,
    type: 'predatorType',
    en: pt.en,
    ru: pt.ru,
    sort: i,
    system: {
      description: html([
        ['Бросок охоты', poolLabel(pt.pool) || 'Особый (питание от Сородичей)'],
        ['Даёт', pt.gains]
      ], pt.text),
      dicepool: dicepool(`${pack}:${pt.en}`, pt.pool)
    }
  }))
  return { pack, docs }
}

function buildResonances() {
  const pack = 'vtm-resonances'
  const docs = RESONANCES.map((r, i) => itemDoc({
    pack,
    type: 'resonance',
    en: r.en,
    ru: r.ru,
    sort: i,
    system: {
      description: html([
        ['Усиливает дисциплины', r.disciplines.map((d) => DISCIPLINE_NAMES[d]).join(', ')]
      ], r.text)
    }
  }))
  return { pack, docs }
}

function buildFeatures() {
  const pack = 'vtm-features'
  const groups = [
    ['Предыстории', 'background', BACKGROUNDS],
    ['Недостатки предысторий', 'flaw', BACKGROUND_FLAWS],
    ['Достоинства', 'merit', MERITS],
    ['Недостатки', 'flaw', FLAWS]
  ]
  const docs = []
  groups.forEach(([label, featuretype, list], index) => {
    const folder = folderDoc(pack, label, index * 1000)
    docs.push(folder)
    list.forEach((f, i) => docs.push(itemDoc({
      pack,
      type: 'feature',
      en: f.en,
      ru: f.ru,
      folder: folder._id,
      sort: i,
      system: {
        description: html([['Стоимость', f.range]], f.text),
        points: f.points,
        featuretype,
        uses: { current: 0, max: 0, enabled: false }
      }
    })))
  })
  return { pack, docs }
}

function buildWeapons() {
  const pack = 'vtm-weapons'
  const docs = WEAPONS.map((w, i) => itemDoc({
    pack,
    type: 'weapon',
    en: w.en,
    ru: w.ru,
    sort: i,
    system: {
      description: html([
        ['Модификатор урона', `+${w.damage}`],
        ['Бросок', poolLabel(w.pool)]
      ], w.text),
      weaponType: w.type,
      weaponvalue: w.damage,
      quantity: 1,
      uses: { current: 0, max: 0, enabled: false },
      dicepool: dicepool(`${pack}:${w.en}`, w.pool)
    }
  }))
  return { pack, docs }
}

// ---------- Запись ----------

const builders = [buildDisciplines, buildClans, buildPredatorTypes, buildResonances, buildFeatures, buildWeapons]

for (const build of builders) {
  const { pack, docs } = build()
  const srcDir = path.join(SOURCE_DIR, pack)
  const outDir = path.join(PACKS_DIR, pack)

  const ids = new Set()
  for (const doc of docs) {
    if (ids.has(doc._id)) throw new Error(`Дубликат ID в ${pack}: ${doc.name}`)
    ids.add(doc._id)
  }

  fs.rmSync(srcDir, { recursive: true, force: true })
  fs.mkdirSync(srcDir, { recursive: true })
  for (const doc of docs) {
    const file = `${doc._key.startsWith('!folders!') ? 'folder_' : ''}${doc.flags?.wod5e?.dataItemId ?? doc.name}_${doc._id}.json`
      .replace(/[^\p{L}\p{N}_.-]+/gu, '-')
    fs.writeFileSync(path.join(srcDir, file), JSON.stringify(doc, null, 2) + '\n')
  }

  fs.rmSync(outDir, { recursive: true, force: true })
  await compilePack(srcDir, outDir)
  console.log(`${pack}: ${docs.length} документов`)
}
