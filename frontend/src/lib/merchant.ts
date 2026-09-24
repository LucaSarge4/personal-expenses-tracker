// Best-effort merchant-name guess for Italian bank statement lines, which
// mix a boilerplate transaction-type prefix, per-transaction reference
// numbers, and the actual merchant/counterparty name in one string, e.g.
// "Pagamento tramite POS 4 1619 PAGAMENTO POS 50,50 EUR DEL 10.01.2026
// A(ITA) ARCAPLANET CARTA 62361063 CAU 98105 NDS 015018923" -> "ARCAPLANET".
//
// This is only a starting point for the user to confirm/edit, not a
// guarantee: it picks the longest alphabetic word that isn't a known
// boilerplate term.
const STOPWORDS = new Set([
  "pagamento",
  "tramite",
  "pos",
  "del",
  "eur",
  "addebito",
  "sdd",
  "disposizione",
  "di",
  "rif",
  "ben",
  "accredito",
  "prelievo",
  "bancomat",
  "altri",
  "istituti",
  "imposta",
  "imposte",
  "bollo",
  "sul",
  "conto",
  "corrente",
  "dpr",
  "carta",
  "cau",
  "nds",
  "istituto",
  "titoli",
  "posizione",
  "tasse",
  "stipendio",
  "bonifico",
  "ordine",
  "ord",
  "trasferimento",
  "liquidita",
  "versamento",
  "commissione",
  "spese",
])

export function guessMerchantSnippet(description: string): string {
  const tokens = description.match(/[A-Za-zÀ-ÖØ-öø-ÿ]+/g) ?? []
  const candidates = tokens.filter((t) => t.length >= 4 && !STOPWORDS.has(t.toLowerCase()))
  if (candidates.length === 0) return description.trim()
  return candidates.reduce((longest, t) => (t.length > longest.length ? t : longest))
}
