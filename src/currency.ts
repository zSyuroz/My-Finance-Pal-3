/**
 * Which currency the app's figures are written in.
 *
 * Every amount used to be printed with a hardcoded `$`, which is merely
 * inaccurate for a Singaporean and outright wrong for a Malaysian — an
 * imported statement showing RM32.90 was displayed as $32.90, the same
 * numeral standing for roughly a third of the value.
 *
 * The active symbol is held at module level rather than passed through props
 * because `fmtMoney` is called from ~55 places, most of them deep inside list
 * rows. `CurrencyProvider` keeps this value in step with React state, so a
 * change both re-renders the tree and updates what `fmtMoney` reads.
 */

export type Currency = { code: string; symbol: string; label: string };

/**
 * Every active ISO 4217 currency, ordered by name.
 *
 * Names and symbols come from ICU rather than being typed by hand, so they
 * match what the rest of the phone calls them. Withdrawn currencies are left
 * out: offering someone the Zimbabwean dollar or the German mark is an
 * invitation to pick wrong, and the codes that replaced them are here.
 *
 * Where a currency has no distinct glyph, ICU gives back the code itself
 * ("BHD 32.90"), which is what a bank statement in that currency prints too.
 */
export const CURRENCIES = [
  { code: 'AFN', symbol: '؋', label: 'Afghan Afghani' },
  { code: 'ALL', symbol: 'ALL', label: 'Albanian Lek' },
  { code: 'DZD', symbol: 'DZD', label: 'Algerian Dinar' },
  { code: 'AOA', symbol: 'Kz', label: 'Angolan Kwanza' },
  { code: 'ARS', symbol: '$', label: 'Argentine Peso' },
  { code: 'AMD', symbol: '֏', label: 'Armenian Dram' },
  { code: 'AWG', symbol: 'AWG', label: 'Aruban Florin' },
  { code: 'AUD', symbol: '$', label: 'Australian Dollar' },
  { code: 'AZN', symbol: '₼', label: 'Azerbaijani Manat' },
  { code: 'BSD', symbol: '$', label: 'Bahamian Dollar' },
  { code: 'BHD', symbol: 'BHD', label: 'Bahraini Dinar' },
  { code: 'BDT', symbol: '৳', label: 'Bangladeshi Taka' },
  { code: 'BBD', symbol: '$', label: 'Barbadian Dollar' },
  { code: 'BYN', symbol: 'BYN', label: 'Belarusian Ruble' },
  { code: 'BZD', symbol: '$', label: 'Belize Dollar' },
  { code: 'BMD', symbol: '$', label: 'Bermudan Dollar' },
  { code: 'BTN', symbol: 'BTN', label: 'Bhutanese Ngultrum' },
  { code: 'BOB', symbol: 'Bs', label: 'Bolivian Boliviano' },
  { code: 'BAM', symbol: 'KM', label: 'Bosnia-Herzegovina Convertible Mark' },
  { code: 'BWP', symbol: 'P', label: 'Botswanan Pula' },
  { code: 'BRL', symbol: 'R$', label: 'Brazilian Real' },
  { code: 'GBP', symbol: '£', label: 'British Pound' },
  { code: 'BND', symbol: '$', label: 'Brunei Dollar' },
  { code: 'BGN', symbol: 'BGN', label: 'Bulgarian Lev' },
  { code: 'BIF', symbol: 'BIF', label: 'Burundian Franc' },
  { code: 'KHR', symbol: '៛', label: 'Cambodian Riel' },
  { code: 'CAD', symbol: '$', label: 'Canadian Dollar' },
  { code: 'CVE', symbol: 'CVE', label: 'Cape Verdean Escudo' },
  { code: 'XCG', symbol: 'Cg.', label: 'Caribbean guilder' },
  { code: 'KYD', symbol: '$', label: 'Cayman Islands Dollar' },
  { code: 'XAF', symbol: 'FCFA', label: 'Central African CFA Franc' },
  { code: 'XPF', symbol: 'CFPF', label: 'CFP Franc' },
  { code: 'CLP', symbol: '$', label: 'Chilean Peso' },
  { code: 'CNY', symbol: '¥', label: 'Chinese Yuan' },
  { code: 'COP', symbol: '$', label: 'Colombian Peso' },
  { code: 'KMF', symbol: 'CF', label: 'Comorian Franc' },
  { code: 'CDF', symbol: 'CDF', label: 'Congolese Franc' },
  { code: 'CRC', symbol: '₡', label: 'Costa Rican Colón' },
  { code: 'CUP', symbol: '$', label: 'Cuban Peso' },
  { code: 'CZK', symbol: 'Kč', label: 'Czech Koruna' },
  { code: 'DKK', symbol: 'kr', label: 'Danish Krone' },
  { code: 'DJF', symbol: 'DJF', label: 'Djiboutian Franc' },
  { code: 'DOP', symbol: '$', label: 'Dominican Peso' },
  { code: 'XCD', symbol: '$', label: 'East Caribbean Dollar' },
  { code: 'EGP', symbol: 'E£', label: 'Egyptian Pound' },
  { code: 'ERN', symbol: 'ERN', label: 'Eritrean Nakfa' },
  { code: 'ETB', symbol: 'ETB', label: 'Ethiopian Birr' },
  { code: 'EUR', symbol: '€', label: 'Euro' },
  { code: 'FKP', symbol: '£', label: 'Falkland Islands Pound' },
  { code: 'FJD', symbol: '$', label: 'Fijian Dollar' },
  { code: 'GMD', symbol: 'GMD', label: 'Gambian Dalasi' },
  { code: 'GEL', symbol: '₾', label: 'Georgian Lari' },
  { code: 'GHS', symbol: 'GH₵', label: 'Ghanaian Cedi' },
  { code: 'GIP', symbol: '£', label: 'Gibraltar Pound' },
  { code: 'GTQ', symbol: 'Q', label: 'Guatemalan Quetzal' },
  { code: 'GNF', symbol: 'FG', label: 'Guinean Franc' },
  { code: 'GYD', symbol: '$', label: 'Guyanaese Dollar' },
  { code: 'HTG', symbol: 'HTG', label: 'Haitian Gourde' },
  { code: 'HNL', symbol: 'L', label: 'Honduran Lempira' },
  { code: 'HKD', symbol: '$', label: 'Hong Kong Dollar' },
  { code: 'HUF', symbol: 'Ft', label: 'Hungarian Forint' },
  { code: 'ISK', symbol: 'kr', label: 'Icelandic Króna' },
  { code: 'INR', symbol: '₹', label: 'Indian Rupee' },
  { code: 'IDR', symbol: 'Rp', label: 'Indonesian Rupiah' },
  { code: 'IRR', symbol: 'IRR', label: 'Iranian Rial' },
  { code: 'IQD', symbol: 'IQD', label: 'Iraqi Dinar' },
  { code: 'ILS', symbol: '₪', label: 'Israeli New Shekel' },
  { code: 'JMD', symbol: '$', label: 'Jamaican Dollar' },
  { code: 'JPY', symbol: '¥', label: 'Japanese Yen' },
  { code: 'JOD', symbol: 'JOD', label: 'Jordanian Dinar' },
  { code: 'KZT', symbol: '₸', label: 'Kazakhstani Tenge' },
  { code: 'KES', symbol: 'KES', label: 'Kenyan Shilling' },
  { code: 'KWD', symbol: 'KWD', label: 'Kuwaiti Dinar' },
  { code: 'KGS', symbol: '⃀', label: 'Kyrgyz Som' },
  { code: 'LAK', symbol: '₭', label: 'Laotian Kip' },
  { code: 'LBP', symbol: 'L£', label: 'Lebanese Pound' },
  { code: 'LSL', symbol: 'LSL', label: 'Lesotho Loti' },
  { code: 'LRD', symbol: '$', label: 'Liberian Dollar' },
  { code: 'LYD', symbol: 'LYD', label: 'Libyan Dinar' },
  { code: 'MOP', symbol: 'MOP', label: 'Macanese Pataca' },
  { code: 'MKD', symbol: 'MKD', label: 'Macedonian Denar' },
  { code: 'MGA', symbol: 'Ar', label: 'Malagasy Ariary' },
  { code: 'MWK', symbol: 'MWK', label: 'Malawian Kwacha' },
  { code: 'MYR', symbol: 'RM', label: 'Malaysian Ringgit' },
  { code: 'MVR', symbol: 'MVR', label: 'Maldivian Rufiyaa' },
  { code: 'MRU', symbol: 'MRU', label: 'Mauritanian Ouguiya' },
  { code: 'MUR', symbol: 'Rs', label: 'Mauritian Rupee' },
  { code: 'MXN', symbol: '$', label: 'Mexican Peso' },
  { code: 'MDL', symbol: 'MDL', label: 'Moldovan Leu' },
  { code: 'MNT', symbol: '₮', label: 'Mongolian Tugrik' },
  { code: 'MAD', symbol: 'MAD', label: 'Moroccan Dirham' },
  { code: 'MZN', symbol: 'MZN', label: 'Mozambican Metical' },
  { code: 'MMK', symbol: 'K', label: 'Myanmar Kyat' },
  { code: 'NAD', symbol: '$', label: 'Namibian Dollar' },
  { code: 'NPR', symbol: 'Rs', label: 'Nepalese Rupee' },
  { code: 'TWD', symbol: '$', label: 'New Taiwan Dollar' },
  { code: 'NZD', symbol: '$', label: 'New Zealand Dollar' },
  { code: 'NIO', symbol: 'C$', label: 'Nicaraguan Córdoba' },
  { code: 'NGN', symbol: '₦', label: 'Nigerian Naira' },
  { code: 'KPW', symbol: '₩', label: 'North Korean Won' },
  { code: 'NOK', symbol: 'kr', label: 'Norwegian Krone' },
  { code: 'OMR', symbol: 'OMR', label: 'Omani Rial' },
  { code: 'PKR', symbol: 'Rs', label: 'Pakistani Rupee' },
  { code: 'PAB', symbol: 'PAB', label: 'Panamanian Balboa' },
  { code: 'PGK', symbol: 'PGK', label: 'Papua New Guinean Kina' },
  { code: 'PYG', symbol: '₲', label: 'Paraguayan Guarani' },
  { code: 'PEN', symbol: 'PEN', label: 'Peruvian Sol' },
  { code: 'PHP', symbol: '₱', label: 'Philippine Peso' },
  { code: 'PLN', symbol: 'zł', label: 'Polish Zloty' },
  { code: 'QAR', symbol: 'QAR', label: 'Qatari Riyal' },
  { code: 'RON', symbol: 'lei', label: 'Romanian Leu' },
  { code: 'RUB', symbol: '₽', label: 'Russian Ruble' },
  { code: 'RWF', symbol: 'RF', label: 'Rwandan Franc' },
  { code: 'SVC', symbol: 'SVC', label: 'Salvadoran Colón' },
  { code: 'WST', symbol: 'WST', label: 'Samoan Tala' },
  { code: 'STN', symbol: 'Db', label: 'São Tomé & Príncipe Dobra' },
  { code: 'SAR', symbol: 'SAR', label: 'Saudi Riyal' },
  { code: 'RSD', symbol: 'RSD', label: 'Serbian Dinar' },
  { code: 'SCR', symbol: 'SCR', label: 'Seychellois Rupee' },
  { code: 'SLE', symbol: 'SLE', label: 'Sierra Leonean Leone' },
  { code: 'SGD', symbol: '$', label: 'Singapore Dollar' },
  { code: 'SBD', symbol: '$', label: 'Solomon Islands Dollar' },
  { code: 'SOS', symbol: 'SOS', label: 'Somali Shilling' },
  { code: 'ZAR', symbol: 'R', label: 'South African Rand' },
  { code: 'KRW', symbol: '₩', label: 'South Korean Won' },
  { code: 'SSP', symbol: '£', label: 'South Sudanese Pound' },
  { code: 'LKR', symbol: 'Rs', label: 'Sri Lankan Rupee' },
  { code: 'SHP', symbol: '£', label: 'St. Helena Pound' },
  { code: 'SDG', symbol: 'SDG', label: 'Sudanese Pound' },
  { code: 'SRD', symbol: '$', label: 'Surinamese Dollar' },
  { code: 'SZL', symbol: 'SZL', label: 'Swazi Lilangeni' },
  { code: 'SEK', symbol: 'kr', label: 'Swedish Krona' },
  { code: 'CHF', symbol: 'CHF', label: 'Swiss Franc' },
  { code: 'SYP', symbol: '£', label: 'Syrian Pound' },
  { code: 'TJS', symbol: 'TJS', label: 'Tajikistani Somoni' },
  { code: 'TZS', symbol: 'TZS', label: 'Tanzanian Shilling' },
  { code: 'THB', symbol: '฿', label: 'Thai Baht' },
  { code: 'TOP', symbol: 'T$', label: 'Tongan Paʻanga' },
  { code: 'TTD', symbol: '$', label: 'Trinidad & Tobago Dollar' },
  { code: 'TND', symbol: 'TND', label: 'Tunisian Dinar' },
  { code: 'TRY', symbol: '₺', label: 'Turkish Lira' },
  { code: 'TMT', symbol: 'TMT', label: 'Turkmenistani Manat' },
  { code: 'UGX', symbol: 'UGX', label: 'Ugandan Shilling' },
  { code: 'UAH', symbol: '₴', label: 'Ukrainian Hryvnia' },
  { code: 'AED', symbol: 'AED', label: 'United Arab Emirates Dirham' },
  { code: 'UYU', symbol: '$', label: 'Uruguayan Peso' },
  { code: 'USD', symbol: '$', label: 'US Dollar' },
  { code: 'UZS', symbol: 'UZS', label: 'Uzbekistani Som' },
  { code: 'VUV', symbol: 'VUV', label: 'Vanuatu Vatu' },
  { code: 'VES', symbol: 'VES', label: 'Venezuelan Bolívar' },
  { code: 'VND', symbol: '₫', label: 'Vietnamese Dong' },
  { code: 'XOF', symbol: 'F CFA', label: 'West African CFA Franc' },
  { code: 'YER', symbol: 'YER', label: 'Yemeni Rial' },
  { code: 'ZMW', symbol: 'ZK', label: 'Zambian Kwacha' },
  { code: 'ZWG', symbol: 'ZWG', label: 'Zimbabwean Gold' },
] as const satisfies readonly Currency[];

