/**
 * Vietnamese number/operator semantics for the spoken-text contract.
 *
 * The goal is narrow and deterministic: a pronunciation override may change
 * how a number or symbol is *said*, but it may not change the numbers,
 * operators, signs or quantities in the approved narration. This does not
 * prove a mathematical claim; it only protects the claim's spoken surface.
 */

const DIGIT_WORDS = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín']

const DIGITS = {
  không: 0,
  linh: 0,
  lẻ: 0,
  một: 1,
  mốt: 1,
  hai: 2,
  ba: 3,
  bốn: 4,
  tư: 4,
  năm: 5,
  lăm: 5,
  sáu: 6,
  bảy: 7,
  tám: 8,
  chín: 9,
}

const UNITS = {
  mươi: 10,
  mười: 10,
  trăm: 100,
  nghìn: 1000,
  ngàn: 1000,
  triệu: 1_000_000,
  tỷ: 1_000_000_000,
  tỉ: 1_000_000_000,
}

const NUMBER_WORD_PATTERN = new RegExp(
  `(?<!\\p{L})(?:${[...Object.keys(DIGITS), ...Object.keys(UNITS)].sort((a, b) => b.length - a.length).join('|')})(?!\\p{L})`,
  'giu',
)

/**
 * Convert a non-negative integer to Vietnamese words.
 * @param {number} value
 */
export function integerToVietnamese(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`cannot vocalize ${value}`)
  if (value === 0) return 'không'
  const scales = [
    [1_000_000_000, 'tỷ'],
    [1_000_000, 'triệu'],
    [1_000, 'nghìn'],
  ]
  const under1000 = (n) => {
    const hundreds = Math.floor(n / 100)
    const rest = n % 100
    const words = []
    if (hundreds > 0) words.push(DIGIT_WORDS[hundreds], 'trăm')
    if (rest > 0) {
      if (hundreds > 0 && rest < 10) words.push('lẻ')
      const tens = Math.floor(rest / 10)
      const units = rest % 10
      if (tens > 1) {
        words.push(DIGIT_WORDS[tens], 'mươi')
        if (units === 1) words.push('mốt')
        else if (units === 4) words.push('tư')
        else if (units === 5) words.push('lăm')
        else if (units > 0) words.push(DIGIT_WORDS[units])
      } else if (tens === 1) {
        words.push('mười')
        if (units === 5) words.push('lăm')
        else if (units > 0) words.push(DIGIT_WORDS[units])
      } else if (units > 0) {
        words.push(DIGIT_WORDS[units])
      }
    }
    return words
  }

  let remaining = value
  const parts = []
  for (const [scale, label] of scales) {
    const count = Math.floor(remaining / scale)
    if (count > 0) {
      parts.push(integerToVietnamese(count), label)
      remaining -= count * scale
    }
  }
  if (remaining > 0) parts.push(...under1000(remaining))
  return parts.join(' ')
}

/**
 * Convert an integer (or decimal with comma) to spoken Vietnamese.
 * @param {string|number} input
 */
export function numberToVietnamese(input) {
  const text = String(input).replace(/\s+/g, '').replace(/(?<=\d)[._](?=\d{3}\b)/g, '')
  const negative = text.startsWith('-')
  const unsigned = negative ? text.slice(1) : text
  const [integerPart, decimalPart] = unsigned.replace(',', '.').split('.')
  const integer = Number(integerPart)
  if (!Number.isSafeInteger(integer)) throw new Error(`cannot vocalize ${input}`)
  let spoken = integerToVietnamese(integer)
  if (decimalPart !== undefined && decimalPart.length > 0) {
    spoken += ` phẩy ${[...decimalPart].map((digit) => DIGITS[digit] ?? digit).join(' ')}`
  }
  return negative ? `âm ${spoken}` : spoken
}

function parseUnderThousand(words) {
  let total = 0
  let current = 0
  for (const word of words) {
    if (word in DIGITS) current = DIGITS[word]
    else if (word === 'mươi' || word === 'mười') {
      if (current === 0) current = 1
      total += current * 10
      current = 0
    } else if (word === 'trăm') {
      total += (current === 0 ? 1 : current) * 100
      current = 0
    } else return Number.NaN
  }
  return total + current
}

