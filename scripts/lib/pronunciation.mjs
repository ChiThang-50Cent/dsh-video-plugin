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
  let hasDigit = false
  for (const word of words) {
    if (word in DIGITS) {
      current = DIGITS[word]
      hasDigit = true
    } else if (word === 'mươi' || word === 'mười') {
      if (current === 0) current = 1
      total += current * 10
      current = 0
      hasDigit = false
    } else if (word === 'trăm') {
      total += (hasDigit ? current : 1) * 100
      current = 0
      hasDigit = false
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

const MEASUREMENT_UNITS = [
  ['ki-lô-mét', 'km'], ['kilômét', 'km'], ['km', 'km'],
  ['mi-li-mét', 'mm'], ['milimét', 'mm'], ['mm', 'mm'],
  ['xen-ti-mét', 'cm'], ['centimét', 'cm'], ['cm', 'cm'],
  ['mét', 'm'], ['m', 'm'],
  ['ki-lô-gam', 'kg'], ['kilôgam', 'kg'], ['kg', 'kg'],
  ['gam', 'g'], ['g', 'g'],
]

/**
 * Ordered mathematical content, including measurement units and signs.
 * Invalid dot groupings are retained as errors rather than guessed.
 */
export function semanticFingerprint(text) {
  const normalized = String(text ?? '').normalize('NFC').toLowerCase()
    .replace(/(?<![\p{L}\p{N}])\*\*(?=\S)([^*\n]*?\S)\*\*(?![\p{L}\p{N}])/gu, '$1')
    .replace(/(?<![\p{L}\p{N}])\*(?=\S)([^*\n]*?\S)\*(?![\p{L}\p{N}])/gu, '$1')
    .replace(/[_`]/g, '')
    .replace(/\^\s*2(?!\d)/g, ' bình phương ')
    .replace(/mũ\s+(?:hai|2)(?![\p{L}\d])/gu, ' bình phương ')
    .replace(/[−–](?=\s*\d)/gu, '-')
  const matches = []
  const errors = []
  const add = (start, end, token, priority = 0) => matches.push({ start, end, token, priority })
  for (const match of normalized.matchAll(/(?<![\p{L}\d])\d+(?:[.,]\d+)*/gu)) {
    const raw = match[0]
    const [integer, ...decimals] = raw.split(',')
    if (decimals.length > 1 || integer.split('.').slice(1).some((group) => group.length !== 3) || decimals.some((part) => part.includes('.'))) {
      errors.push(`ambiguous number token "${raw}"`)
      continue
    }
    add(match.index, match.index + raw.length, `NUM:${Number(integer.replace(/\./g, '') + (decimals.length ? `.${decimals[0]}` : ''))}`, 2)
  }
  const numberText = normalized.replace(OPERATOR_PATTERN, (term) => '#'.repeat(term.length))
  const wordMatches = [...numberText.matchAll(NUMBER_WORD_PATTERN)]
  const isDigitWord = (word) => word in DIGITS && word !== 'lẻ' && word !== 'linh'
  let run = []
  const flush = () => {
    if (!run.length) return
    const value = parseVietnameseNumber(run.map((item) => item[0]).join(' '))
    if (Number.isFinite(value)) add(run[0].index, run.at(-1).index + run.at(-1)[0].length, `NUM:${value}`, 1)
    run = []
  }
  for (const match of wordMatches) {
    if (run.length && (!/^\s*$/.test(numberText.slice(run.at(-1).index + run.at(-1)[0].length, match.index))
      || (isDigitWord(run.at(-1)[0]) && isDigitWord(match[0])))) flush()
    run.push(match)
  }
  flush()
  for (const match of numberText.matchAll(/(?<!\p{L})(?:không|một|hai|ba|bốn|tư|năm|sáu|bảy|tám|chín|mười|mươi|trăm|nghìn|ngàn|triệu|tỷ|tỉ|lẻ|linh|mốt|lăm)(?:\s+(?:không|một|hai|ba|bốn|tư|năm|sáu|bảy|tám|chín|mười|mươi|trăm|nghìn|ngàn|triệu|tỷ|tỉ|lẻ|linh|mốt|lăm))*\s+phẩy\s+(?:không|một|hai|ba|bốn|tư|năm|lăm|sáu|bảy|tám|chín)(?:\s+(?:không|một|hai|ba|bốn|tư|năm|lăm|sáu|bảy|tám|chín))*/gu)) {
    const [integer, decimal] = match[0].split(/\s+phẩy\s+/u)
    const digits = decimal.split(/\s+/u).map((word) => DIGITS[word]).join('')
    add(match.index, match.index + match[0].length, `NUM:${Number(`${parseVietnameseNumber(integer)}.${digits}`)}`, 4)
  }
  for (const match of normalized.matchAll(OPERATOR_PATTERN)) {
    const term = OPERATOR_TERMS.find(([value]) => value === match[0])
    add(match.index, match.index + match[0].length, `OP:${term[1]}`, 3)
  }
  for (const match of normalized.matchAll(SYMBOL_PATTERN)) {
    add(match.index, match.index + match[0].length, `OP:${SYMBOL_TERMS.find(([term]) => term === match[0])[1]}`, 3)
  }
  for (const match of normalized.matchAll(/(?<!\p{L})(âm|dương)(?!\p{L})(?=\s+(?:vô cực|\d|không|một|hai|ba|bốn|tư|năm|lăm|sáu|bảy|tám|chín|mười|mươi))/gu)) {
    add(match.index, match.index + match[0].length, `OP:${match[0] === 'âm' ? 'NEG' : 'POS'}`, 3)
  }
  for (const [term, unit] of MEASUREMENT_UNITS) {
    const pattern = new RegExp(`(?<![\\p{L}])${term}(?![\\p{L}(])`, 'gu')
    for (const match of normalized.matchAll(pattern)) {
      if (matches.some((item) => item.token.startsWith('NUM:') && item.end <= match.index && /^\s*$/.test(normalized.slice(item.end, match.index)))) {
        add(match.index, match.index + term.length, `UNIT:${unit}`, 2)
      }
    }
  }
  matches.sort((a, b) => a.start - b.start || b.priority - a.priority || b.end - a.end)
  const selected = []
  for (const match of matches) {
    if (selected.some((item) => match.start < item.end && match.end > item.start)) continue
    selected.push(match)
  }
  for (let index = 0; index < selected.length; index += 1) {
    const item = selected[index]
    if (item.token !== 'OP:SUB' && item.token !== 'OP:ADD') continue
    const next = selected[index + 1]
    const previous = selected[index - 1]
    const unary = next?.token.startsWith('NUM:') && /^\s*$/.test(normalized.slice(item.end, next.start))
      && (!previous || previous.token.startsWith('OP:') || /[([{,:;]/u.test(normalized.slice(previous.end, item.start)))
    if (unary) item.token = item.token === 'OP:SUB' ? 'OP:NEG' : 'OP:POS'
  }
  const tokens = selected.map((item) => item.token)
  return { tokens, numbers: tokens.filter((token) => token.startsWith('NUM:')), operators: tokens.filter((token) => token.startsWith('OP:')), errors }
}

/**
 * Compare the semantics of two spoken forms.
 * @param {string} left
 * @param {string} right
 */
export function compareSemantics(left, right) {
  const a = semanticFingerprint(left)
  const b = semanticFingerprint(right)
  const same = a.errors.length === 0 && b.errors.length === 0 && a.tokens.length === b.tokens.length && a.tokens.every((token, index) => token === b.tokens[index])
  return {
    ok: same,
    left: a,
    right: b,
    missing: same ? [] : [...a.errors, ...a.tokens.filter((token, index) => token !== b.tokens[index])],
    added: same ? [] : [...b.errors, ...b.tokens.filter((token, index) => token !== a.tokens[index])],
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
