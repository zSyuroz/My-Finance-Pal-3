/**
 * Guessing a category from a Malaysian or Singaporean merchant line.
 *
 * Bank descriptions in both countries are terse and intensely local — "NTUC
 * FP", "SIMPLYGO", "99 SPEEDMART", "TNG RELOAD", "SP SERVICES", "TNB". A
 * generic keyword list built for US merchants produces a wall of
 * Uncategorised rows here, which is the difference between an import being
 * worth doing and not.
 *
 * The longest matching keyword wins, so "grabfood" lands in Food rather than
 * being caught by "grab" in Transport.
 */

import type { CategoryKey } from '../spending';

const RULES: { key: CategoryKey; words: string[] }[] = [
  {
    key: 'food',
    words: [
      // Singapore groceries and food courts
      'ntuc', 'fairprice', 'fair price', 'sheng siong', 'cold storage', 'prime super',
      'hao mart', 'don don donki', 'donki', 'kopitiam', 'koufu', 'food republic',
      'foodfare', 'hawker', 'toast box', 'ya kun', 'old chang kee', 'polar puffs',
      'crystal jade', 'din tai fung', 'swensen', 'bee cheng hiang', 'chicken rice',
      'cai fan', 'wet market', 'food court', 'foodcourt',
      // Malaysia groceries and convenience
      '99 speedmart', 'speedmart', 'mydin', "lotus's", 'lotuss', 'tesco', 'econsave',
      'giant', 'village grocer', 'jaya grocer', "ben's independent", 'nsk trade',
      'segi fresh', 'kk super mart', 'kk mart', 'family mart', 'familymart',
      '7-eleven', '7 eleven', 'seven eleven', 'myNEWS', 'mynews',
      // Malaysia eateries
      'restoran', 'kedai makan', 'warung', 'mamak', 'nasi kandar', 'papparich',
      'oldtown', 'old town', 'secret recipe', 'marrybrown', 'texas chicken',
      'sushi king', 'sakae', 'nando', 'the chicken rice shop',
      // Cafes and chains, both countries
      'zus coffee', 'zus', 'tealive', 'chatime', 'starbucks', 'coffee bean',
      'san francisco coffee', 'boost juice', 'llaollao', 'gong cha', 'mixue',
      'mcdonald', 'kfc', 'pizza hut', 'domino', 'burger king', 'subway', 'a&w',
      'restaurant', 'cafe', 'bakery', 'bistro', 'deli',
      // Delivery
      'grabfood', 'grab food', 'foodpanda', 'food panda', 'shopeefood', 'shopee food',
      'deliveroo', 'dahmakan',
    ],
  },
  {
    key: 'transport',
    words: [
      // Singapore
      'simplygo', 'ez-link', 'ezlink', 'transitlink', 'smrt', 'sbs transit',
      'comfortdelgro', 'comfort del gro', 'bus/mrt', 'erp', 'zig', 'tada', 'ryde',
      'gojek', 'changi', 'scoot', 'singapore airlines', 'jetstar',
      // Malaysia
      "touch 'n go", 'touch n go', 'tng reload', 'tngo', 'rapidkl', 'rapid kl',
      'myrapid', 'prasarana', 'ktmb', 'monorail', 'smarttag', 'lebuhraya',
      'jomparking', 'flexi parking', 'wilayah parking', 'maxim', 'indrive',
      'airasia', 'malaysia airlines', 'batik air', 'firefly', 'myairline',
      // Fuel, both countries
      'petronas', 'petron', 'shell', 'caltex', 'bhpetrol', 'esso', 'mobil',
      // Generic
      'grab', 'taxi', 'e-hailing', 'parking', 'toll', 'petrol', 'fuel', 'mrt',
      'lrt', 'transit', 'airlines', 'flight',
    ],
  },
  {
    key: 'shopping',
    words: [
      // Marketplaces, both countries
      'shopee', 'lazada', 'zalora', 'pgmall', 'temu', 'taobao', 'shein', 'amazon',
      'ebay', 'etsy', 'qoo10',
      // Malaysia retail
      'mr diy', 'mrdiy', 'ace hardware', 'home pro', 'nitori', 'parkson', 'padini',
      'brands outlet', 'senheng', 'al-ikhsan', 'sports direct',
      // Singapore retail
      'daiso', 'valu', 'muji', 'best denki', 'challenger', 'courts', 'harvey norman',
      'decathlon', 'uniqlo', 'cotton on', 'h&m', 'ikea',
      // Pharmacy/drugstore — retail in both countries
      'watsons', 'guardian', 'caring pharmacy', 'big pharmacy', 'alpro', 'farmasi',
      'unity pharmacy',
    ],
  },
  {
    key: 'bills',
    words: [
      // Malaysia utilities and telco
      'tenaga nasional', 'tenaga', 'tnb', 'syabas', 'air selangor', 'ranhill',
      'lembaga air', 'indah water', 'astro', 'unifi', 'telekom', 'celcomdigi',
      'celcom', 'maxis', 'hotlink', 'digi telecom', 'umobile', 'u mobile',
      'tune talk', 'time dotcom', 'time internet', 'yes 4g',
      // Singapore utilities and telco
      'sp services', 'sp group', 'spservices', 'city energy', 'city gas', 'senoko',
      'geneco', 'keppel electric', 'tuas power', 'sembcorp', 'singtel', 'starhub',
      'simba', 'circles.life', 'circles life', 'myrepublic', 'viewqwest', 'whizcomms',
      // Insurance and takaful
      'insurance', 'insurans', 'takaful', 'prudential', 'great eastern', 'allianz',
      'etiqa', 'zurich', 'manulife', 'tokio marine', 'ntuc income', 'income insurance',
      'singlife', 'aia ', 'msig',
      // Housing and recurring
      'rent', 'sewa', 'ansuran', 'mortgage', 'town council', 'management corp',
      'property tax', 'cukai', 'assessment',
      // Subscriptions
      'netflix', 'spotify', 'disney', 'youtube premium', 'icloud', 'google storage',
      'google one', 'adobe', 'openai', 'anthropic', 'microsoft', 'apple.com/bill',
      'subscription', 'gym', 'fitness first', 'anytime fitness', 'activesg',
    ],
  },
];