/**
 * Parse a lowercase Vietnamese number-word sequence.
 * @param {string} phrase
 * @returns {number|undefined}
 */
export function parseVietnameseNumber(phrase) {
  const words = String(phrase).trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return undefined
  if (words.length === 1 && words[0] in DIGITS) return DIGITS[words[0]]
  let total = 0
  let group = []
  const flushGroup = (scale = 1) => {
    if (group.length === 0) return
    const value = parseUnderThousand(group)
    if (!Number.isFinite(value)) return
    total += value * scale
    group = []
  }
  for (let index = 0; index < words.length; index += 1) {
    const word = words[index]
    if (word === 'tỷ' || word === 'tỉ') flushGroup(1_000_000_000)
    else if (word === 'triệu') flushGroup(1_000_000)
    else if (word === 'nghìn' || word === 'ngàn') flushGroup(1000)
    else group.push(word)
  }
  flushGroup(1)
  return total
}

const OPERATOR_TERMS = [
  ['lớn hơn hoặc bằng', 'GE'],
  ['nhỏ hơn hoặc bằng', 'LE'],
  ['căn bậc hai', 'SQRT'],
  ['phần trăm', 'PERCENT'],
  ['bình phương', 'POW2'],
  ['dấu trừ', 'SUB'],
  ['dấu cộng', 'ADD'],
  ['dấu âm', 'NEG'],
  ['dấu dương', 'POS'],
  ['vô cực', 'INF'],
  ['lớn hơn', 'GT'],
  ['nhỏ hơn', 'LT'],
  ['xấp xỉ', 'APPROX'],
  ['cộng', 'ADD'],
  ['trừ', 'SUB'],
  ['nhân', 'MUL'],
  ['chia', 'DIV'],
  ['phần', 'DIV'],
  ['bằng', 'EQ'],
  ['khác', 'NEQ'],
  ['mũ', 'POW'],
  ['căn', 'SQRT'],
]

const SYMBOL_TERMS = [
  ['>=', 'GE'],
  ['<=', 'LE'],
  ['!=', 'NEQ'],
  ['+', 'ADD'],
  ['-', 'SUB'],
  ['*', 'MUL'],
  ['×', 'MUL'],
  ['·', 'MUL'],
  ['/', 'DIV'],
  ['÷', 'DIV'],
  ['=', 'EQ'],
  ['>', 'GT'],
  ['<', 'LT'],
  ['≥', 'GE'],
  ['≤', 'LE'],
  ['≠', 'NEQ'],
  ['^', 'POW'],
  ['%', 'PERCENT'],
  ['√', 'SQRT'],
  ['∞', 'INF'],
  ['±', 'PM'],
]

const OPERATOR_PATTERN = new RegExp(
  OPERATOR_TERMS.map(([term]) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).sort((a, b) => b.length - a.length).join('|'),
  'giu',
)
const SYMBOL_PATTERN = /(>=|<=|!=|[-+*/=<>^%√∞±×·÷≥≤≠])/gu

function pushNumbersFromDigits(text, numbers) {
  const pattern = /(?<![\p{L}\d])(-?\d+(?:[.,]\d+)*)(?![\p{L}\d])/gu
  for (const match of text.matchAll(pattern)) {
    const raw = match[1]
    const value = Number(raw.replace(/\./g, '').replace(',', '.'))
    if (Number.isFinite(value)) numbers.push({ value, raw, source: 'digits' })
  }
}

function pushNumbersFromWords(text, numbers) {
  const matches = [...text.matchAll(NUMBER_WORD_PATTERN)]
  let run = []
  let start = -1
  let end = -1
  const flush = () => {
    if (run.length === 0) return
    const value = parseVietnameseNumber(run.join(' '))
    if (Number.isFinite(value)) numbers.push({ value, raw: text.slice(start, end), source: 'words' })
    run = []
    start = -1
    end = -1
  }
  for (const match of matches) {
    const index = match.index ?? 0
    if (run.length > 0) {
      const gap = text.slice(end, index)
      if (!/^\s*$/.test(gap)) flush()
    }
    if (run.length === 0) start = index
    run.push(match[0].toLowerCase())
    end = index + match[0].length
  }
  flush()
}