export type CurrencyCode = (typeof CURRENCIES)[number]['code'];

export const DEFAULT_CURRENCY: CurrencyCode = 'SGD';

const FALLBACK: Currency =
  CURRENCIES.find((c) => c.code === DEFAULT_CURRENCY) ?? CURRENCIES[0];

export function currencyMeta(code: string): Currency {
  return CURRENCIES.find((c) => c.code === code) ?? FALLBACK;
}

/**
 * Currencies matching a typed query, best match first.
 *
 * People reach for the code they see on their statement ("MYR"), the country
 * ("Malaysia" — which is in the name), or the symbol they recognise, so all
 * three are searched. An exact code match sorts first: typing "USD" in full
 * and getting the US dollar third would feel broken.
 */
export function searchCurrencies(query: string): readonly Currency[] {
  const q = query.trim().toLowerCase();
  if (!q) return CURRENCIES;
  const hits = CURRENCIES.filter(
    (c) =>
      c.code.toLowerCase().includes(q) ||
      c.label.toLowerCase().includes(q) ||
      c.symbol.toLowerCase() === q
  );
  return [...hits].sort((a, b) => {
    const rank = (c: Currency) => {
      const code = c.code.toLowerCase();
      if (code === q) return 0;
      if (c.symbol.toLowerCase() === q) return 1;
      if (code.startsWith(q)) return 2;
      return 3;
    };
    return rank(a) - rank(b) || a.label.localeCompare(b.label);
  });
}

let active: CurrencyCode = DEFAULT_CURRENCY;

/** Called by `CurrencyProvider`; not intended for direct use elsewhere. */
export function applyCurrency(code: CurrencyCode) {
  active = code;
}

export function activeCurrency(): CurrencyCode {
  return active;
}

/**
 * The symbol to print. `RM` needs a space after it ("RM 32.90") where `$`
 * does not ("$32.90"), so the separator travels with the symbol rather than
 * being guessed at each call site.
 */
export function currencyPrefix(): string {
  const symbol = currencyMeta(active).symbol;
  return /[A-Za-z]$/.test(symbol) ? `${symbol} ` : symbol;
}

export function isCurrencyCode(v: string): v is CurrencyCode {
  return CURRENCIES.some((c) => c.code === v);
}
