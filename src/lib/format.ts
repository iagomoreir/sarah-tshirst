const currency = import.meta.env.VITE_CURRENCY || 'EUR'
const moneyFormat = new Intl.NumberFormat('pt-BR', { style: 'currency', currency })
const dateFormat = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

export function formatMoney(cents: number) {
  return moneyFormat.format(cents / 100)
}

export function formatDate(iso: string) {
  return dateFormat.format(new Date(iso))
}

/** Só dígitos, pronto para wa.me */
export function phoneDigits(phone: string) {
  return phone.replace(/\D/g, '')
}