/**
 * Canonical semantics: every number value and every operator/sign token.
 * @param {string} text
 */
export function semanticFingerprint(text) {
  const normalized = String(text ?? '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[*_`]/g, '')
    .replace(/\^\s*2(?!\d)/g, ' bình phương ')
    .replace(/\bmũ\s+(?:hai|2)\b/gu, ' bình phương ')
  const numbers = []
  const numberSource = normalized.replace(/phần\s+trăm/gu, ' __percent__ ')
  pushNumbersFromDigits(numberSource, numbers)
  pushNumbersFromWords(numberSource, numbers)
  const operators = []
  for (const match of normalized.matchAll(OPERATOR_PATTERN)) operators.push(OPERATOR_TERMS.find(([term]) => term.toLowerCase() === match[0].toLowerCase())?.[1] ?? match[0])
  for (const match of normalized.matchAll(SYMBOL_PATTERN)) operators.push(SYMBOL_TERMS.find(([term]) => term === match[0])?.[1] ?? match[0])
  // Signs attached to a following quantity or infinity are semantic signs.
  for (const match of normalized.matchAll(/(?<!\p{L})(âm|dương)\s+(?=(?:vô cực|\d|không|một|hai|ba|bốn|tư|năm|lăm|sáu|bảy|tám|chín|mười|mươi))/gu)) {
    operators.push(match[1] === 'âm' ? 'NEG' : 'POS')
  }

  const numberMultiset = numbers.map(({ value }) => `NUM:${Number(value.toFixed(9))}`).sort()
  const operatorMultiset = operators.map((operator) => `OP:${operator}`).sort()
  return {
    tokens: [...numberMultiset, ...operatorMultiset].sort(),
    numbers: numberMultiset,
    operators: operatorMultiset,
  }
}

/**
 * Compare the semantics of two spoken forms.
 * @param {string} left
 * @param {string} right
 */
export function compareSemantics(left, right) {
  const a = semanticFingerprint(left)
  const b = semanticFingerprint(right)
  const same = a.tokens.length === b.tokens.length && a.tokens.every((token, index) => token === b.tokens[index])
  return {
    ok: same,
    left: a,
    right: b,
    missing: same ? [] : a.tokens.filter((token) => !b.tokens.includes(token)),
    added: same ? [] : b.tokens.filter((token) => !a.tokens.includes(token)),
  }
}

export const SAFE_OVERRIDE_KINDS = ['number', 'symbol', 'unit', 'abbreviation', 'letter', 'name', 'operator']

/**
 * Apply declared overrides to canonical text and verify the result is exactly
 * the supplied spoken representation.
 * @param {string} text
 * @param {string} spokenText
 * @param {Array<{ from: string, to: string }>} overrides
 */
export function reconstructSpokenText(text, spokenText, overrides) {
  let current = String(text)
  const applied = []
  for (const [index, override] of overrides.entries()) {
    const from = String(override?.from ?? '')
    const to = String(override?.to ?? '')
    if (from.length === 0) return { ok: false, error: `override #${index + 1} has an empty "from"` }
    if (from === to) return { ok: false, error: `override #${index + 1} does not change anything` }
    if (!current.includes(from)) return { ok: false, error: `override #${index + 1} source ${JSON.stringify(from)} does not occur in the remaining text` }
    current = current.split(from).join(to)
    applied.push({ from, to })
  }
  const normalize = (value) => String(value).normalize('NFC').replace(/\s+/g, ' ').trim()
  if (normalize(current) !== normalize(spokenText)) {
    return {
      ok: false,
      error: 'spokenText is not the canonical text with the declared overrides applied',
      expected: normalize(current),
      actual: normalize(spokenText),
    }
  }
  return { ok: true, spoken: current, applied }
}
