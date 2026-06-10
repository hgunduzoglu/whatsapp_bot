/**
 * All user-facing bot texts, in Turkish.
 *
 * Keeping every string here makes the bot's wording easy to customize and
 * keeps flow logic free of copy. Code identifiers stay in English.
 */

export const TEXTS = {
  welcome: [
    'Merhaba! WhatsApp CRM botuna hoş geldiniz.',
    'Botu adım adım öğrenmek için "öğret" yazabilirsiniz (deneme modunda hiçbir şey kaydedilmez).',
  ].join('\n'),
  sessionExpired: 'Oturum zaman aşımına uğradı, ana menüye dönüldü.',
  operationCancelled: 'İşlem iptal edildi.',
  invalidOption: 'Geçersiz seçim. Lütfen listedeki numaralardan birini yazınız.',
  notImplemented: 'Bu bölüm henüz hazır değil.',
  genericError: 'Bir hata oluştu. Lütfen tekrar deneyiniz.',
  help: [
    'Yardım',
    '',
    'Her adımda şu komutları kullanabilirsiniz:',
    '- iptal: mevcut işlemi iptal eder',
    '- geri: bir önceki adıma döner',
    '- ana menü: ana menüye döner',
    '- yardım: bu mesajı gösterir',
    '- öğret: tüm işlemleri kayıt oluşturmadan adım adım öğreten deneme modunu başlatır',
  ].join('\n'),

  mainMenu: [
    'Ana Menü',
    '',
    '1) Müşteri işlemleri',
    '2) Senetlerim',
    '3) Raporlar',
    '4) Son işlemler / düzeltme',
    '5) Yardım',
  ].join('\n'),

  customerMenu: [
    'Müşteri İşlemleri',
    '',
    '1) Müşteri ekle',
    '2) Müşteri seç',
    '3) Müşteri ara',
    '4) Ana menü',
  ].join('\n'),

  customerActions: (label: string): string =>
    [
      `Seçili müşteri: ${label}`,
      '',
      '1) Borç görüntüle',
      '2) Parasal borç ekle',
      '3) İlaç/Gübre borcu ekle',
      '4) Parasal ödeme gir',
      '5) İlaç/Gübre ürün ödemesi gir',
      '6) Fidan siparişi oluştur',
      '7) Fidan borcu ekle',
      '8) Müşteri bilgileri',
      '9) Ana menü',
    ].join('\n'),

  notesMenu: [
    'Senetlerim',
    '',
    '1) Senet ekle',
    '2) Senet görüntüle',
    '3) Yaklaşan senetler',
    '4) Ödenmiş senetler',
    '5) Senet ödendi işaretle',
    '6) Ana menü',
  ].join('\n'),

  reportsMenu: [
    'Raporlar',
    '',
    '1) Günlük özet',
    '2) Haftalık özet',
    '3) Toplam alacaklar',
    '4) Açık ilaç/gübre borçları',
    '5) Yaklaşan fidan teslimleri',
    '6) Yaklaşan senetler',
    '7) Müşteri ekstresi',
    '8) Ana menü',
  ].join('\n'),

  correctionMenu: [
    'Son işlemler / düzeltme',
    '',
    '1) Son işlemleri görüntüle',
    '2) Son işlemi geri al',
    '3) İşlem sil',
    '4) Düzeltme hareketi ekle',
    '5) Ana menü',
  ].join('\n'),

  confirmOptions: ['1) Onayla', '2) İptal'].join('\n'),
  yesNoOptions: ['1) Evet', '2) Hayır'].join('\n'),

  // Customer flows
  askCustomerName: 'Müşteri adını yazınız:',
  invalidCustomerName:
    'Geçersiz isim. İsim harf, sayı, boşluk, tire ve apostrof içerebilir. Lütfen tekrar yazınız:',
  duplicateCustomer: [
    'Bu isimde bir müşteri zaten var.',
    '',
    'Aynı isimli farklı bir müşteri eklemek için ayırt edici bilgi giriniz.',
    'Örnek:',
    '- köy adı',
    '- telefon son 4 hanesi',
    '- mahalle',
    '- baba adı',
  ].join('\n'),
  askIdentifier: 'Ayırt edici bilgiyi yazınız:',
  customerSaved: (label: string): string => `Müşteri kaydedildi: ${label}`,
  askSearchQuery: 'Müşteri adını yazınız:',
  noCustomerMatches: [
    'Eşleşen müşteri bulunamadı. Lütfen tekrar yazınız.',
    '',
    'Vazgeçmek için "iptal", ana menüye dönmek için "ana menü" yazabilirsiniz.',
  ].join('\n'),
  customerMatches: (lines: string[]): string =>
    ['Eşleşen müşteriler:', '', ...lines, '', 'Seçmek için numara yazınız.'].join('\n'),

  // Monetary flows
  askDebtAmount: 'Borç tutarını TL olarak yazınız (örnek: 2.300 veya 1.250,50):',
  askPaymentAmount: 'Ödeme tutarını TL olarak yazınız (örnek: 1.000 veya 500,50):',
  invalidAmount:
    'Geçersiz tutar. Nokta binlik, virgül kuruş ayracıdır. Örnek: 1.500 veya 750,25. Lütfen tekrar yazınız:',
  askDescription: 'Açıklama yazınız veya geçmek için 0 yazınız:',
  debtConfirm: (label: string, amount: string, description: string, date: string): string =>
    [
      `${label} müşterisine ${amount} borç eklenecek.`,
      '',
      `Açıklama: ${description}`,
      `Tarih: ${date}`,
      '',
      '1) Onayla',
      '2) İptal',
    ].join('\n'),
  paymentConfirm: (label: string, amount: string, description: string, date: string): string =>
    [
      `${label} müşterisinden ${amount} parasal ödeme alınacak.`,
      '',
      'Bu ödeme sadece parasal bakiyeden düşer.',
      'İlaç/gübre ürün borçlarını kapatmaz.',
      '',
      `Açıklama: ${description}`,
      `Tarih: ${date}`,
      '',
      '1) Onayla',
      '2) İptal',
    ].join('\n'),
  overpayWarning: (newBalance: string): string =>
    ['Bu ödeme mevcut borçtan fazla.', `İşlem sonrası bakiye ${newBalance} olacak.`].join('\n'),
  debtSaved: 'Borç kaydedildi.',
  paymentSaved: 'Ödeme kaydedildi.',
  noDescription: '-',

  // Product debt flows
  askProductCategory: ['Ürün türü seçiniz:', '', '1) İlaç', '2) Gübre', '3) Diğer'].join('\n'),
  askFirstProductName: 'Ürün adını yazınız. Bitirmek için "bitti" yazınız.',
  askNextProductName: 'Yeni ürün adı yazınız veya bitirmek için "bitti" yazınız.',
  askProductQuantity: (productName: string): string => `${productName} için miktar giriniz:`,
  invalidQuantity:
    'Geçersiz miktar. Pozitif bir sayı giriniz (ondalık için virgül kullanın, örnek: 2,5):',
  askProductUnit: [
    'Birim seçiniz:',
    '',
    '1) adet',
    '2) kg',
    '3) gram',
    '4) litre',
    '5) ml',
    '6) çuval',
    '7) paket',
  ].join('\n'),
  productItemAdded: (line: string): string => ['Eklendi:', line].join('\n'),
  emptyProductList: 'Hiç ürün eklenmedi. İşlem iptal edildi.',
  productDebtConfirm: (label: string, date: string, itemLines: string[]): string =>
    [
      'Kaydedilecek ürün borcu:',
      '',
      `Müşteri: ${label}`,
      `Tarih: ${date}`,
      '',
      ...itemLines,
      '',
      '1) Onayla',
      '2) İptal',
    ].join('\n'),
  productDebtSaved: 'Ürün borcu kaydedildi.',

  // Product payment flows
  noOpenProductDebts: 'Bu müşterinin açık ilaç/gübre borcu yok.',
  openProductDebts: (lines: string[]): string =>
    ['Açık ürün borçları:', '', ...lines, '', 'Kapatılacak ürünü seçiniz:'].join('\n'),
  askPaidQuantity: (productName: string, unit: string): string =>
    `${productName} için kaç ${unit} kapatılacak?`,
  excessiveQuantity: 'Açık miktardan fazla ürün kapatılamaz.',
  askPaymentValue: 'Bu ürün ödemesinin TL değerini giriniz:',
  askMoreProducts: ['Başka ürün kapatmak ister misiniz?', '', '1) Evet', '2) Hayır'].join('\n'),
  productPaymentConfirm: (label: string, lines: string[]): string =>
    [
      `${label} için ürün ödemesi kaydedilecek:`,
      '',
      ...lines,
      '',
      'Bu işlem parasal bakiyeden düşmeyecek.',
      '',
      '1) Onayla',
      '2) İptal',
    ].join('\n'),
  productPaymentSaved: 'Ürün ödemesi kaydedildi.',

  // Seedling order flows
  askPlantName: 'Hangi bitkinin fidesi istendi? Bitki adını yazınız:',
  askSeedGiven: ['Müşteri tohum verdi mi?', '', '1) Evet', '2) Hayır'].join('\n'),
  askSeedPlantName: 'Hangi bitkiden tohum verdi? Bitki adını yazınız:',
  askSeedUnit: ['Tohum miktar birimi seçiniz:', '', '1) zarf', '2) gram'].join('\n'),
  askSeedAmount: 'Tohum miktarını giriniz:',
  askPickupDate: [
    'Teslim almak istediği tarihi seçiniz:',
    '',
    '1) 10 gün sonra',
    '2) 14 gün sonra',
    '3) 20 gün sonra',
    '4) 30 gün sonra',
    '5) 45 gün sonra',
    '6) Elle tarih gir',
  ].join('\n'),
  pickupDateInPast: 'Fidan teslim tarihi geçmiş bir tarih olamaz. Lütfen tekrar seçiniz.',
  seedlingOrderConfirm: (
    label: string,
    plant: string,
    seedInfo: string,
    pickupDate: string,
    note: string,
  ): string =>
    [
      `${label} için fidan siparişi kaydedilecek:`,
      '',
      `Bitki: ${plant}`,
      `Tohum: ${seedInfo}`,
      `Teslim tarihi: ${pickupDate}`,
      `Açıklama: ${note}`,
      '',
      '1) Onayla',
      '2) İptal',
    ].join('\n'),
  seedlingOrderSaved: 'Fidan siparişi kaydedildi. Teslimden 3 gün önce hatırlatma yapılacak.',
  seedNotGiven: 'Vermedi',
  seedGivenInfo: (plant: string, amount: string, unit: string): string =>
    `${plant} - ${amount} ${unit}`,

  // Seedling debt flows
  askRelatedOrder: (lines: string[]): string =>
    [
      'İlgili fidan siparişini seçiniz veya siparişsiz devam etmek için 0 yazınız:',
      '',
      ...lines,
    ].join('\n'),
  askSeedlingDebtPlant: 'Bitki adını yazınız:',
  askSeedlingUnitPrice: 'Fide adet ücretini TL olarak yazınız (örnek: 5 veya 4,50):',
  askSeedlingCount: 'Alınan fide sayısını yazınız:',
  invalidCount: 'Geçersiz sayı. Pozitif bir tam sayı giriniz:',
  seedlingDebtConfirm: (
    label: string,
    plant: string,
    unitPrice: string,
    count: number,
    total: string,
    date: string,
  ): string =>
    [
      `${label} müşterisine fidan borcu eklenecek:`,
      '',
      `${plant} fidesi`,
      `Adet ücreti: ${unitPrice}`,
      `Adet: ${count}`,
      `Toplam: ${total}`,
      `Tarih: ${date}`,
      '',
      '1) Onayla',
      '2) İptal',
    ].join('\n'),
  seedlingDebtSaved: (total: string): string =>
    `Fidan borcu parasal borç olarak kaydedildi: ${total}`,

  // Promissory note flows
  askPayeeName: 'Senet kime ödenecek? Kişi/kurum adını yazınız:',
  askNoteAmount: 'Senet tutarını TL olarak yazınız:',
  askDueDate: [
    'Ödeme tarihini seçiniz:',
    '',
    '1) 10 gün sonra',
    '2) 14 gün sonra',
    '3) 20 gün sonra',
    '4) 30 gün sonra',
    '5) 45 gün sonra',
    '6) Elle tarih gir',
  ].join('\n'),
  pastDueDateWarning: ['Bu tarih geçmiş bir tarih.', 'Yine de kaydetmek istiyor musunuz?', '', '1) Evet', '2) Hayır'].join(
    '\n',
  ),
  noteConfirm: (payee: string, amount: string, dueDate: string, note: string): string =>
    [
      'Senet kaydedilecek:',
      '',
      `Alacaklı: ${payee}`,
      `Tutar: ${amount}`,
      `Ödeme tarihi: ${dueDate}`,
      `Açıklama: ${note}`,
      '',
      '1) Onayla',
      '2) İptal',
    ].join('\n'),
  noteSaved: 'Senet kaydedildi. 3 gün ve 1 gün kala hatırlatma yapılacak.',
  noNotes: 'Kayıtlı senet yok.',
  noUpcomingNotes: 'Önümüzdeki 30 gün içinde ödenecek senet yok.',
  noPaidNotes: 'Ödenmiş senet yok.',
  notesHeader: 'Senetler:',
  upcomingNotesHeader: 'Yaklaşan senetler:',
  paidNotesHeader: 'Ödenmiş senetler:',
  askNoteToMarkPaid: (lines: string[]): string =>
    ['Açık senetler:', '', ...lines, '', 'Ödendi işaretlenecek senedi seçiniz:'].join('\n'),
  noteMarkPaidConfirm: (payee: string, amount: string, dueDate: string): string =>
    [
      'Bu senet ödendi olarak işaretlenecek:',
      '',
      `Alacaklı: ${payee}`,
      `Tutar: ${amount}`,
      `Ödeme tarihi: ${dueDate}`,
      '',
      '1) Onayla',
      '2) İptal',
    ].join('\n'),
  noteMarkedPaid: 'Senet ödendi olarak işaretlendi.',

  // Reports
  statementRangeOptions: [
    'Tarih aralığı seçiniz:',
    '',
    '1) Son 7 gün',
    '2) Son 30 gün',
    '3) Tüm geçmiş',
    '4) Elle tarih aralığı gir',
  ].join('\n'),

  // Manual date entry
  askDay: 'Gün giriniz (örnek: 22):',
  askMonth: 'Ay giriniz (örnek: 03):',
  askYear: 'Yıl giriniz (örnek: 2026):',
  invalidDate: 'Geçersiz tarih. Lütfen tekrar giriniz.',
  invalidDay: 'Geçersiz gün. 1 ile 31 arasında bir sayı giriniz:',
  invalidMonth: 'Geçersiz ay. 1 ile 12 arasında bir sayı giriniz:',
  invalidYear: 'Geçersiz yıl. Örnek: 2026',

  // Corrections
  noRecentTransactions: 'Kayıtlı işlem bulunamadı.',
  recentTransactionsHeader: 'Son işlemler:',
  undoConfirm: (description: string): string =>
    ['Son işlem:', '', description, '', 'Bu işlemi geri almak istiyor musunuz?', '', '1) Evet, geri al', '2) Hayır'].join(
      '\n',
    ),
  undoDone: 'İşlem geri alındı.',
  askDeletePick: (lines: string[]): string =>
    ['Son işlemler:', '', ...lines, '', 'Silinecek işlemi seçiniz:'].join('\n'),
  askDeleteReason: 'Silme sebebini yazınız:',
  deleteReasonRequired: 'Silme sebebi zorunludur. Lütfen sebep yazınız:',
  deleteConfirm: (description: string): string =>
    ['Bu işlem silinecek:', '', description, '', '1) Onayla', '2) İptal'].join('\n'),
  deleteDone: 'İşlem silindi.',
  adjustDirection: ['Düzeltme türü:', '', '1) Borç artır', '2) Borç azalt'].join('\n'),
  askAdjustAmount: 'Düzeltme tutarını TL olarak yazınız:',
  askAdjustReason: 'Düzeltme sebebini yazınız:',
  adjustConfirm: (label: string, direction: string, amount: string, reason: string): string =>
    [
      `${label} için düzeltme kaydedilecek:`,
      '',
      `Tür: ${direction}`,
      `Tutar: ${amount}`,
      `Sebep: ${reason}`,
      '',
      '1) Onayla',
      '2) İptal',
    ].join('\n'),
  adjustSaved: 'Düzeltme kaydedildi.',
  cannotVoidPurchaseWithPayments:
    'Bu ürün borcunun üzerinde ödeme var. Önce ilgili ürün ödemesini geri alınız.',

  // Reminders
  promissoryNoteReminder: (payee: string, amount: string, daysLeft: number, dueDate: string): string =>
    [
      'Senet hatırlatması:',
      `${payee} için ${amount} senedin ödemesine ${daysLeft} gün kaldı.`,
      '',
      `Ödeme tarihi: ${dueDate}`,
    ].join('\n'),
  seedlingReminder: (label: string, plant: string, pickupDate: string): string =>
    [
      'Hatırlatma:',
      `${label} kişisi ${plant} fidesini 3 gün sonraya istiyor.`,
      '',
      `Teslim tarihi: ${pickupDate}`,
    ].join('\n'),
};

/** Unit labels in Turkish, keyed by the QuantityUnit enum. */
export const UNIT_LABELS: Record<string, string> = {
  PIECE: 'adet',
  KG: 'kg',
  GRAM: 'gram',
  LITER: 'litre',
  ML: 'ml',
  SACK: 'çuval',
  PACKAGE: 'paket',
};

/** Seed unit labels in Turkish, keyed by the SeedUnit enum. */
export const SEED_UNIT_LABELS: Record<string, string> = {
  ENVELOPE: 'zarf',
  GRAM: 'gram',
};