const clean = (s: string) => String(s || '').toLowerCase().replace(/\s+/g, ' ');

/** Category for an outgoing row. Longest matching keyword wins. */
export function guessCategory(description: string): CategoryKey {
  const text = clean(description);
  if (!text) return 'other';

  let winner: { key: CategoryKey; length: number } | null = null;
  for (const { key, words } of RULES) {
    for (const word of words) {
      if (!text.includes(word)) continue;
      if (!winner || word.length > winner.length) winner = { key, length: word.length };
    }
  }
  return winner ? winner.key : 'other';
}

/**
 * Words that mean money came in. Used only as a last resort, when neither a
 * signed amount, a debit/credit column, an explicit type column, nor a
 * running balance could settle the direction.
 */
export const INCOME_KEYWORDS = [
  // English, both countries
  'salary', 'payroll', 'wages', 'monthly pay', 'bonus', 'commission', 'dividend',
  'interest', 'credit interest', 'refund', 'reimbursement', 'rebate', 'cashback',
  'claim', 'allowance', 'stipend', 'incoming', 'transfer from', 'duitnow from',
  'paynow from', 'deposit', 'direct dep',
  // Bahasa Malaysia
  'gaji', 'elaun', 'komisen', 'dividen', 'faedah', 'pencen', 'bantuan', 'insentif',
  'bayaran masuk', 'kemasukan',
  // Local schemes and payouts
  'kwsp', 'epf dividend', 'tabung haji', 'asnb', 'asb dividend', 'str', 'bkm',
  'gst voucher', 'cdc voucher', 'workfare', 'ns fit', 'ns pay',
];

/**
 * Which kind of income a statement line looks like.
 *
 * Longest match wins, same as the merchant rules: "credit interest" has to
 * beat "credit", and "asb dividend" has to beat "dividend". Anything
 * unrecognised stays 'other' rather than being forced into a bucket — a wrong
 * category is worse than none when the point is seeing where money comes from.
 */
const INCOME_CATEGORY_RULES: { word: string; category: string }[] = [
  // Salary and regular pay
  { word: 'salary', category: 'salary' },
  { word: 'payroll', category: 'salary' },
  { word: 'wages', category: 'salary' },
  { word: 'monthly pay', category: 'salary' },
  { word: 'gaji', category: 'salary' },
  { word: 'pencen', category: 'salary' },
  { word: 'stipend', category: 'salary' },
  { word: 'allowance', category: 'salary' },
  { word: 'elaun', category: 'salary' },
  { word: 'ns pay', category: 'salary' },
  { word: 'ns fit', category: 'salary' },
  // One-off uplifts
  { word: 'bonus', category: 'bonus' },
  { word: 'commission', category: 'bonus' },
  { word: 'komisen', category: 'bonus' },
  { word: 'incentive', category: 'bonus' },
  { word: 'insentif', category: 'bonus' },
  // Money coming back
  { word: 'refund', category: 'refund' },
  { word: 'reimbursement', category: 'refund' },
  { word: 'rebate', category: 'refund' },
  { word: 'cash rebate', category: 'refund' },
  { word: 'cashback', category: 'refund' },
  { word: 'claim', category: 'refund' },
  // Returns on money
  { word: 'interest', category: 'interest' },
  { word: 'credit interest', category: 'interest' },
  { word: 'faedah', category: 'interest' },
  { word: 'dividend', category: 'interest' },
  { word: 'dividen', category: 'interest' },
  { word: 'asb dividend', category: 'interest' },
  { word: 'epf dividend', category: 'interest' },
  { word: 'kwsp', category: 'interest' },
  { word: 'asnb', category: 'interest' },
  { word: 'tabung haji', category: 'interest' },
  // Handouts and transfers from people
  { word: 'gift', category: 'gift' },
  { word: 'angpow', category: 'gift' },
  { word: 'ang pow', category: 'gift' },
  { word: 'bantuan', category: 'gift' },
  { word: 'str', category: 'gift' },
  { word: 'bkm', category: 'gift' },
  { word: 'gst voucher', category: 'gift' },
  { word: 'cdc voucher', category: 'gift' },
  { word: 'workfare', category: 'gift' },
];

export function guessIncomeCategory(description: string): string {
  const text = description.toLowerCase();
  let best: { word: string; category: string } | null = null;
  for (const rule of INCOME_CATEGORY_RULES) {
    if (!text.includes(rule.word)) continue;
    if (!best || rule.word.length > best.word.length) best = rule;
  }
  return best?.category ?? 'other';
}
