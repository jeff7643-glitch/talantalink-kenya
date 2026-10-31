export const kenyanTowns = [
  "Nairobi", "Mombasa", "Kisumu", "Nakuru", "Eldoret", "Thika", "Malindi",
  "Kitale", "Kakamega", "Garissa", "Machakos", "Meru", "Embu", "Kericho",
  "Nyeri", "Naivasha", "Nanyuki", "Narok", "Isiolo", "Lodwar", "Wajir",
  "Mandera", "Marsabit", "Voi", "Kilifi", "Lamu", "Kwale", "Taveta",
  "Hola", "Mwatate", "Bungoma", "Busia", "Siaya", "Homa Bay", "Migori",
  "Kisii", "Nyamira", "Bomet", "Kapsabet", "Iten", "Kabarnet", "Maralal",
  "Kitui", "Mwingi", "Makueni", "Wote", "Murang'a", "Kerugoya", "Karatina",
  "Kiambu", "Ruiru", "Kikuyu", "Limuru", "Kajiado", "Ngong", "Ongata Rongai",
  "Athi River", "Kibwezi", "Chuka", "Runyenjes", "Vihiga", "Webuye", "Mumias",
  "Busia", "Kendu Bay", "Awendo", "Rongo", "Oyugis", "Ahero", "Muhoroni",
  "Gilgil", "Molo", "Njoro", "Ol Kalou", "Engineer", "Rumuruti", "Nyahururu",
  "Kapenguria", "Eldama Ravine", "Sotik", "Litein", "Kajiado", "Kitengela",
] as const;

export function normalizeKenyanPhone(value: string) {
  const digits = value.replace(/[^0-9]/g, "");
  if (/^254[17]\d{8}$/.test(digits)) return `+${digits}`;
  if (/^0[17]\d{8}$/.test(digits)) return `+254${digits.slice(1)}`;
  if (/^[17]\d{8}$/.test(digits)) return `+254${digits}`;
  return null;
}

export function isValidKenyanPhone(value: string) {
  return /^\+254[17]\d{8}$/.test(value);
}
