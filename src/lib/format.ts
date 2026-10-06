const moneyFormat = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })
const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' })

export function formatMoney(cents: number) {
  return moneyFormat.format(cents / 100)
}

/** 25 € sem centavos quando redondo (vitrine) */
export function formatPrice(cents: number) {
  return cents % 100 === 0 ? `${cents / 100}€` : formatMoney(cents)
}

export function formatDate(iso: string) {
  return dateFormat.format(new Date(iso))
}

/** Só dígitos, pronto para wa.me (06... vira 336...) */
export function phoneDigits(phone: string) {
  const digits = phone.replace(/\D/g, '')
  return digits.startsWith('0') && digits.length === 10 ? `33${digits.slice(1)}` : digits
}
