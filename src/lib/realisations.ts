// Fotos de trabalhos da Sarah (public/img/realisations, 640 e 1200 px em WebP)
export type Photo = { name: string; alt: string; caption: string; ratio: number }

export const photoSrc = (name: string, w: 640 | 1200 = 1200) => `/img/realisations/${name}-${w}.webp`
export const photoSrcSet = (name: string) => `${photoSrc(name, 640)} 640w, ${photoSrc(name, 1200)} 1200w`

export const HERO_PHOTOS: (Photo & { label: string })[] = [
  { name: 'sweat-sable-face-sgt', label: 'Sable', alt: 'Sweat à capuche Sable avec insigne, grade et nom sur la poitrine, drapeaux sur les manches', caption: '', ratio: 1023 / 1537 },
  { name: 'sweat-vert-face-mdl', label: 'Vert armée', alt: 'Sweat à capuche Vert armée avec insigne, grade et nom, drapeaux sur les manches', caption: '', ratio: 1023 / 1537 },
]

export const GALLERY: Photo[] = [
  { name: 'sweat-vert-dos-fg1b', alt: 'Dos de sweat Vert armée avec un grand visuel FG1B', caption: 'FG1B, sweat à capuche Vert armée', ratio: 1023 / 1537 },
  { name: 'tshirt-sable-saint-michel', alt: 'T-shirt Sable porté, visuel Saint Michel au dos, drapeaux sur les manches', caption: 'Saint Michel, T-shirt Sable', ratio: 1200 / 960 },
  { name: 'tshirt-vert-marche-ou-creve', alt: 'T-shirt Vert armée, visuel Marche ou crève au dos', caption: 'Marche ou crève, T-shirt Vert armée', ratio: 1024 / 1536 },
  { name: 'tshirt-sable-section-boulandet', alt: 'T-shirt Sable devant et dos, visuel de la section Boulandet', caption: 'Section Boulandet, devant et dos', ratio: 1086 / 1448 },
  { name: 'tshirt-sable-dos-fged', alt: 'Dos de T-shirt Sable avec l’écusson FGED', caption: 'FGED, T-shirt Sable', ratio: 1200 / 800 },
  { name: 'tshirt-sable-monitorat-dos', alt: 'Dos de T-shirt Sable, visuel Monitorat ISTC', caption: 'Monitorat ISTC, dos', ratio: 1024 / 1536 },
  { name: 'sweat-sable-dos-fg1b', alt: 'Dos de sweat Sable avec le visuel FG1B', caption: 'FG1B, sweat à capuche Sable', ratio: 1023 / 1537 },
  { name: 'tshirt-sable-monitorat-face', alt: 'Devant de T-shirt Sable, inscription Monitorat ISTC', caption: 'Monitorat ISTC, devant', ratio: 1024 / 1536 },
]
