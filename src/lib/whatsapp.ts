import { phoneDigits } from './format'

export const STORE_WHATSAPP = import.meta.env.VITE_WHATSAPP_NUMBER || '33695571640'
export const STORE_EMAIL = 'sarahnanicreations@gmail.com'
export const INSTAGRAM_URL = 'https://www.instagram.com/sarahnanicreations'

export function whatsappLink(number: string, text: string) {
  return `https://wa.me/${phoneDigits(number)}?text=${encodeURIComponent(text)}`
}
